import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
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
      // Common local setup: backend repo is a sibling of the outer workspace folder.
      path.resolve(rootDir, '..', '..', 'SocialSea-main', 'src', 'main', 'resources', 'application.properties'),
      path.resolve(rootDir, '..', '..', 'SocialSea-main', 'SocialSea-main', 'src', 'main', 'resources', 'application.properties'),
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
  const devProxyOrigin = (env.VITE_DEV_PROXY_ORIGIN || '').trim() || 'http://localhost:5173'
  const devServerHost = (env.VITE_DEV_SERVER_HOST || '').trim() || '0.0.0.0'
  const devHmrHost = (env.VITE_DEV_HMR_HOST || '').trim()
  const shouldAnalyzeBundle =
    ['true', '1', 'yes'].includes(String(env.VITE_BUNDLE_ANALYZE || env.ANALYZE_BUNDLE || '').trim().toLowerCase()) ||
    mode === 'analyze'
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
  const configureProxy = (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      // Backend CORS allowlists often include localhost dev origin but not LAN IP origin.
      // Force a stable dev origin for proxied requests so LAN access works.
      proxyReq.setHeader('origin', devProxyOrigin)
    })
  }

  return {
    plugins: [
      react(),
      shouldAnalyzeBundle
        ? visualizer({
            filename: 'dist/bundle-report.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            open: false,
          })
        : null,
    ].filter(Boolean),
    define: {
      'process.env': JSON.stringify(env),
    },
    resolve: {
      alias: {
        'livekit-client': livekitEntry,
      },
      // Ensure a single React instance across all chunks (prevents hook dispatcher null errors)
      dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    optimizeDeps: {
      include: ['livekit-client', 'react', 'react-dom', 'react/jsx-runtime'],
    },
    build: {
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = String(id || '').replace(/\\/g, '/').toLowerCase()
            if (!normalized.includes('/node_modules/')) return undefined
            if (normalized.includes('/react-dom/') || normalized.includes('/react/')) return 'vendor-react'
            if (normalized.includes('/react-router')) return 'vendor-router'
            if (normalized.includes('/react-icons/')) return 'vendor-icons'
            if (normalized.includes('/livekit-client/')) return 'vendor-livekit'
            if (
              normalized.includes('/@mediapipe/') ||
              normalized.includes('/@tensorflow/') ||
              normalized.includes('/onnxruntime-web/')
            ) {
              return 'vendor-vision'
            }
            if (normalized.includes('/heic2any/')) return 'vendor-heic'
            return undefined
          },
        },
      },
    },
    server: {
      host: devServerHost,
      port: 5173,
      strictPort: true,
      proxy: useProxy
        ? {
            '/api': {
              target: devProxyTarget,
              changeOrigin: true,
              secure: false,
              configure: configureProxy,
              headers: {
                origin: devProxyOrigin,
              },
            },
            '/uploads': {
              target: devProxyTarget,
              changeOrigin: true,
              secure: false,
              configure: configureProxy,
              headers: {
                origin: devProxyOrigin,
              },
            },
            '/ws': {
              target: devProxyTarget,
              changeOrigin: true,
              secure: false,
              ws: true,
              configure: configureProxy,
              headers: {
                origin: devProxyOrigin,
              },
            },
            '/ws-native': {
              target: devProxyTarget,
              changeOrigin: true,
              secure: false,
              ws: true,
              configure: configureProxy,
              headers: {
                origin: devProxyOrigin,
              },
            },
          }
        : {},
      hmr: {
        protocol: 'ws',
        ...(devHmrHost ? { host: devHmrHost } : {}),
        port: 5173,
        clientPort: 5173,
      },
    },
  }
})
