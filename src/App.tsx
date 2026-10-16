/**
 * 应用主组件
 *
 * 职责：
 * 1. 加载 YOLOv8n ONNX 模型（CDN 优先、本地兜底）
 * 2. 管理摄像头开关与镜头切换
 * 3. 运行 requestAnimationFrame 检测循环：视频帧 -> 推理 -> canvas 绘制
 * 4. 组合视频层与 HUD 覆盖层
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DetectorStage } from './components/DetectorStage';
import { Hud } from './components/Hud';
import { useCamera } from './hooks/useCamera';
import { useCompass } from './hooks/useCompass';
import { buildDetections, renderDetections } from './lib/renderer';
import { YoloV8Detector } from './lib/yoloDetector';
import type { DetectionStats } from './types';

/** FPS 指数滑动平均系数 */
const FPS_EMA_ALPHA = 0.1;
/** HUD 状态刷新间隔（毫秒），避免每帧触发 React 渲染 */
const STATS_INTERVAL_MS = 250;

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<YoloV8Detector | null>(null);

  const [modelReady, setModelReady] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelError, setModelError] = useState<string | null>(null);
  const [stats, setStats] = useState<DetectionStats>({ count: 0, fps: 0 });

  const { status, error, facing, canSwitch, start, stop, switchCamera } = useCamera(videoRef);
  const heading = useCompass();

  // 模型加载（仅一次）：jsDelivr 加速直链，失败自动回退本地模型
  useEffect(() => {
    const detector = new YoloV8Detector();
    detectorRef.current = detector;
    detector
      .load(setModelProgress)
      .then(() => setModelReady(true))
      .catch((err: unknown) => {
        console.error(err);
        setModelError('模型加载失败，请检查网络后刷新页面');
      });
  }, []);

  /**
   * 检测主循环
   * 仅在模型就绪且摄像头运行时工作；上一帧推理未结束则跳过本帧
   */
  useEffect(() => {
    if (!modelReady || status !== 'running') {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;
    if (!video || !canvas || !detector) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    let rafId = 0;
    let cancelled = false;
    let busy = false;
    let fps = 0;
    let lastStatsPush = performance.now();
    let lastCount = 0;

    /** 将 canvas 物理分辨率对齐到 CSS 尺寸（高分屏清晰） */
    const resizeCanvas = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const tick = async (now: number): Promise<void> => {
      if (cancelled) {
        return;
      }
      rafId = requestAnimationFrame((t) => void tick(t));

      if (busy || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }
      busy = true;
      const frameStart = performance.now();

      try {
        resizeCanvas();
        const cssWidth = canvas.width / Math.min(window.devicePixelRatio || 1, 2);
        const cssHeight = canvas.height / Math.min(window.devicePixelRatio || 1, 2);

        const rawDetections = await detector.detect(video);
        if (cancelled) {
          return;
        }

        const mirrored = facing === 'user';
        const detections = buildDetections(
          rawDetections,
          video.videoWidth,
          video.videoHeight,
          { displayWidth: cssWidth, displayHeight: cssHeight, mirrored },
        );

        context.clearRect(0, 0, cssWidth, cssHeight);
        renderDetections(context, detections);
        lastCount = detections.length;

        const frameMs = performance.now() - frameStart;
        if (frameMs > 0) {
          const instantFps = 1000 / frameMs;
          fps = fps === 0 ? instantFps : fps * (1 - FPS_EMA_ALPHA) + instantFps * FPS_EMA_ALPHA;
        }

        if (now - lastStatsPush >= STATS_INTERVAL_MS) {
          lastStatsPush = now;
          setStats({ count: lastCount, fps });
        }
      } catch (err) {
        console.error('检测循环异常：', err);
      } finally {
        busy = false;
      }
    };

    const onResize = (): void => resizeCanvas();
    window.addEventListener('resize', onResize);
    resizeCanvas();
    rafId = requestAnimationFrame((t) => void tick(t));

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      context.clearRect(0, 0, canvas.width, canvas.height);
      setStats({ count: 0, fps: 0 });
    };
  }, [modelReady, status, facing]);

  const handleToggleCamera = useCallback(() => {
    if (status === 'running') {
      stop();
    } else {
      void start();
    }
  }, [start, status, stop]);

  const handleSwitchCamera = useCallback(() => {
    void switchCamera();
  }, [switchCamera]);

  const showLoadingModel = !modelReady && !modelError;
  const cameraOff = status === 'idle' || status === 'stopped';
  /** 展示用加载百分比，钳制在 0~100 之间 */
  const loadPercent = Math.min(100, Math.round(modelProgress * 100));

  return (
    <div className="app">
      <DetectorStage videoRef={videoRef} canvasRef={canvasRef} mirrored={facing === 'user'} />

      {modelReady && (
        <Hud
          status={status}
          targetCount={stats.count}
          fps={stats.fps}
          heading={heading}
          canSwitch={canSwitch}
          onToggleCamera={handleToggleCamera}
          onSwitchCamera={handleSwitchCamera}
        />
      )}

      {/* 模型加载遮罩 */}
      {showLoadingModel && (
        <div className="overlay">
          <div className="overlay-title">模型加载中</div>
          <div className="overlay-subtitle">YOLOv8n · ONNX Web 本地推理</div>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${loadPercent}%` }} />
          </div>
          <div className="overlay-progress">{loadPercent}%</div>
        </div>
      )}

      {/* 模型加载失败 */}
      {modelError && (
        <div className="overlay">
          <div className="overlay-title">{modelError}</div>
          <button type="button" className="hud-button is-primary" onClick={() => location.reload()}>
            重新加载
          </button>
        </div>
      )}

      {/* 摄像头关闭/错误提示 */}
      {modelReady && cameraOff && !error && (
        <div className="overlay is-compact">
          <div className="overlay-title">摄像头未开启</div>
          <button type="button" className="hud-button is-primary" onClick={() => void start()}>
            开启摄像头
          </button>
        </div>
      )}
      {modelReady && error && (
        <div className="overlay is-compact">
          <div className="overlay-title overlay-error">{error}</div>
          <button type="button" className="hud-button is-primary" onClick={() => void start()}>
            重试
          </button>
        </div>
      )}
    </div>
  );
}
