import { test, expect } from './fixtures'
import fs from 'node:fs'
import path from 'node:path'

test.describe('Version Reporting', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')
  )
  const expectedVersion = `v${pkg.version}`

  test('should display the correct version in the status bar', async ({
    page,
  }) => {
    await page.goto('/')
    const statusBarVersion = page.getByTestId('status-bar-version')
    await expect(statusBarVersion).toContainText(expectedVersion)
  })

  test('should not display version in the Security Center button anymore', async ({
    page,
  }) => {
    await page.goto('/')

    const securityCenter = page.locator('button', {
      hasText: 'Security Center',
    })
    await expect(securityCenter).toBeVisible()

    // Should NOT contain the version string anymore
    await expect(securityCenter).not.toContainText(expectedVersion)
  })
})
