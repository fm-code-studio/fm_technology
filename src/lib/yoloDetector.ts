/**
 * YOLOv8n ONNX 推理封装（onnxruntime-web，纯浏览器本地推理）
 *
 * - 输入：images  float32[1, 3, 640, 640]，RGB 三通道，值域 0~1，letterbox 填充
 * - 输出：output0 float32[1, 84, 8400]
 *         每个候选点 = cx, cy, w, h（640 空间）+ 80 个 COCO 类别置信度
 * - 只保留 person（类别 0），并在 JS 层执行 NMS
 */
import * as ort from 'onnxruntime-web';
import {
  CONFIDENCE_THRESHOLD,
  FETCH_STALL_TIMEOUT_MS,
  FETCH_TOTAL_TIMEOUT_MS,
  IOU_THRESHOLD,
  MODEL_CDN_URLS,
  MODEL_FALLBACK_URL,
  MODEL_INPUT_SIZE,
  ORT_CDN_DIST_PATH,
  ORT_WASM_PATHS,
  PERSON_CLASS_ID,
} from '../config';
import type { RawDetection } from '../types';
import { computeLetterbox, iou } from './geometry';

/** 模型下载进度回调，progress 为 0~1 */
export type LoadProgressCallback = (progress: number) => void;

export class YoloV8Detector {
  private session: ort.InferenceSession | null = null;
  /** 预处理画布（640x640，复用避免重复申请内存） */
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;

