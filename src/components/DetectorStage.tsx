/**
 * 视频画面层
 *
 * video 以 object-fit: cover 铺满全屏，canvas 透明叠加在 video 上层，
 * 两者共用同一容器坐标（CSS 像素），检测绘制由父组件检测循环完成。
 */
import { memo } from 'react';

interface DetectorStageProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** 前置摄像头时画面水平镜像 */
  mirrored: boolean;
}

function DetectorStageComponent({ videoRef, canvasRef, mirrored }: DetectorStageProps) {
  return (
    <div className="stage">
      <video
        ref={videoRef}
        className={mirrored ? 'stage-video is-mirrored' : 'stage-video'}
        autoPlay
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="stage-canvas" />
    </div>
  );
}

export const DetectorStage = memo(DetectorStageComponent);
