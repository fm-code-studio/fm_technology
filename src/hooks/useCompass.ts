/**
 * 方位角 Hook
 *
 * 数据源优先级：
 * 1. iOS Safari 的 webkitCompassHeading（直接给出相对正北的顺时针方位角）
 * 2. deviceorientationabsolute 事件（Android Chrome，alpha 相对正北）
 *
 * iOS 13+ 必须在用户手势内调用 DeviceOrientationEvent.requestPermission()，
 * 否则 deviceorientation 事件永不触发，故额外导出 requestPermission 供界面点击时调用。
 * 设备无磁力计（如桌面浏览器）时 heading 保持 null，界面显示占位符。
 */
import { useCallback, useEffect, useState } from 'react';

/** iOS Safari 私有罗盘事件的补充字段 */
interface WebkitOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

/** iOS 13+ 带有权限申请方法的 DeviceOrientationEvent 构造器 */
interface PermissionRequestableOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

export interface UseCompassResult {
  /** 方位角（0~360，以正北为 0 顺时针递增）；无传感器数据时为 null */
  heading: number | null;
  /** 在用户手势内申请罗盘权限（仅 iOS 需要，其余平台直接返回） */
  requestPermission: () => Promise<void>;
}

export function useCompass(): UseCompassResult {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent): void => {
      const webkitEvent = event as WebkitOrientationEvent;
      const compassHeading = webkitEvent.webkitCompassHeading;
      if (typeof compassHeading === 'number' && !Number.isNaN(compassHeading)) {
        setHeading(compassHeading);
        return;
      }

      // alpha 为相对正北逆时针角，换算为顺时针方位角；
      // 非绝对朝向（absolute 为 false）不指向正北，无法作为方位角使用
      if (event.absolute && typeof event.alpha === 'number') {
        setHeading((360 - event.alpha) % 360);
      }
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<void> => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      return;
    }
    const ctor = DeviceOrientationEvent as unknown as PermissionRequestableOrientationEvent;
    if (typeof ctor.requestPermission !== 'function') {
      return;
    }
    try {
      await ctor.requestPermission();
    } catch {
      // 用户拒绝或非安全上下文时静默降级为无传感器
    }
  }, []);

  return { heading, requestPermission };
}
