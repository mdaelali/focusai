import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'

// Anonymous visit counts (Vercel Web Analytics: no cookies). The hash router keeps
// room codes and student names in the URL (#/join/CODE?name=...), so only the page
// type is sent: /, /host, /join, /lab or /privacy.
function anonymiseUrl(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url)
  const page = url.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  url.pathname = ['host', 'join', 'lab', 'privacy'].includes(page) ? `/${page}` : '/'
  url.search = ''
  url.hash = ''
  return { ...event, url: url.toString() }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={anonymiseUrl} />
  </StrictMode>,
)

// The service worker only exists so phones can show system notifications
// (Android and iOS refuse `new Notification()`); it caches nothing.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* notifications fall back to the constructor where that works */
    })
  })
}
