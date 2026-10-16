/**
 * 抬头显示层（HUD）
 *
 * - 顶部：品牌标题、状态圆点、目标总数 N TARGETS、摄像头控制按钮
 * - 底部：方位角 / GPS 无信号；左下品牌水印；右下模型与实时 FPS
 * 风格：半透明黑底白字，绿色强调色，无多余装饰动画
 */
import { BRAND_NAME, GPS_STATUS_TEXT } from '../config';
import type { CameraStatus } from '../types';

interface HudProps {
  status: CameraStatus;
  targetCount: number;
  fps: number;
  heading: number;
  canSwitch: boolean;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
}

/** 顶部状态圆点颜色随摄像头状态切换 */
function statusDotClass(status: CameraStatus): string {
  if (status === 'running') {
    return 'status-dot is-running';
  }
  if (status === 'starting') {
    return 'status-dot is-starting';
  }
  return 'status-dot';
}

export function Hud({
  status,
  targetCount,
  fps,
  heading,
  canSwitch,
  onToggleCamera,
  onSwitchCamera,
}: HudProps) {
  const cameraRunning = status === 'running';
  const cameraBusy = status === 'starting';
  const targetLabel = String(targetCount).padStart(2, '0');

  return (
    <div className="hud" aria-hidden={false}>
      {/* 顶部状态栏 */}
      <header className="hud-top">
        <div className="brand">
          <span className={statusDotClass(status)} />
          <span className="brand-name">{BRAND_NAME}</span>
        </div>

        <div className="target-count">
          <span className="target-number">{targetLabel}</span>
          <span className="target-unit">TARGETS</span>
        </div>

        <div className="top-actions">
          <button
            type="button"
            className="hud-button"
            onClick={onSwitchCamera}
            disabled={!cameraRunning || cameraBusy || !canSwitch}
          >
            切换镜头
          </button>
          <button
            type="button"
            className={cameraRunning ? 'hud-button is-danger' : 'hud-button is-primary'}
            onClick={onToggleCamera}
            disabled={cameraBusy}
          >
            {cameraRunning ? '关闭摄像头' : '开启摄像头'}
          </button>
        </div>
      </header>

      {/* 底部信息栏 */}
      <footer className="hud-bottom">
        <div className="watermark">{BRAND_NAME}</div>

        <div className="telemetry">
          <span>方位角 {heading.toFixed(1)}°</span>
          <span className="telemetry-divider" />
          <span>{GPS_STATUS_TEXT}</span>
        </div>

        <div className="model-info">
          <div>模型: YOLOv8n</div>
          <div>
            FPS <span className="fps-value">{Math.round(fps)}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
