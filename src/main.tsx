import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import App from './App.tsx'
import './web/index.css'

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host:
    import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
  defaults: '2026-01-30',
  persistence: 'localStorage+cookie',
  person_profiles: 'identified_only',
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: '.ph-no-capture',
  },
  debug: false,
})

// if (import.meta.env.DEV) {
;(window as Window & { posthog?: typeof posthog }).posthog = posthog
// }

import { ModeProvider } from './web/context/ModeContext.tsx'

// 1. Handshake: Capture token from URL BEFORE anything else
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search)
  const urlToken = params.get('t')
  if (urlToken) {
    sessionStorage.setItem('CONCATENATOR_TOKEN', urlToken)
    // Clean URL to prevent token leaking in bookmarks/history
    const newUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, '', newUrl)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ModeProvider>
      <App />
    </ModeProvider>
  </StrictMode>
)
