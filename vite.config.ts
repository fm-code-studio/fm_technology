import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP 响应头：开启跨源隔离，使 onnxruntime-web 可使用多线程 SharedArrayBuffer 加速
const crossOriginIsolationHeaders: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  build: {
    target: 'es2020',
  },
});
