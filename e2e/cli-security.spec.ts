import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'

test.describe('CLI Security Brief', () => {
  test('should display the Security Brief when mocked', async () => {
    // We run the CLI via tsx since we're in the dev environment
    const output = execSync('npx tsx src/cli/index.ts test-security-brief', {
      env: {
        ...process.env,
        CONCATENATOR_MOCK_QUARANTINE: 'true',
        CONCATENATOR_FORCE_UNSIGNED: 'true',
      },
      encoding: 'utf8',
    })

    expect(output).toContain('SECURITY BRIEF: MACOS QUARANTINE DETECTED')
    expect(output).toContain('xattr -d com.apple.quarantine')
    expect(output).toContain('WHY THIS IS HAPPENING')
  })

  test('should NOT display the Security Brief when not mocked', async () => {
    // On non-macOS, it should not show unless mocked
    if (process.platform !== 'darwin') {
      const output = execSync('npx tsx src/cli/index.ts test-security-brief', {
        env: {
          ...process.env,
          CONCATENATOR_MOCK_QUARANTINE: 'false',
          CONCATENATOR_FORCE_UNSIGNED: 'false',
        },
        encoding: 'utf8',
      })

      expect(output).not.toContain('SECURITY BRIEF: MACOS QUARANTINE DETECTED')
    }
  })
})
