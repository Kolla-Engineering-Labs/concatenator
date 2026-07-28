import fs from 'node:fs'
import path from 'node:path'

// Offset the UTC date by the local timezone difference before extracting the string
const now = new Date()
const offsetMs = now.getTimezoneOffset() * 60 * 1000
const localDate = new Date(now.getTime() - offsetMs)
const date = localDate.toISOString().split('T')[0]
const changelogPath = path.resolve('CHANGELOG.md')

if (fs.existsSync(changelogPath)) {
  let content = fs.readFileSync(changelogPath, 'utf8')

  // Regex breakdown:
  // ^##           -> Start of line with '## '
  // [^\[\n]*      -> Matches any characters that AREN'T a bracket or newline (skips [Unreleased])
  // (\d+\.\d+\.\d+) -> Captures the numeric semver (0.1.0)
  const updatedContent = content.replace(
    /^## [^\[\n]*(\d+\.\d+\.\d+)/m,
    `## [$1] - ${date}`
  )

  fs.writeFileSync(changelogPath, updatedContent)
  console.log('✅ Formatted the latest version header.')
}
