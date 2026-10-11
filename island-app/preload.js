// SHEET-FREEZE — human order 2026-10-11: top-center positioning + sheet
// geometry locked. No agent edits this file until the human says "unfreeze".
// Enforced by tests/test_sheet_freeze.py. Details: CONTRIBUTING.md.
// Island bridge: the renderer reports SHEET STATE, main toggles one fixed
// PANEL / STRIP window (coucou model) and owns the mouse (cursor poll with
// click-through). Blur collapses back to the notch (tap-outside closes).
// No node in the page.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("island", {
  // ponytail: state-only (coucou-sheet parity) — the window toggles one
  // fixed PANEL / STRIP; the old resize(w,h) measure→resize loop is deleted.
  state: (s, v) => ipcRenderer.send("island-state", s, v),
  onBlur: (fn) => {
    ipcRenderer.removeAllListeners("island-blur");
    ipcRenderer.on("island-blur", () => fn());
  },
  // Command Echo: main polls the system clipboard, renderer shows it.
  onEcho: (fn) => {
    ipcRenderer.removeAllListeners("island-echo");
    ipcRenderer.on("island-echo", (_e, text) => fn(text));
  },
});
