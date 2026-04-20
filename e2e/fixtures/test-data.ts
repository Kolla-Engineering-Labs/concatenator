/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockFile } from '../helpers/file-upload'

/**
 * Common test file fixtures for E2E tests
 */

export const SIMPLE_PROJECT: MockFile[] = [
  {
    name: 'readme.md',
    path: 'project/readme.md',
    content: '# Simple Project\n\nA basic test project.',
  },
  {
    name: 'main.js',
    path: 'project/src/main.js',
    content: 'console.log("Hello, World!");',
  },
  {
    name: 'utils.js',
    path: 'project/src/utils.js',
    content: 'export const sum = (a, b) => a + b;',
  },
]

export const REACT_PROJECT: MockFile[] = [
  {
    name: 'package.json',
    path: 'my-app/package.json',
    content: JSON.stringify(
      {
        name: 'my-app',
        version: '1.0.0',
        dependencies: { react: '^18.0.0' },
      },
      null,
      2
    ),
  },
  {
    name: 'App.tsx',
    path: 'my-app/src/App.tsx',
    content: `import React from 'react';

export default function App() {
  return <div>Hello from React</div>;
}`,
  },
  {
    name: 'index.tsx',
    path: 'my-app/src/index.tsx',
    content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);`,
  },
  {
    name: 'styles.css',
    path: 'my-app/src/styles.css',
    content: `body {
  margin: 0;
  font-family: sans-serif;
}`,
  },
  {
    name: 'Button.tsx',
    path: 'my-app/src/components/Button.tsx',
    content: `import React from 'react';

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ onClick, children }) => (
  <button onClick={onClick}>{children}</button>
);`,
  },
]

export const PYTHON_PROJECT: MockFile[] = [
  {
    name: 'main.py',
    path: 'python-app/main.py',
    content: `#!/usr/bin/env python3
def main():
    print("Hello from Python!")

if __name__ == "__main__":
    main()`,
  },
  {
    name: 'utils.py',
    path: 'python-app/utils.py',
    content: `def helper_function():
    return "I am a helper"`,
  },
  {
    name: 'test_main.py',
    path: 'python-app/tests/test_main.py',
    content: `import unittest
from main import main

class TestMain(unittest.TestCase):
    def test_main(self):
        self.assertTrue(True)`,
  },
  {
    name: 'requirements.txt',
    path: 'python-app/requirements.txt',
    content: `pytest
requests`,
  },
]

export const FILES_WITH_EXTENSIONS_TO_IGNORE: MockFile[] = [
  { name: 'app.js', path: 'src/app.js', content: 'const app = {};' },
  {
    name: 'app.test.js',
    path: 'src/app.test.js',
    content: 'test("app", () => {});',
  },
  { name: 'styles.css', path: 'src/styles.css', content: 'body {}' },
  {
    name: 'styles.min.css',
    path: 'src/styles.min.css',
    content: 'body{margin:0}',
  },
  { name: 'data.json', path: 'src/data.json', content: '{"key": "value"}' },
  { name: 'temp.tmp', path: 'src/temp.tmp', content: 'temporary' },
  { name: 'cache.pyc', path: 'src/__pycache__/cache.pyc', content: 'binary' },
]

export const FILES_WITH_SPECIAL_NAMES: MockFile[] = [
  {
    name: 'file with spaces.js',
    path: 'src/file with spaces.js',
    content: '// file with spaces',
  },
  {
    name: 'file-with-dashes.css',
    path: 'src/file-with-dashes.css',
    content: '/* dashes */',
  },
  {
    name: 'file_with_underscores.py',
    path: 'src/file_with_underscores.py',
    content: '# underscores',
  },
  {
    name: 'file.multiple.dots.ts',
    path: 'src/file.multiple.dots.ts',
    content: '// multiple dots',
  },
  {
    name: 'file@symbol.js',
    path: 'src/file@symbol.js',
    content: '// at symbol',
  },
  { name: 'UPPERCASE.TXT', path: 'src/UPPERCASE.TXT', content: 'UPPER CASE' },
  { name: 'MiXeD_CaSe.Js', path: 'src/MiXeD_CaSe.Js', content: 'mixed case' },
]

export const LARGE_BATCH: MockFile[] = Array.from({ length: 50 }, (_, i) => ({
  name: `file${String(i).padStart(3, '0')}.txt`,
  path: `batch/file${String(i).padStart(3, '0')}.txt`,
  content: `This is the content for file number ${i}.\n`.repeat(10),
}))

export const NESTED_DEEP_STRUCTURE: MockFile[] = [
  { name: 'root.txt', path: 'deep/root.txt', content: 'root level' },
  { name: 'level1.txt', path: 'deep/level1/level1.txt', content: 'level 1' },
  {
    name: 'level2.txt',
    path: 'deep/level1/level2/level2.txt',
    content: 'level 2',
  },
  {
    name: 'level3.txt',
    path: 'deep/level1/level2/level3/level3.txt',
    content: 'level 3',
  },
  {
    name: 'level4.txt',
    path: 'deep/level1/level2/level3/level4/level4.txt',
    content: 'level 4',
  },
  {
    name: 'side-branch.txt',
    path: 'deep/level1/side-branch/side-branch.txt',
    content: 'side branch',
  },
]

export const BINARY_LIKE_CONTENT: MockFile[] = [
  {
    name: 'base64.txt',
    path: 'data/base64.txt',
    content: Buffer.from(
      'Hello World! This is some text that could be binary.'
    ).toString('base64'),
  },
  {
    name: 'unicode.txt',
    path: 'data/unicode.txt',
    content: 'Unicode: 你好世界 🌍 ñ é ü 日本語 العربية',
  },
  {
    name: 'json-data.json',
    path: 'data/json-data.json',
    content: JSON.stringify(
      { nested: { deep: { value: 123, array: [1, 2, 3] } } },
      null,
      2
    ),
  },
]

/**
 * Generates a mock concatenated file format for de-concatenation tests
 */
export function createConcatenatedContent(
  files: Array<{ path: string; content: string }>
): string {
  const lines: string[] = []

  lines.push(
    '═══════════════════════════════════════════════════════════════════════════════'
  )
  lines.push('CONCATENATED FILES')
  lines.push(
    '═══════════════════════════════════════════════════════════════════════════════'
  )
  lines.push('')

  for (const file of files) {
    lines.push(
      '───────────────────────────────────────────────────────────────────────────────'
    )
    lines.push(`File: ${file.path}`)
    lines.push(
      '───────────────────────────────────────────────────────────────────────────────'
    )
    lines.push('')
    lines.push(file.content)
    lines.push('')
  }

  lines.push(
    '═══════════════════════════════════════════════════════════════════════════════'
  )
  lines.push('END OF CONCATENATED FILES')
  lines.push(
    '═══════════════════════════════════════════════════════════════════════════════'
  )

  return lines.join('\n')
}
