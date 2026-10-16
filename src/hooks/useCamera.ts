/**
 * 摄像头管理 Hook
 *
 * 能力：
 * - 开启 / 关闭摄像头
 * - 枚举设备并在多个摄像头之间循环切换（桌面端）
 * - 单摄设备上回退为前置/后置 facingMode 切换（移动端）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraStatus, FacingMode } from '../types';

export interface UseCameraResult {
  status: CameraStatus;
  error: string | null;
  facing: FacingMode;
  /** 是否存在可切换的下一路摄像头 */
  canSwitch: boolean;
  start: () => Promise<void>;
  stop: () => void;
  switchCamera: () => Promise<void>;
}

/** 从设备列表筛选视频输入设备 */
function listVideoDevices(): Promise<MediaDeviceInfo[]> {
  return navigator.mediaDevices
    .enumerateDevices()
    .then((devices) => devices.filter((device) => device.kind === 'videoinput'));
}

export function useCamera(videoRef: React.RefObject<HTMLVideoElement>): UseCameraResult {
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<FacingMode>('user');
  const [canSwitch, setCanSwitch] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const devicesRef = useRef<MediaDeviceInfo[]>([]);
  const deviceIndexRef = useRef(0);
  /** 单摄移动设备上的朝向回退标记 */
  const facingRef = useRef<FacingMode>('user');

  /** 停止当前所有轨道并解绑 video 元素 */
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('stopped');
  }, [videoRef]);

  /** 根据设备索引或朝向获取媒体流 */
  const openStream = useCallback(async (): Promise<MediaStream> => {
    const devices = devicesRef.current;
    if (devices.length > 0) {
      const deviceId = devices[deviceIndexRef.current]?.deviceId;
      if (deviceId) {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          // 设备被占用或失效时回退到默认设备
          devicesRef.current = [];
        }
      }
    }

    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingRef.current },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  }, []);

  /** 将媒体流绑定到 video 元素并刷新设备信息 */
  const attachStream = useCallback(
    async (stream: MediaStream) => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const devices = await listVideoDevices();
      devicesRef.current = devices;
      // 记录当前实际使用的设备索引
      const activeTrack = stream.getVideoTracks()[0];
      const activeSettingId = activeTrack?.getSettings().deviceId;
      const idx = devices.findIndex((device) => device.deviceId === activeSettingId);
      if (idx >= 0) {
        deviceIndexRef.current = idx;
      }
      setCanSwitch(devices.length > 1);
      setStatus('running');
    },
    [videoRef],
  );

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持摄像头 API（需要 HTTPS 或 localhost 环境）');
      setStatus('error');
      return;
    }

    setError(null);
    setStatus('starting');
    try {
      const stream = await openStream();
      await attachStream(stream);
    } catch (err) {
      const message = err instanceof DOMException && err.name === 'NotAllowedError'
        ? '摄像头权限被拒绝，请在浏览器设置中允许访问'
        : '摄像头启动失败，请检查设备是否被占用';
      setError(message);
      setStatus('error');
    }
  }, [attachStream, openStream]);

  const switchCamera = useCallback(async () => {
    if (status === 'starting') {
      return;
    }

    setStatus('starting');
    setError(null);
    streamRef.current?.getTracks().forEach((track) => track.stop());

    const devices = devicesRef.current;
    if (devices.length > 1) {
      deviceIndexRef.current = (deviceIndexRef.current + 1) % devices.length;
    } else {
      // 无多路设备信息时切换朝向约束（移动端前后摄）
      facingRef.current = facingRef.current === 'user' ? 'environment' : 'user';
      setFacing(facingRef.current);
    }

    try {
      const stream = await openStream();
      await attachStream(stream);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换摄像头失败');
      setStatus('error');
    }
  }, [attachStream, openStream, status]);

  // 卸载时释放摄像头
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { status, error, facing, canSwitch, start, stop, switchCamera };
}
