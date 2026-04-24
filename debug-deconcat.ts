import { deconcatenate } from './src/core/engine'
import { readFileSync } from 'fs'

const content = readFileSync(
  'c:/Users/cdvro/Downloads/concatenator-20260421_152940.txt',
  'utf-8'
)
const result = deconcatenate(content)

console.log(`Found Any: ${result.foundAny}`)
console.log(`Files extracted: ${result.files.length}`)
console.log(`Skipped paths: ${JSON.stringify(result.skippedPaths)}`)

if (result.files.length > 0) {
  console.log('First file:')
  console.log(`Path: ${result.files[0].path}`)
  console.log(`Content length: ${result.files[0].content.length}`)
} else {
  // Debug extractSessionId
  const firstLine = content.split('\n')[0]
  console.log(`First line: ${JSON.stringify(firstLine)}`)

  const MANIFEST_PREFIX = '--- CONCATENATOR_SESSION_ID: '
  const MANIFEST_SUFFIX = ' ---'

  const prefixIndex = firstLine.indexOf(MANIFEST_PREFIX)
  console.log(`Prefix index: ${prefixIndex}`)

  if (prefixIndex !== -1) {
    const idStart = prefixIndex + MANIFEST_PREFIX.length
    const suffixIndex = firstLine.indexOf(MANIFEST_SUFFIX, idStart)
    console.log(`Suffix index: ${suffixIndex}`)
    if (suffixIndex !== -1) {
      const sessionId = firstLine.substring(idStart, suffixIndex)
      console.log(`Session ID: ${JSON.stringify(sessionId)}`)
    }
  }
}
