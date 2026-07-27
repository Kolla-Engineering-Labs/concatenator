/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig((configEnv) =>
  mergeConfig(
    typeof viteConfig === 'function' ? viteConfig(configEnv) : viteConfig,
    defineConfig({
      test: {
        exclude: [
          '**/node_modules/**',
          '**/dist/**',
          '**/cypress/**',
          'e2e/**',
          'tests/e2e/**',
        ],
        coverage: {
          provider: 'v8',
          reportsDirectory: './coverage',
          reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
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
            'tests/e2e/**',
          ],
        },
      },
    })
  )
)
