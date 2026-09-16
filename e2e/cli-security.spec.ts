import { test, expect } from './fixtures'
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

test.describe('E2E Zero-Trust Perimeter & SEA Daemon Handshake', () => {
  test('should capture CI token from URL parameter and sanitize URL bar', async ({
    page,
  }) => {
    // E2E Test Hardening: Simulate SEA daemon browser launch with CI token
    await page.goto('/?t=kel-test-token-001', {
      waitUntil: 'domcontentloaded',
    })

    // Verify token was captured into sessionStorage by main.tsx
    const token = await page.evaluate(() =>
      window.sessionStorage.getItem('CONCATENATOR_TOKEN')
    )
    expect(token).toBe('kel-test-token-001')

    // Verify URL bar was sanitized to prevent token leakage in bookmarks/history
    expect(page.url()).not.toContain('?t=')
  })

  test('should reject API requests with invalid token with 403 Zero-Trust Perimeter Violation', async () => {
    const response = await fetch('http://127.0.0.1:5173/api/ignore-list', {
      method: 'GET',
      headers: {
        'x-concatenator-token': 'invalid-token-tamper-attempt',
      },
    })

    expect(response.status).toBe(403)
    const json = (await response.json()) as { error: string }
    expect(json.error).toContain('Zero-Trust Perimeter Violation')
  })

  test('should reject API requests missing authentication token with 403', async () => {
    const response = await fetch('http://127.0.0.1:5173/api/concatenate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ matrix: { outputFormat: 'markdown' } }),
    })

    expect(response.status).toBe(403)
    const json = (await response.json()) as { error: string }
    expect(json.error).toContain('Zero-Trust Perimeter Violation')
  })
})
