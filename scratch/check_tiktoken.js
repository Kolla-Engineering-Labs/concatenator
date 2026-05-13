import { getEncoding } from 'js-tiktoken'
try {
  const enc = getEncoding('o200k_base')
  console.log('o200k_base supported via getEncoding')
} catch (e) {
  console.log('o200k_base NOT supported via getEncoding')
}
