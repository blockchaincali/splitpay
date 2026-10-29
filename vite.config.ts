import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/**
 * Arc Studio's trace and console capture hook window.ethereum, fetch and console for the Studio preview.
 * They exist only for the dev server. In any `vite build` those two modules are replaced with empty stubs, so
 * no deployed bundle contains them. Do not relax this: it is what keeps wallet RPC traffic away from page hooks.
 * `contracts/test-integration/prod-bundle.test.ts` fails if their code ever reaches a build.
 */
const STUDIO_ONLY_MODULES: Record<string, string> = {
  'src/tracing.ts': 'export function registerChain() {}\n',
  'src/console-capture.ts': 'export {}\n',
}
const STUB_PREFIX = '\0studio-only-stub:'

export function stripStudioInstrumentation(): Plugin {
  return {
    name: 'strip-studio-instrumentation',
    apply: 'build',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved) return null
      const file = resolved.id.split('?')[0].split(path.sep).join('/')
      const key = Object.keys(STUDIO_ONLY_MODULES).find((k) => file.endsWith(`/${k}`))
      return key ? STUB_PREFIX + key : null
    },
    load(id) {
      return id.startsWith(STUB_PREFIX) ? STUDIO_ONLY_MODULES[id.slice(STUB_PREFIX.length)] : null
    },
  }
}

export default defineConfig({
  plugins: [stripStudioInstrumentation(), react(), nodePolyfills()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  server: {
    allowedHosts: true,
    cors: true,
    proxy: {
      // The browser only reaches Vite; the API server listens on 3001 and strips the /api prefix itself (see server/index.ts),
      // exactly as it does in production, so dev and production take the same path.
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
