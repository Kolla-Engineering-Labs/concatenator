import fs from 'fs'

const MANIFEST_PREFIX = '--- CONCATENATOR_SESSION_ID: '
const MANIFEST_SUFFIX = ' ---'
const START_DELIMITER = '<<<<< FILE_START: '
const END_DELIMITER = ' >>>>>'
const FILE_END_DELIMITER = '<<<<< FILE_END >>>>>'

function extractSessionId(content) {
  const firstLine = content.split('\n')[0]
  if (!firstLine) return null
  const prefixIndex = firstLine.indexOf(MANIFEST_PREFIX)
  if (prefixIndex === -1) return null
  const idStart = prefixIndex + MANIFEST_PREFIX.length
  const suffixIndex = firstLine.indexOf(MANIFEST_SUFFIX, idStart)
  if (suffixIndex === -1) return null
  return firstLine.substring(idStart, suffixIndex)
}

function validate(input) {
  const errors = []
  const sessionId = extractSessionId(input)
  console.log('Extracted Session ID:', sessionId)

  const escapedStart = START_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = END_DELIMITER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const startMarkerRegex = new RegExp(
    `${escapedStart}(.+?)(?:\\s*\\(ID:\\s*([a-zA-Z0-9]+)\\s*\\))?${escapedEnd}`,
    'gi'
  )

  const fileMarkers = []
  let match
  while ((match = startMarkerRegex.exec(input)) !== null) {
    const rawPath = match[1].trim()
    let path = rawPath
    let markerSessionId = match[2] || null
    if (!markerSessionId) {
      const sessionMatch = rawPath.match(/\s*\(ID:\s*([a-zA-Z0-9]+)\s*\)$/i)
      if (sessionMatch) {
        markerSessionId = sessionMatch[1]
        path = rawPath.substring(0, rawPath.indexOf('(ID:')).trim()
      }
    }
    fileMarkers.push({
      path,
      markerSessionId,
      startPos: match.index,
      endPos: match.index + match[0].length,
    })
  }

  const targetMarkers = fileMarkers.filter(
    (m) => !sessionId || m.markerSessionId === sessionId
  )
  const foreignMarkers = fileMarkers.filter(
    (m) => sessionId && m.markerSessionId && m.markerSessionId !== sessionId
  )

  console.log('Found markers:', fileMarkers.length)
  console.log('Target markers:', targetMarkers.length)

  for (let i = 0; i < targetMarkers.length; i++) {
    const marker = targetMarkers[i]
    const nextTargetMarkerStart =
      i < targetMarkers.length - 1
        ? targetMarkers[i + 1].startPos
        : input.length
    const contentAfterStart = input.substring(
      marker.endPos,
      nextTargetMarkerStart
    )
    const hasEndMarker = contentAfterStart.includes(FILE_END_DELIMITER)
    if (!hasEndMarker) errors.push('Missing end marker for ' + marker.path)
  }

  const isValid = errors.length === 0 && targetMarkers.length > 0
  return { isValid, errors }
}

const content = fs.readFileSync(
  'c:\\Users\\cdvro\\Downloads\\concatenator-20260421_153031.txt',
  'utf8'
)
console.log('Validation Result:', validate(content))
