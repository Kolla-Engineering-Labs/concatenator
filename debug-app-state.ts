import { IgnoreEngine } from './src/core/ignore/IgnoreEngine'

const virtualFileSystem = {
  'scripts/build-sea.js': 'content',
}

const appMode = 'deconcatenate'
const files = [
  { name: 'bundle.txt', path: 'bundle.txt', kind: 'file', content: '...' },
]

const ignoreList = ['build', 'dist', 'node_modules']

const engine = new IgnoreEngine(ignoreList)
const isIgnored = (path: string) => engine.isIgnored(path)

let baseFiles: {
  name: string
  path: string
  kind: 'file' | 'directory'
  content?: string
}[] = []
if (appMode === 'deconcatenate') {
  baseFiles = Object.entries(virtualFileSystem).map(([path, content]) => ({
    name: path.split('/').pop() || '',
    path,
    kind: 'file' as const,
    content,
  }))
} else {
  baseFiles = files
}

const displayFiles = baseFiles
  .map((file) => ({
    ...file,
    isIgnored: isIgnored(file.path),
  }))
  .sort((a, b) => {
    if (a.kind === 'directory' && b.kind === 'file') return -1
    if (a.kind === 'file' && b.kind === 'directory') return 1
    return a.path.localeCompare(b.path)
  })

console.log(`Display Files Length: ${displayFiles.length}`)
console.log(`First File Path: ${displayFiles[0].path}`)
console.log(`First File Kind: ${displayFiles[0].kind}`)
console.log(`First File Is Ignored: ${displayFiles[0].isIgnored}`)

const filteredFilesCount = displayFiles.filter(
  (f) => f.kind === 'file' && !f.isIgnored
).length
console.log(`Filtered Files Count: ${filteredFilesCount}`)
