/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { config } from 'dotenv';
import fs from 'fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Load .secrets file if it exists (suppress dotenv logging)
  if (fs.existsSync('.secrets')) {
    const originalLog = console.log;
    console.log = () => {};
    const secrets = config({ path: '.secrets' }).parsed || {};
    console.log = originalLog;
    Object.assign(env, secrets);
  }

  return {
    test: {
      environment: 'jsdom',
      globals: true,
      exclude: ['e2e/**/*', 'node_modules/**/*'],
      coverage: {
        provider: 'v8',
        reporter: process.env.CI 
          ? ['lcov', 'json-summary'] 
          : ['text', 'html'],
        reportsDirectory: './coverage',
        all: true,
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      codecovVitePlugin({
        enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
        bundleName: 'concatenator-bundle',
        uploadToken: process.env.CODECOV_TOKEN,
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
    build: {
      sourcemap: true, // Required for detailed bundle analysis
    },
  };
});
