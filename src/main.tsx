import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the type is embedded in the PNG/MP4 export (no CDN request).
import '@fontsource-variable/bricolage-grotesque/index.css'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
// Card style variant (LyricCard "Script"): handwriting display font. The
// "ABNT" variant deliberately uses Times New Roman/Arial — real system fonts,
// per NBR 14724 — so it needs no webfont here.
import '@fontsource/caveat/400.css'
import '@fontsource/caveat/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registra o service worker (PWA). Só em produção — em dev o SW atrapalha o HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Falha no registro não deve quebrar o app; segue como web normal.
    })
  })
}
