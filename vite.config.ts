/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { config } from 'dotenv';
import fs from 'fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Load .secrets file if it exists (suppress dotenv logging)
  if (fs.existsSync('.secrets')) {
    const secrets = config({ path: '.secrets', debug: false }).parsed || {};
    Object.assign(env, secrets);
  }

  return {
    test: {
      environment: 'jsdom',
      globals: true,
      // Automatically clear mock call counts and restore spyOn implementations
      // after each test, preventing leaks without requiring manual afterEach calls.
      clearMocks: true,
      restoreMocks: true,
      exclude: ['e2e/**/*', 'node_modules/**/*'],
      reporters: env.CI ? ['default', 'junit'] : ['default'],
      outputFile: {
        junit: './test-report.junit.xml',
      },
      coverage: {
        provider: 'v8',
        reporter: env.CI
          ? ['lcov', 'json-summary']
          : ['text', 'html'],
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
    plugins: [
      react(),
      tailwindcss(),
      codecovVitePlugin({
        enableBundleAnalysis: env.CI === 'true',
        bundleName: 'concatenator-bundle',
        oidc: {
          useGitHubOIDC: true,
        },
      }),
      visualizer({
        open: true,
        filename: 'concatenator-bundle-stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY || ''),
      'process.env.ANTHROPIC_API_KEY': JSON.stringify(env.ANTHROPIC_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000, // Forces Vite to use the port Playwright expects
      strictPort: true, // CI will fail fast if 3000 is occupied, rather than picking a random port
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/.concatenate-ignore'],
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    build: {
      sourcemap: true, // Required for detailed bundle analysis
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // 1. Move React and React-DOM (the biggest blue blocks)
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            // 2. Move Lucide Icons (the purple/blue block on the left)
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            // 3. Move Framer Motion (the red/brown block)
            if (id.includes('node_modules/framer-motion')) {
              return 'vendor-motion';
            }
            // 4. Move heavy utils (the green block)
            if (id.includes('html2canvas') || id.includes('dompurify')) {
              return 'vendor-utils';
            }
          },
        }
      },
    },
  };
});
