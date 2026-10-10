// Steroids Island — transparent top-center widget (Glance-notch idiom).
// Frameless + see-through + always-on-top; only the island pill paints.
// The window shrink-wraps the pill (renderer reports #island's size, see
// preload.js) so dead transparent areas never eat desktop clicks, and
// losing focus drops the panel back to the notch (tap-outside closes).
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, clipboard } = require("electron");
const path = require("node:path");

const URL = "http://127.0.0.1:8096/?app=1"; // transparent — never &bg=black (opaque brave fallback)

let win = null;

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  // island follows the cursor's display — primary is the wrong screen
  // on multi-monitor, and the notch landed off-center because of it.
  // workArea is DIP-correct on 4k/HiDPI and clears the system top bar.
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  console.log("[island-display]", JSON.stringify(wa));
  const w0 = Math.min(420, wa.width - 16);  win = new BrowserWindow({
    width: w0,
    height: 96, // renderer reports the real height on load
    x: Math.round(wa.x + (wa.width - w0) / 2), // first guess only; kwin-pin.js enforces scene center
    y: wa.y, // notch-anchored at the very top
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // resizable stays TRUE: with false, Chromium ratchets WM min-size up
    // on every growth and later shrinks are refused (pill stuck huge).
    // Frameless = no grab handles anyway; floors match the resize clamp.
    resizable: true,
    minWidth: 120,
    minHeight: 48,
    fullscreenable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadURL(URL);
  win.on("blur", () => {
    if (win && !win.isDestroyed()) win.webContents.send("island-blur");
  });
}

// renderer-driven shrink-wrap: small + top-centered, never taller
// than the work area (tall chat logs scroll inside instead of clipping).
// w is capped at the open-panel width — never the full screen width
// (that strip read as a giant middle-screen bar on 4k).
ipcMain.on("island-resize", (_e, w, h) => {
  if (!win || win.isDestroyed()) return;
  // anchor to the window's CURRENT display — cursor-follow teleported the
  // pill across screens on every resize (minimal "lost position").
  // Cursor display is only for first placement (createWindow above).
  const b = win.getBounds();
  const wa = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 }).workArea;
  w = Math.max(120, Math.min(wa.width - 16, 1020, Math.round(w || 0)));
  h = Math.max(48, Math.min(wa.height, Math.round(h || 0)));
  const [cw, ch] = win.getSize();
  if (Math.abs(cw - w) < 2 && Math.abs(ch - h) < 2) return;
  console.log("[island-bounds]", JSON.stringify({ ask: [w, h], pos: win.getPosition(), size: win.getSize() }));
  win.setSize(w, h, false);
  // Position: kwin-pin.js (KWin script, scene coords) owns position and
  // Electron owns size only — but the pin matches by caption/class and can
  // miss (Wayland app-id), leaving the window at 0,0. So mirror its math
  // here too (same center — two writers, one value, no fight). X11 keeps
  // the old mirrored write for its flipped client view.
  // ponytail: X11-only mirror hack; Wayland writes plain center.
  const cx = Math.round(wa.x + (wa.width - w) / 2);
  const isX11 = process.argv.join(" ").includes("ozone-platform=x11");
  win.setPosition(isX11 ? -cx : cx, wa.y, false);
});

app.whenReady().then(() => {
  createWindow();
  const tray = new Tray(
    path.join(__dirname, "..", "island-ui", "public", "icon-192.png"),
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show island", click: () => { win.show(); win.focus(); } },
      { label: "Hide island", click: () => win.hide() },
      { type: "separator" },
      { label: "Quit island", click: () => app.quit() },
    ]),
  );
  tray.setToolTip("Steroids Island");
  app.on("activate", () => win.show());
  // Command Echo (glance): any system copy swells the pill with a preview
  // + mascot yay. Local only — clipboard text never leaves this machine
  // (only the preview string crosses to the renderer).
  let lastClip = "";
  setInterval(() => {
    try {
      const t = clipboard.readText();
      if (t && t !== lastClip) {
        lastClip = t;
        console.log("[island-echo]", JSON.stringify(t.slice(0, 48)));
        if (win && !win.isDestroyed()) win.webContents.send("island-echo", t.slice(0, 200));
      }
    } catch { /* clipboard busy — next tick */ }
  }, 700);
});

app.on("second-instance", () => {
  if (win) { win.show(); win.focus(); }
});

// tray owns the lifecycle — closing the last window never quits.
app.on("window-all-closed", (e) => e.preventDefault());