  constructor() {
    // 固定单线程：该模型在 CPU 上的多线程推理并无收益（实测 4 线程与 1 线程耗时相当），
    // 且线程化 wasm 构建在实例化时会触发流式编译降级告警
    ort.env.wasm.numThreads = 1;

    this.canvas = document.createElement('canvas');
    this.canvas.width = MODEL_INPUT_SIZE;
    this.canvas.height = MODEL_INPUT_SIZE;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('无法创建 2D 画布上下文');
    }
    this.context = ctx;
  }

  /** 模型是否已加载完成 */
  get ready(): boolean {
    return this.session !== null;
  }

  /**
   * 加载模型
   *
   * 顺序：jsDelivr 各加速节点 -> 本地 /models 兜底。
   * 同时依据模型实际来源决定 wasm 运行时的加载位置：
   * 走 CDN 时 wasm 也取自同一 jsDelivr 主机（Netlify 无法稳定传输大文件），
   * 走本地兜底时 wasm 取自同站 /ort/。
   */
  async load(onProgress?: LoadProgressCallback): Promise<void> {
    if (this.session) {
      return;
    }

    let buffer: ArrayBuffer | null = null;
    let wasmPaths = ORT_WASM_PATHS;

    // 依次尝试 jsDelivr 各加速节点
    for (const url of MODEL_CDN_URLS) {
      try {
        buffer = await this.fetchModel(url, onProgress);
        wasmPaths = new URL(url).origin + ORT_CDN_DIST_PATH;
        break;
      } catch (cdnError) {
        console.warn(`模型节点加载失败：${url}`, cdnError);
        onProgress?.(0);
      }
    }

    // 全部 CDN 失败时回退本地同站模型
    if (!buffer) {
      buffer = await this.fetchModel(MODEL_FALLBACK_URL, onProgress);
    }

    ort.env.wasm.wasmPaths = wasmPaths;

    this.session = await ort.InferenceSession.create(buffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    onProgress?.(1);
  }

  /**
   * 下载模型文件并回报下载进度
   *
   * 带两级超时保护，避免被阻断或停滞的节点把加载永久卡住：
   * - 停顿超时：连续超过 FETCH_STALL_TIMEOUT_MS 没有收到新数据即中止
   * - 总时长上限：超过 FETCH_TOTAL_TIMEOUT_MS 直接中止
   * 同时对响应长度做校验，把被截断的响应识别为失败，交给下一个来源重试。
   */
  private async fetchModel(url: string, onProgress?: LoadProgressCallback): Promise<ArrayBuffer> {
    const controller = new AbortController();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let totalTimer: ReturnType<typeof setTimeout> | undefined;

    /** 重新计时：只要还在持续收到数据就不断延后停顿判定 */
    const armStallTimer = (): void => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(), FETCH_STALL_TIMEOUT_MS);
    };
    const clearTimers = (): void => {
      clearTimeout(stallTimer);
      clearTimeout(totalTimer);
    };

    totalTimer = setTimeout(() => controller.abort(), FETCH_TOTAL_TIMEOUT_MS);
    armStallTimer();

    try {
      const response = await fetch(url, { mode: 'cors', signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${url}`);
      }

      const total = Number(response.headers.get('content-length') ?? 0);
      if (!response.body || total <= 0) {
        // 无法获取长度时直接整体下载，交由总时长上限保护
        const arrayBuffer = await response.arrayBuffer();
        onProgress?.(1);
        return arrayBuffer;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        armStallTimer();
        if (value) {
          chunks.push(value);
          received += value.length;
          // Content-Length 可能是压缩后大小（CDN 常返回 br/gzip），
          // 而 reader 读出的是解压后字节，故比例需钳制在 1 以内
          onProgress?.(Math.min(received / total, 1));
        }
      }

      // 长度不足说明传输被截断（部分网络下大文件会被中途切断），判定为失败
      if (received < total) {
        throw new Error(`响应被截断：${received}/${total} ${url}`);
      }

      const result = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result.buffer;
    } finally {
      clearTimers();
    }
  }

  /**
   * 对当前视频帧执行人物检测
   * @returns 模型输入空间（640x640）下的检测结果
   */
  async detect(video: HTMLVideoElement): Promise<RawDetection[]> {
    if (!this.session) {
      throw new Error('模型尚未加载');
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    if (videoWidth === 0 || videoHeight === 0) {
      return [];
    }

    const { input } = this.preprocess(video, videoWidth, videoHeight);
    const tensor = new ort.Tensor('float32', input, [
      1,
      3,
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
    ]);

    const inputName = this.session.inputNames[0];
    const outputName = this.session.outputNames[0];
    const feeds: Record<string, ort.Tensor> = { [inputName]: tensor };
    const results = await this.session.run(feeds);
    const output = results[outputName];

    return this.decode(output);
  }

  /** 将视频帧按 letterbox 绘制到 640x640 画布，并转换为 NCHW float32 */
  private preprocess(
    video: HTMLVideoElement,
    videoWidth: number,
    videoHeight: number,
  ): { input: Float32Array; letterbox: ReturnType<typeof computeLetterbox> } {
    const letterbox = computeLetterbox(videoWidth, videoHeight);

    // YOLO 标准填充色 (114,114,114)
    this.context.fillStyle = '#727272';
    this.context.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    this.context.drawImage(
      video,
      letterbox.padX,
      letterbox.padY,
      videoWidth * letterbox.scale,
      videoHeight * letterbox.scale,
    );

    const { data: rgba } = this.context.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    const input = new Float32Array(3 * pixelCount);
    const redOffset = 0;
    const greenOffset = pixelCount;
    const blueOffset = pixelCount * 2;

    // RGBA Uint8 -> R/G/B 三个平面，归一化到 0~1
    for (let p = 0, i = 0; p < rgba.length; p += 4, i += 1) {
      input[redOffset + i] = rgba[p] / 255;
      input[greenOffset + i] = rgba[p + 1] / 255;
      input[blueOffset + i] = rgba[p + 2] / 255;
    }

    return { input, letterbox };
  }

  /**
   * 解析 [1,84,8400] 输出：过滤 person 候选 -> 置信度筛选 -> NMS
   */
  private decode(output: ort.Tensor): RawDetection[] {
    const data = output.data as Float32Array;
    const candidateCount = output.dims[2];
    const stride = candidateCount;
    const classOffset = 4 * stride;

    const candidates: RawDetection[] = [];

    for (let i = 0; i < candidateCount; i += 1) {
      const score = data[classOffset + PERSON_CLASS_ID * stride + i];
      if (score < CONFIDENCE_THRESHOLD) {
        continue;
      }

      const cx = data[i];
      const cy = data[stride + i];
      const width = data[2 * stride + i];
      const height = data[3 * stride + i];

      candidates.push({
        score,
        box: {
          x: cx - width / 2,
          y: cy - height / 2,
          width,
          height,
        },
      });
    }

    // 置信度从高到低，贪心 NMS
    candidates.sort((a, b) => b.score - a.score);
    const kept: RawDetection[] = [];
    for (const candidate of candidates) {
      const suppressed = kept.some((existing) => iou(existing.box, candidate.box) > IOU_THRESHOLD);
      if (!suppressed) {
        kept.push(candidate);
      }
    }

    return kept;
  }
}
