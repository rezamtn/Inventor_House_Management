import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Register service worker directly - most compatible approach
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('SW registered:', reg.scope);
        // Import push handler into the SW
        reg.active?.postMessage({ type: 'IMPORT_PUSH' });
      })
      .catch(err => console.log('SW failed:', err))
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
