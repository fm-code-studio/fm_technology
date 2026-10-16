/**
 * 全局配置：模型地址、检测阈值、界面配色
 */

/**
 * 主模型 jsDelivr 加速直链（Hyuto/yolov8-onnxruntime-web）
 * 国内网络各节点可达性不同，按顺序依次降级：cdn -> fastly -> gcore
 */
export const MODEL_CDN_URLS: readonly string[] = [
  'https://cdn.jsdelivr.net/gh/Hyuto/yolov8-onnxruntime-web@master/public/model/yolov8n.onnx',
  'https://fastly.jsdelivr.net/gh/Hyuto/yolov8-onnxruntime-web@master/public/model/yolov8n.onnx',
  'https://gcore.jsdelivr.net/gh/Hyuto/yolov8-onnxruntime-web@master/public/model/yolov8n.onnx',
];

/** 本地兜底模型（所有 CDN 不可用时使用，支持纯内网/离线部署） */
export const MODEL_FALLBACK_URL = '/models/yolov8n.onnx';

/** onnxruntime-web wasm 文件目录（已随站点发布到 /ort/） */
export const ORT_WASM_PATHS = '/ort/';

/** YOLOv8 输入尺寸（正方形） */
export const MODEL_INPUT_SIZE = 640;

/** COCO 数据集中 person 的类别 ID（只检测该类别） */
export const PERSON_CLASS_ID = 0;

/** 置信度阈值 */
export const CONFIDENCE_THRESHOLD = 0.4;

/** NMS IoU 阈值 */
export const IOU_THRESHOLD = 0.45;

/**
 * 远近判定阈值：检测框高度占画面高度的比例。
 * 框越大目标越近，大于该值判定为“近”，否则为“远”。
 */
export const NEAR_BOX_HEIGHT_RATIO = 0.35;

/** 界面配色（与截图一致：绿框 / 蓝心 / 白字 / 半透明黑标签） */
export const COLORS = {
  boxStroke: '#00ff5e',
  centerMarker: '#2b8cff',
  text: '#ffffff',
  tagBackground: 'rgba(0, 0, 0, 0.62)',
  accent: '#00ff5e',
} as const;

/** 品牌文本 */
export const BRAND_NAME = 'fm 科技';

/** 固定展示的 GPS 状态文案 */
export const GPS_STATUS_TEXT = 'GPS 无信号';
