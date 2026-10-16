/**
 * canvas 检测可视化渲染
 *
 * 绘制内容：
 * - 绿色矩形包围框
 * - 人物中心蓝色空心圆
 * - 半透明黑色标签：PERSON + 置信度 / 目标X 近|远
 */
import { COLORS, NEAR_BOX_HEIGHT_RATIO } from '../config';
import type { Detection, RawDetection } from '../types';
import { computeCover, computeLetterbox, mapBoxToDisplay, mapCenterToDisplay } from './geometry';

const LABEL_LINE_HEIGHT = 18;
const LABEL_PADDING_X = 7;
const LABEL_TAG_WIDTH = 118;
const LABEL_TAG_HEIGHT = LABEL_LINE_HEIGHT * 2 + 8;
const FONT = "13px 'Segoe UI', 'Microsoft YaHei', sans-serif";

export interface RenderOptions {
  displayWidth: number;
  displayHeight: number;
  mirrored: boolean;
}

/**
 * 将原始检测结果映射到显示空间，
 * 按画面从左到右分配序号并完成远近判定
 */
export function buildDetections(
  rawDetections: RawDetection[],
  videoWidth: number,
  videoHeight: number,
  options: RenderOptions,
): Detection[] {
  const letterbox = computeLetterbox(videoWidth, videoHeight);
  const cover = computeCover(videoWidth, videoHeight, options.displayWidth, options.displayHeight);

  const mapped = rawDetections.map((raw) => {
    const box = mapBoxToDisplay(
      raw.box,
      letterbox,
      cover,
      options.displayWidth,
      options.displayHeight,
      options.mirrored,
    );
    // 模型空间中心点 -> 显示空间中心
    const modelCenterX = raw.box.x + raw.box.width / 2;
    const modelCenterY = raw.box.y + raw.box.height / 2;
    const center = mapCenterToDisplay(
      modelCenterX,
      modelCenterY,
      letterbox,
      cover,
      options.displayWidth,
      options.mirrored,
    );
    const near = box.height / options.displayHeight >= NEAR_BOX_HEIGHT_RATIO;
    return { score: raw.score, box, center, near };
  });

  // 按画面横坐标从左到右稳定编号
  mapped.sort((a, b) => a.center.x - b.center.x);

  return mapped.map((item, index) => ({
    id: index + 1,
    score: item.score,
    box: item.box,
    center: item.center,
    near: item.near,
  }));
}

/** 清空并绘制当前帧全部检测目标 */
export function renderDetections(
  ctx: CanvasRenderingContext2D,
  detections: Detection[],
): void {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = FONT;
  ctx.textBaseline = 'middle';

  for (const detection of detections) {
    drawBox(ctx, detection);
    drawCenterMarker(ctx, detection.center.x, detection.center.y);
    drawLabel(ctx, detection);
  }

  ctx.restore();
}

/** 绿色矩形包围框 */
function drawBox(ctx: CanvasRenderingContext2D, detection: Detection): void {
  const { x, y, width, height } = detection.box;
  ctx.strokeStyle = COLORS.boxStroke;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
}

/** 人物中心蓝色空心圆 */
function drawCenterMarker(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.centerMarker;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 半透明黑底白字标签（两行） */
function drawLabel(ctx: CanvasRenderingContext2D, detection: Detection): void {
  const { x, y, width } = detection.box;

  // 标签宽度取框宽与预设宽度的较大者，避免文字被裁剪
  const tagWidth = Math.max(width, LABEL_TAG_WIDTH);
  const tagHeight = LABEL_TAG_HEIGHT;

  // 默认贴在框上方，空间不足时移入框内顶部
  let tagY = y - tagHeight;
  if (tagY < 4) {
    tagY = y + 4;
  }
  const tagX = x;

  ctx.fillStyle = COLORS.tagBackground;
  ctx.fillRect(tagX, tagY, tagWidth, tagHeight);

  const confidencePercent = Math.round(detection.score * 100);
  const distanceText = detection.near ? '近' : '远';

  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.fillText(
    `PERSON ${confidencePercent}%`,
    tagX + LABEL_PADDING_X,
    tagY + LABEL_LINE_HEIGHT / 2 + 3,
  );
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(
    `目标${detection.id} ${distanceText}`,
    tagX + LABEL_PADDING_X,
    tagY + LABEL_LINE_HEIGHT + LABEL_LINE_HEIGHT / 2 + 3,
  );
}
