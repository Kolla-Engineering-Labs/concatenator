import { IgnoreEngine } from './src/core/ignore/IgnoreEngine'

const ignoreList = [
  '.concatenate-ignore',
  '.DS_Store',
  '.env',
  '.expo',
  '.git',
  '.gradle',
  '.next',
  '.secrets',
  '.terraform',
  '.vagrant',
  '.vscode',
  '*.class',
  '*.exe',
  '*.gif',
  '*.jar',
  '*.jpeg',
  '*.jpg',
  '*.log',
  '*.o',
  '*.obj',
  '*.png',
  '*.svg',
  '*.swp',
  '*.tif',
  '*.tiff',
  '/^__.*cache__$/',
  '/^\\..*_cache$/',
  'bin',
  'build',
  'desktop.ini',
  'dist',
  'node_modules',
  'obj',
  'package-lock.json',
  'playwright-report',
  'ruff_output.txt',
  'target',
  'temp_ignore_files',
  'test-results',
  'Thumbs.db',
  'vendor',
  'venv',
]

const engine = new IgnoreEngine(ignoreList)
const path = 'scripts/build-sea.js'
console.log(`Path: ${path}`)
console.log(`Is Ignored: ${engine.isIgnored(path)}`)

// Check segments
const segments = path.split('/').filter(Boolean)
console.log(`Segments: ${JSON.stringify(segments)}`)
console.log(`Some segment is build: ${segments.some((s) => s === 'build')}`)

// Check filename
const fileName = segments[segments.length - 1]
console.log(`FileName: ${fileName}`)
console.log(`FileName is build: ${fileName === 'build'}`)
