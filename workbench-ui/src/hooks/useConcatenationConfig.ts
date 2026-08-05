import { usePersistentState } from './usePersistentState'

export interface ConcatenationConfig {
  outputFormat: 'markdown' | 'xml'
  enableNeutralization: boolean
  injectPostMatterManifest: boolean
  stripComments: boolean
}

export function useConcatenationConfig() {
  // Output format routing
  const [format, setFormat] = usePersistentState<'markdown' | 'xml'>(
    'kel:config_format',
    'markdown'
  )

  // Security & LLM Safety (Default: true per KEL Protocol)
  const [neutralize, setNeutralize] = usePersistentState<boolean>(
    'kel:config_neutralize',
    true
  )

  // Telemetry injection at EOF
  const [manifest, setManifest] = usePersistentState<boolean>(
    'kel:config_manifest',
    true
  )

  // Token optimization
  const [stripComments, setStripComments] = usePersistentState<boolean>(
    'kel:config_strip_comments',
    false
  )

  // Expose a serialized getter for the POST /api/concatenate payload
  const getPayloadMatrix = (): ConcatenationConfig => ({
    outputFormat: format,
    enableNeutralization: neutralize,
    injectPostMatterManifest: manifest,
    stripComments: stripComments,
  })

  return {
    format,
    setFormat,
    neutralize,
    setNeutralize,
    manifest,
    setManifest,
    stripComments,
    setStripComments,
    getPayloadMatrix,
  }
}
