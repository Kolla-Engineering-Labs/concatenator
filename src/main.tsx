import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import posthog from 'posthog-js';
import App from './App.tsx';
import './index.css';

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
  defaults: '2026-01-30',
  persistence: 'localStorage+cookie',
  person_profiles: 'always',
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: ".ph-no-capture",
  },
  loaded: (ph) => {
    if (import.meta.env.DEV) ph.debug();
    console.log("PostHog Loaded Successfully");
  }
});

// if (import.meta.env.DEV) {
  (window as any).posthog = posthog;
// }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
