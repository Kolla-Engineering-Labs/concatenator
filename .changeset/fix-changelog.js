import fs from 'node:fs';
import path from 'node:path';

const date = new Date().toISOString().split('T')[0] // Ensure it's just YYYY-MM-DD
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
