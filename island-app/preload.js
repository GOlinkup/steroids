// Island bridge: the renderer reports the pill size after every state
// change, main shrink-wraps the window (no dead click areas). Blur events
// collapse back to the notch (tap-outside closes). No node in the page.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("island", {
  resize: (w, h) => ipcRenderer.send("island-resize", w, h),
  // idempotent: the renderer re-registers on every state change, so drop
  // the stale listener first (else blur fires N times after N flips).
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
