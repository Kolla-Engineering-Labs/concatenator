const MANIFEST_PREFIX = '--- CONCATENATOR_SESSION_ID: '
const MANIFEST_SUFFIX = ' ---'

function extractSessionId(content) {
  const firstLine = content.split('\n')[0]
  console.log('First line:', JSON.stringify(firstLine))
  if (!firstLine) return null

  const prefixIndex = firstLine.indexOf(MANIFEST_PREFIX)
  console.log('Prefix index:', prefixIndex)
  if (prefixIndex === -1) return null

  const idStart = prefixIndex + MANIFEST_PREFIX.length
  console.log('ID start:', idStart)
  const suffixIndex = firstLine.indexOf(MANIFEST_SUFFIX, idStart)
  console.log('Suffix index:', suffixIndex)
  if (suffixIndex === -1) return null

  return firstLine.substring(idStart, suffixIndex)
}

const content = '--- CONCATENATOR_SESSION_ID: 5b6d34 ---\r\nSecond line'
const sessionId = extractSessionId(content)
console.log('Session ID:', JSON.stringify(sessionId))
