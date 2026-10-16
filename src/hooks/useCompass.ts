/**
 * 方位角 Hook
 *
 * 优先使用设备罗盘（deviceorientation / iOS webkitCompassHeading）；
 * 桌面端无罗盘硬件时保持 0。仅用于底部 HUD 角度展示。
 */
import { useEffect, useState } from 'react';

/** iOS Safari 私有罗盘事件的补充字段 */
interface WebkitOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

export function useCompass(): number {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const webkitEvent = event as WebkitOrientationEvent;
      if (typeof webkitEvent.webkitCompassHeading === 'number') {
        setHeading(webkitEvent.webkitCompassHeading);
      } else if (typeof event.alpha === 'number') {
        // alpha 为设备相对北方逆时针角，换算为顺时针方位角
        setHeading((360 - event.alpha) % 360);
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, []);

  return heading;
}
