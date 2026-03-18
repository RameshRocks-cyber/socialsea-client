import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = fileURLToPath(new URL('.', import.meta.url))
  const livekitEntry = path.resolve(
    rootDir,
    'node_modules/livekit-client/dist/livekit-client.esm.mjs',
  )
  const env = loadEnv(mode, process.cwd(), '')
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'https://socialsea.co.in'

  return {
    plugins: [react()],
    define: {
      'process.env': JSON.stringify(env),
    },
    resolve: {
      alias: {
        'livekit-client': livekitEntry,
      },
    },
    optimizeDeps: {
      include: ['livekit-client'],
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173,
        clientPort: 5173,
      },
    },
  }
})
