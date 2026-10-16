/**
 * 全局共享类型定义
 */

/** 摄像头运行状态 */
export type CameraStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

/** 摄像头朝向（移动端用于切换前置/后置） */
export type FacingMode = 'user' | 'environment';

/** 轴对齐包围框（以视频原始像素为坐标系） */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** YOLO 解码 + NMS 之后、尚未编号的原始检测结果（坐标位于 640x640 模型输入空间） */
export interface RawDetection {
  /** 置信度 0~1 */
  score: number;
  /** 模型输入空间下的包围框 */
  box: BoundingBox;
}

/** 经过编号与远近判定后的最终检测目标 */
export interface Detection {
  /** 画面内序号，从 1 开始，按画面从左到右分配 */
  id: number;
  /** 置信度 0~1 */
  score: number;
  /** 显示空间（CSS 像素）下的包围框 */
  box: BoundingBox;
  /** 显示空间下的人物中心点 */
  center: { x: number; y: number };
  /** true=近，false=远（依据检测框像素高度判定） */
  near: boolean;
}

/** 检测循环对外抛出的统计信息 */
export interface DetectionStats {
  /** 检测到的目标数量 */
  count: number;
  /** 实时推理帧率 */
  fps: number;
}

/** 浏览器定位得到的经纬度（WGS84） */
export interface GeoCoords {
  latitude: number;
  longitude: number;
}
