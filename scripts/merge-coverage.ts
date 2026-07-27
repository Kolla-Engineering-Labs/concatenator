/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import istanbulCoverage from 'istanbul-lib-coverage'
import istanbulReport from 'istanbul-lib-report'
import istanbulReports from 'istanbul-reports'
import fs from 'fs'
import path from 'path'

const { createCoverageMap } = istanbulCoverage
const { createContext } = istanbulReport
const { create: createReport } = istanbulReports

async function mergeCoverage() {
  const coverageMap = createCoverageMap({})

  // 1. Merge Vitest report if it exists
  const vitestReportPath = path.resolve(
    process.cwd(),
    'coverage/coverage-final.json'
  )
  let vitestCoverage: Record<string, unknown> | null = null
  if (fs.existsSync(vitestReportPath)) {
    try {
      vitestCoverage = JSON.parse(fs.readFileSync(vitestReportPath, 'utf-8'))
      coverageMap.merge(vitestCoverage)
      console.log('Successfully loaded Vitest coverage map.')
    } catch (err) {
      console.warn('Failed to parse Vitest coverage report:', err)
    }
  } else {
    console.warn('No Vitest coverage map found at:', vitestReportPath)
  }

  // 2. Merge Playwright page & worker reports
  const playwrightDir = path.resolve(process.cwd(), 'coverage/raw-playwright')
  if (fs.existsSync(playwrightDir)) {
    const files = fs
      .readdirSync(playwrightDir)
      .filter((f) => f.endsWith('.json'))
    let count = 0
    const vitestKeys = vitestCoverage ? Object.keys(vitestCoverage) : []
    for (const file of files) {
      try {
        const content = JSON.parse(
          fs.readFileSync(path.join(playwrightDir, file), 'utf-8')
        )
        const normalizedContent: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(content)) {
          if (!value || typeof value !== 'object') continue

          // Extract base filename from Playwright coverage key
          const cleanKey = key
            .replace(/\?.*$/, '')
            .replace(/^https?:\/\/[^/]+/, '')
            .replace(/^\//, '')
          const baseName = path.basename(cleanKey)

          // Search Object.keys(vitestCoverage) for a path that ends with that exact base filename
          const matchedVitestPath = vitestKeys.find(
            (vk) =>
              vk.endsWith(`/${baseName}`) ||
              vk.endsWith(`\\${baseName}`) ||
              vk.endsWith(baseName)
          )

          const targetPath =
            matchedVitestPath ||
            (path.isAbsolute(cleanKey) && !key.startsWith('http')
              ? cleanKey
              : path.resolve(process.cwd(), cleanKey))

          const fileCoverage = {
            ...(value as Record<string, unknown>),
            path: targetPath,
          }

          normalizedContent[targetPath] = fileCoverage
        }
        coverageMap.merge(normalizedContent)
        count++
      } catch (err) {
        console.warn(`Failed to parse Playwright coverage file ${file}:`, err)
      }
    }
    console.log(`Successfully merged ${count} Playwright coverage file(s).`)
  } else {
    console.warn('No Playwright coverage directory found at:', playwrightDir)
  }

  // 3. Write merged coverage-final.json and generate console/HTML reports
  const coverageDir = path.resolve(process.cwd(), 'coverage')
  if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true })
  }
  fs.writeFileSync(
    vitestReportPath,
    JSON.stringify(coverageMap.toJSON(), null, 2)
  )

  const context = createContext({
    dir: coverageDir,
    defaultSummarizer: 'nested',
    coverageMap,
  })

  createReport('text').execute(context)
  createReport('html').execute(context)

  console.log(
    '\n✅ Unified coverage report generated successfully in ./coverage/'
  )
}

mergeCoverage().catch((err) => {
  console.error('Error merging coverage reports:', err)
  process.exit(1)
})
