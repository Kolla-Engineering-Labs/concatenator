import { validateConcatenation } from './src/core/engine.js'
import { readFileSync } from 'fs'

const content = `--- CONCATENATOR_SESSION_ID: 5b6d34 ---
Concatenated on: 4/21/2026, 3:30:31 PM

<<<<< FILE_START: e2e/concatenate.spec.ts (ID: 5b6d34) >>>>>
test content
<<<<< FILE_END >>>>>
`

const result = validateConcatenation(content)
console.log(JSON.stringify(result, null, 2))
