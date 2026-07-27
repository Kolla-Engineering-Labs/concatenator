/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { codecovVitePlugin } from '@codecov/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import { config } from 'dotenv'
import fs from 'fs'
import istanbul from 'vite-plugin-istanbul'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  // Load .secrets file if it exists (suppress dotenv logging)
  if (fs.existsSync('.secrets')) {
    const secrets = config({ path: '.secrets', debug: false }).parsed || {}
    Object.assign(env, secrets)
  }

  return {
    test: {
      environment: 'jsdom',
      globals: true,
      testTimeout: 60000,
      // Automatically clear mock call counts and restore spyOn implementations
      // after each test, preventing leaks without requiring manual afterEach calls.
      clearMocks: true,
      restoreMocks: true,
      exclude: ['e2e/**/*', 'node_modules/**/*'],
      reporters: env.CI ? ['default', 'junit'] : ['default'],
      outputFile: {
        junit: './coverage/test-report.junit.xml',
      },
      coverage: {
        provider: 'istanbul',
        reporter: ['json'],
        reportsDirectory: './coverage',
        all: true,
        exclude: [
          '**/node_modules/**',
          '**/dist/**',
          '**/cypress/**',
          '**/.{eslint,mocha,prettier}rc.{js,cjs,yml}',
          'src/main.tsx',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.spec.ts',
          'e2e/**',
        ],
      },
    },
    optimizeDeps: {
      include: ['js-tiktoken'],
    },
    plugins: [
      react(),
      tailwindcss(),
      // Dev-only: stub API routes that have no backend in Vite dev mode.
      // The proxy forwards /api/* to port 3000 (CLI server). When the CLI
      // isn't running, the connection is refused at the network layer —
      // before JavaScript can handle it — so the browser logs a red error.
      // Intercepting here returns 200 with null, keeping the console clean.
      {
        name: 'dev-api-stub',
        apply: 'serve',
        configureServer(server) {
          const stubs = ['/api/security/info']
          server.middlewares.use((req, res, next) => {
            if (req.method !== 'GET') return next()
            if (stubs.some((path) => req.url?.startsWith(path))) {
              const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 200
              res.end(
                JSON.stringify({
                  version: pkg.version,
                  buildHash: 'dev-hash',
                  fingerprint: 'dev-fingerprint',
                })
              )
              return
            }
            next()
          })
        },
      },
      codecovVitePlugin({
        enableBundleAnalysis: process.env.CI !== undefined,
        bundleName: 'concatenator-bundle',
        uploadToken: env.CODECOV_TOKEN,
        oidc: {
          useGitHubOIDC: true,
        },
        // @ts-expect-error - Keep debug logs for development/CI; reduce noise in production builds
        logLevel: mode === 'development' || !!env.CI ? 'debug' : 'info',
      }),
      visualizer({
        open: false,
        filename: 'concatenator-bundle-stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
      ...(process.env.VITE_COVERAGE === 'true'
        ? [
            istanbul({
              include: 'src/*',
              exclude: ['node_modules', 'test/', 'tests/'],
              extension: ['.js', '.ts', '.tsx'],
              requireEnv: false,
            }),
          ]
        : []),
    ],
    // v0.8.0-observability-sync: force config reload to pick up package.json version
    define: {
      PROCESS_VERSION: JSON.stringify(
        JSON.parse(fs.readFileSync('./package.json', 'utf-8')).version
      ),
      'process.platform': JSON.stringify('browser'),
      'process.env': {},
      'path.sep': JSON.stringify('/'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        ...(mode !== 'test'
          ? { path: path.resolve(__dirname, './src/web/path-shim.ts') }
          : {}),
      },
    },
    server: {
      port: 5173,
      host: '127.0.0.1',
      strictPort: false,
      proxy: {
        '^/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/.concatenate-ignore',
          '**/.changeset/**',
          '**/test-results/**',
          '**/temp_ignore_files/**',
        ],
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    worker: {
      format: 'es',
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
    build: {
      sourcemap: false, // Disabled for bit-for-bit determinism
      chunkSizeWarningLimit: 6000,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name].[ext]',
          manualChunks(id) {
            // 1. Move React and React-DOM (the biggest blue blocks)
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/')
            ) {
              return 'vendor-react'
            }
            // 2. Move Lucide Icons (the purple/blue block on the left)
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons'
            }
            // 3. Move Framer Motion (the red/brown block)
            if (id.includes('node_modules/framer-motion')) {
              return 'vendor-motion'
            }
            // 4. Move heavy utils (the green block)
            if (id.includes('html2canvas') || id.includes('dompurify')) {
              return 'vendor-utils'
            }
            // 5. Move jsPDF to its own chunk (it's huge)
            if (id.includes('node_modules/jspdf')) {
              return 'vendor-jspdf'
            }
          },
        },
      },
    },
  }
})
