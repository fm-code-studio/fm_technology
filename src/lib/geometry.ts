/**
 * 坐标换算工具
 *
 * 涉及三个坐标空间：
 * 1. model   ：YOLO 输入空间 640x640（letterbox 填充后的正方形）
 * 2. video   ：摄像头原始视频帧空间 videoWidth x videoHeight
 * 3. display ：canvas CSS 像素空间（画面以 cover 方式铺满容器）
 */
import type { BoundingBox } from '../types';
import { MODEL_INPUT_SIZE } from '../config';

/** letterbox 参数：视频帧 -> 模型输入 */
export interface Letterbox {
  /** 缩放比例 */
  scale: number;
  /** x 方向填充像素 */
  padX: number;
  /** y 方向填充像素 */
  padY: number;
}

/** cover 参数：视频帧 -> 显示画面 */
export interface CoverTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** 计算 letterbox（保持宽高比，短边居中填充） */
export function computeLetterbox(videoWidth: number, videoHeight: number): Letterbox {
  const scale = Math.min(MODEL_INPUT_SIZE / videoWidth, MODEL_INPUT_SIZE / videoHeight);
  const scaledWidth = videoWidth * scale;
  const scaledHeight = videoHeight * scale;
  return {
    scale,
    padX: (MODEL_INPUT_SIZE - scaledWidth) / 2,
    padY: (MODEL_INPUT_SIZE - scaledHeight) / 2,
  };
}

/** 计算 object-fit: cover 方式下视频到容器的变换 */
export function computeCover(
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number,
): CoverTransform {
  const scale = Math.max(displayWidth / videoWidth, displayHeight / videoHeight);
  const scaledWidth = videoWidth * scale;
  const scaledHeight = videoHeight * scale;
  return {
    scale,
    offsetX: (displayWidth - scaledWidth) / 2,
    offsetY: (displayHeight - scaledHeight) / 2,
  };
}

/** 模型空间包围框 -> 显示空间包围框 */
export function mapBoxToDisplay(
  box: BoundingBox,
  letterbox: Letterbox,
  cover: CoverTransform,
  displayWidth: number,
  displayHeight: number,
  mirrored: boolean,
): BoundingBox {
  // model -> video（去除 letterbox 填充并还原缩放，裁剪到视频范围内）
  const vx = (box.x - letterbox.padX) / letterbox.scale;
  const vy = (box.y - letterbox.padY) / letterbox.scale;
  const vw = box.width / letterbox.scale;
  const vh = box.height / letterbox.scale;

  // video -> display
  let x = vx * cover.scale + cover.offsetX;
  const y = vy * cover.scale + cover.offsetY;
  const width = vw * cover.scale;
  const height = vh * cover.scale;

  // 前置摄像头画面水平镜像
  if (mirrored) {
    x = displayWidth - x - width;
  }

  return {
    x: clamp(x, 0, displayWidth),
    y: clamp(y, 0, displayHeight),
    width: clamp(width, 0, displayWidth),
    height: clamp(height, 0, displayHeight),
  };
}

/** 模型空间中心点 -> 显示空间中心点 */
export function mapCenterToDisplay(
  modelX: number,
  modelY: number,
  letterbox: Letterbox,
  cover: CoverTransform,
  displayWidth: number,
  mirrored: boolean,
): { x: number; y: number } {
  const vx = (modelX - letterbox.padX) / letterbox.scale;
  const vy = (modelY - letterbox.padY) / letterbox.scale;
  const x = vx * cover.scale + cover.offsetX;
  const y = vy * cover.scale + cover.offsetY;
  return mirrored ? { x: displayWidth - x, y } : { x, y };
}

/** 两个包围框的交并比 */
export function iou(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const interX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const interY = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const interArea = interX * interY;
  const unionArea = a.width * a.height + b.width * b.height - interArea;
  return unionArea === 0 ? 0 : interArea / unionArea;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
