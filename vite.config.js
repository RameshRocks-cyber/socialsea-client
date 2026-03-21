import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = fileURLToPath(new URL('.', import.meta.url))
  const livekitEntry = path.resolve(
    rootDir,
    'node_modules/livekit-client/dist/livekit-client.esm.mjs',
  )
  const env = loadEnv(mode, process.cwd(), '')
  const readBackendPort = () => {
    const candidates = [
      path.resolve(rootDir, '..', 'SocialSea-main', 'src', 'main', 'resources', 'application.properties'),
      path.resolve(rootDir, '..', 'SocialSea-main', 'SocialSea-main', 'src', 'main', 'resources', 'application.properties'),
    ]
    for (const file of candidates) {
      try {
        if (!fs.existsSync(file)) continue
        const content = fs.readFileSync(file, 'utf8')
        const match = content.match(/^\s*server\.port\s*=\s*(\d+)/m)
        if (match?.[1]) return match[1]
      } catch {
        // ignore file errors
      }
    }
    return ''
  }
  const detectedPort = readBackendPort()
  const fallbackDevTarget = detectedPort ? `http://localhost:${detectedPort}` : 'http://localhost:8080'
  const devProxyTarget = (env.VITE_DEV_PROXY_TARGET || '').trim() || fallbackDevTarget
  const isLocalProxyTarget = (value) => {
    const raw = String(value || '').trim().toLowerCase()
    if (!raw) return false
    if (raw.startsWith('/')) return true
    if (raw.includes('localhost') || raw.includes('127.0.0.1')) return true
    const ipMatch = raw.match(/https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})/)
    if (!ipMatch) return false
    const [a, b] = ipMatch[1].split('.').map((n) => Number(n))
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }
  const useProxy = isLocalProxyTarget(devProxyTarget)

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
      host: 'localhost',
      port: 5173,
      strictPort: true,
      proxy: useProxy
        ? {
            '/api': {
              target: devProxyTarget,
              changeOrigin: true,
              secure: false,
            },
            '/uploads': {
              target: devProxyTarget,
              changeOrigin: true,
              secure: false,
            },
            '/ws': {
              target: devProxyTarget,
              changeOrigin: true,
              secure: false,
              ws: true,
            },
          }
        : {},
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173,
        clientPort: 5173,
      },
    },
  }
})
