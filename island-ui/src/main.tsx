import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// installed-app shell: cache the UI for offline starts, never the API.
if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    // page already controlled => a new worker means an update: reload once it lands.
    if (navigator.serviceWorker.controller) sessionStorage.setItem("sw-updated", "1");
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem("sw-updated") !== "1") return;
      sessionStorage.removeItem("sw-updated");
      window.location.reload();
    });
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
