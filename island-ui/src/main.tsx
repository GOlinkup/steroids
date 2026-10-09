import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { shouldDeferSwReload } from './sw_guard.ts'

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
      // never yank a live chat for an update: a FRESH draft means the user
      // is messaging from this same app right now (unsent typing counts —
      // it leaves no transcript yet). The new worker already controls the
      // page — the next clean load picks it up. Stale drafts (>15min, user
      // walked away) and empty states reload immediately.
      try {
        if (shouldDeferSwReload(
          localStorage.getItem("island.draft.v1"),
          localStorage.getItem("island.composer.v1"),
        )) return;
      } catch {
        /* unreadable storage — fall through to reload */
      }
      window.location.reload();
    });
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
