/**
 * 定位 Hook
 *
 * 通过 navigator.geolocation.watchPosition 持续获取经纬度。
 * 设备无定位能力、用户拒绝授权或定位服务不可达时返回 null，
 * 由界面回退为「GPS 无信号」文案。
 */
import { useEffect, useState } from 'react';
import type { GeoCoords } from '../types';

/** 单次定位超时（毫秒） */
const GEO_TIMEOUT_MS = 15_000;

export function useGeolocation(): GeoCoords | null {
  const [coords, setCoords] = useState<GeoCoords | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        // 定位失败时保留上一次成功的结果；从未成功过则维持 null（界面显示无信号）
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: GEO_TIMEOUT_MS,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return coords;
}
