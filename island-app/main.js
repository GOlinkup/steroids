// SHEET-FREEZE — human order 2026-10-11: top-center positioning + sheet
// geometry locked. No agent edits this file until the human says "unfreeze".
// Enforced by tests/test_sheet_freeze.py. Details: CONTRIBUTING.md.
// Steroids Island — transparent top-center widget (Glance-notch idiom).
// Frameless + see-through + always-on-top; only the island pill paints.
// One fixed window (PANEL or STRIP per display, see below); the renderer
// reports sheet state, the compositor pin owns position, and losing focus
// drops the panel back to the notch (tap-outside closes).
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
  const p = panelFor(wa);
  tracked.panelW = p.w; tracked.panelH = p.h;
  tracked.x = Math.round(wa.x + (wa.width - STRIP.w) / 2);
  tracked.y = wa.y;
  win = new BrowserWindow({
    width: STRIP.w,
    height: STRIP.h, // boot is always a closed state; panel applies on open
    x: tracked.x, // first guess only; kwin-pin.js enforces scene center
    y: tracked.y, // notch-anchored at the very top
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // resizable stays TRUE: with false, Chromium ratchets WM min-size up
    // on every growth and later shrinks are refused (pill stuck huge).
    // Frameless = no grab handles anyway. (Coucou's Linux note is the same
    // GTK quirk — they re-assert resizable before every resize; so do we
    // in placeWindow below.)
    resizable: true,
    minWidth: 120,
    minHeight: 40,
    fullscreenable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadURL(URL);
  // First-map placement can override our position (pre-map client moves are
  // ignored — settled read 0,0 on a slow first paint). Re-assert center from
  // the live display once the first frame is in (post-map writes stick),
  // plus one late backstop for slow bridges. X11 only: on Wayland the
  // compositor pin (windowAdded hook) owns first placement.
  const reassert = () => {
    if (!win || win.isDestroyed() || !IS_X11) return;
    try {
      const b = win.getBounds();
      const wa2 = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 }).workArea;
      const isX11b = process.argv.join(" ").includes("ozone-platform=x11");
      const cx2 = Math.round(wa2.x + (wa2.width - b.width) / 2);
      win.setPosition(cx2, wa2.y, false);
    } catch { /* window gone */ }
  };
  win.once("ready-to-show", () => setTimeout(reassert, 300));
  setTimeout(reassert, 4000);
  // boot position proof (one line). On X11 getBounds is truthful; on
  // Wayland the compositor owns position (see place()), so the proof is
  // the pin's presence, not our coordinates.
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    try {
      if (IS_X11) {
        const b = win.getBounds();
        const waS = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 }).workArea;
        const cxS = Math.round(waS.x + (waS.width - b.width) / 2);
        const anchored = Math.abs(b.x - cxS) <= 2 && Math.abs(b.y - waS.y) <= 2;
        console.log("[island-settled]", JSON.stringify(win.getBounds()), anchored ? "top-center OK" : "NOT top-center (pin missing?)");
      } else {
        console.log("[island-settled] wayland: position is compositor-owned (kwin-pin), size", JSON.stringify(win.getSize()));
      }
    } catch { /* noop */ }
  }, 5500);
  // every move, logged. Moves now mean: panel/strip toggles, display
  // changes, and compositor corrections only — steady states never move.
  win.on("move", () => {
    try { console.log("[island-move]", JSON.stringify(win.getBounds())); } catch { /* noop */ }
  });
  // positioning has ONE writer per platform (placeWindow below) plus the
  // compositor-side kwin-pin.js (convergent: only writes when >2px off).
  // Reasserts on ready-to-show + 4s backstop stay for first-map races.
  win.on("blur", () => {
    if (win && !win.isDestroyed()) win.webContents.send("island-blur");
  });
}

// ponytail: ONE SHEET, ONE WIDTH (coucou's exact model — their window is
// always the fixed PANEL or the wake strip). Width is constant per display
// so x never moves and y is always the top edge: view switches only ever
// change HEIGHT, atomically, which cannot jitter position. Heights come
// from a fixed per-view table (measured 2026-10-11 + ~15px slack — the old
// shrink-wrap converged to these same numbers). The renderer reports STATE
// only (island-state). NOTE: their click-through input regions are NOT
// portable — Electron's setIgnoreCursorEvents does not exist on Linux
// (proven: TypeError at boot), and Wayland offers Electron no region API.
// So dead areas are avoided structurally instead: the strip fits the pill
// exactly, and jacked cards paint their whole window (opaque, min-height
// fill) — clicks landing on paint are harmless.
const IS_X11 = process.argv.join(" ").includes("ozone-platform=x11");
const STRIP = { w: 228, h: 44 };
// ponytail: window = body cap + 70 (navbar 46 + island padding 16 + gaps),
// except chat: the team rail rides INSIDE the card above the log, so chat
// needs card-fit (rail 71 + gaps + log cap 203 + composer 76 + nav + pad).
// Measured live: card ran 368 in a 320 body and the sticky composer buried
// the log tail 39px deep. Chat fits its card exactly: no body scroll, the
// sticky never engages, overlap structurally impossible.
const FOOT_H = { approval: 312, question: 437, chat: 417, daily: 427, explore: 797, settings: 842, lens: 872, shelf: 917, feed: 917 };
function panelFor(wa) {
  return { w: Math.min(1020, wa.width - 16), h: Math.max(500, wa.height - 120) };
}
// Tracked truth (never read back on Wayland — getBounds lies there).
const tracked = {
  x: 0, y: 0, panelW: 1020, panelH: 960, collapsed: true, state: "hidden",
  view: "", lastName: "", appliedKey: "",
};
// One function owns every size: closed strip, or jacked width (constant)
// + per-view height table. Display changes flow through here too.
function footprintSize(state, view, wa) {
  const p = panelFor(wa);
  if (state !== "jacked") return { name: "strip", w: STRIP.w, h: STRIP.h, panel: p };
  if (FOOT_H[view]) return { name: view, w: p.w, h: FOOT_H[view], panel: p };
  return { name: "full", w: p.w, h: p.h, panel: p };
}
function placeWindow(w, h, wa) {
  // GTK quirk (theirs too, island.rs): re-assert resizable before sizing
  // or shrinks get refused and the pill sticks huge.
  try { win.setResizable(true); } catch { /* gone */ }
  // ponytail: no lateral slide — a width toggle (strip<->panel) recenters,
  // and resize-then-recenter paint as two frames: the card visibly glides
  // sideways (worse on close, which reads as sliding right instead of
  // docking center). Fade the window out across the toggle and back in
  // once the pin has re-pinned (300ms covers the slowest correction seen;
  // the content cover runs 380ms, so both lift together); height-only view
  // switches keep their size class and never fade. Retrigger-safe.
  const widthSwap = tracked.lastW > 0 && w !== tracked.lastW;
  tracked.lastW = w;
  if (widthSwap) {
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    try { win.setOpacity(0); } catch { /* gone */ }
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      if (!win || win.isDestroyed()) return;
      try { win.setOpacity(1); } catch { /* gone */ }
    }, 300);
  }
  if (IS_X11) {
    const cx = Math.round(wa.x + (wa.width - w) / 2);
    tracked.x = cx; tracked.y = wa.y;
    win.setBounds({ x: cx, y: wa.y, width: w, height: h }, false);
  } else {
    // Wayland: size only — the compositor pin owns position (its hook fires
    // on this resize and re-pins). tracked x/y assume the pin's formula,
    // identical to ours.
    tracked.x = Math.round(wa.x + (wa.width - w) / 2); tracked.y = wa.y;
    win.setSize(w, h, false);
  }
}
// The one writer. Grows apply instantly (card expands into room); the
// collapse to strip waits out the 340ms card flight (their 420ms delayed
// collapse), cancelled by a reopen. Display changes force re-apply.
let shrinkTimer = null;
let fadeTimer = null;
function syncWindow(force) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const wa = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 }).workArea;
  const p = panelFor(wa);
  tracked.panelW = p.w; tracked.panelH = p.h;
  const f = footprintSize(tracked.state, tracked.view, wa);
  const w = f.w, h = f.h;
  const key = `${f.name}x${w}x${h}`;
  if (!force && key === tracked.appliedKey) return;
  // ponytail: only the collapse to strip is delayed (card shrinks first,
  // window follows +340ms). Every grow — strip→panel or short→tall view —
  // applies instantly: the card always expands into room, never into edge.
  const collapsing = f.name === "strip" && tracked.lastName !== "" && tracked.lastName !== "strip";
  tracked.collapsed = f.name === "strip";
  tracked.lastName = f.name;
  tracked.appliedKey = key;
  if (shrinkTimer) { clearTimeout(shrinkTimer); shrinkTimer = null; }
  console.log("[island-sheet]", JSON.stringify({ state: tracked.state, view: tracked.view, ask: [w, h], when: collapsing ? "+340ms" : "now" }));
  if (collapsing) {
    shrinkTimer = setTimeout(() => {
      shrinkTimer = null;
      if (!win || win.isDestroyed()) return;
      placeWindow(w, h, wa);
    }, 340);
  } else {
    placeWindow(w, h, wa);
  }
}
ipcMain.on("island-state", (_e, state, view) => {
  tracked.state = String(state || "hidden");
  tracked.view = String(view || "");
  syncWindow(false);
});

app.whenReady().then(() => {
  // ponytail: ensure the compositor pin every boot (coucou's layer-shell
  // anchor is built into their shell; ours is kwin-pin.js and must be
  // loaded no matter which launcher started the app — run.sh does it too,
  // this is the backstop). Best-effort: failure just logs.
  try {
    const { execFileSync } = require("node:child_process");
    execFileSync("busctl", ["--user", "call", "org.kde.KWin", "/Scripting",
      "org.kde.kwin.Scripting", "loadScript", "s", path.join(__dirname, "kwin-pin.js")],
      { timeout: 8000 });
    execFileSync("busctl", ["--user", "call", "org.kde.KWin", "/Scripting",
      "org.kde.kwin.Scripting", "start"], { timeout: 8000 });
    console.log("[kwin-pin] ensured (compositor owns position)");
  } catch (e) {
    console.log("[kwin-pin] ensure failed (positioning unmanaged):", String(e).slice(0, 120));
  }
  createWindow();
  // ponytail: display-layout watch (coucou screen-changed parity — their
  // Rust cursor-poll notices a changed layout ~2x/sec and repositions;
  // Electron gets real screen events instead, so re-pin here, only here).
  const repositionCurrent = (why) => {
    if (!win || win.isDestroyed()) return;
    try {
      // Display geometry changed: panel dims may differ — force the one
      // sheet to re-apply on the new display (pin hook fires on the resize
      // and re-pins). No content is measured, ever.
      tracked.appliedKey = "";
      if (IS_X11) {
        const b = win.getBounds();
        const wa = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 }).workArea;
        const p = panelFor(wa);
        tracked.panelW = p.w; tracked.panelH = p.h;
        const f = footprintSize(tracked.state, tracked.view, wa);
        const cx = Math.round(wa.x + (wa.width - f.w) / 2);
        tracked.x = cx; tracked.y = wa.y;
        tracked.collapsed = f.name === "strip";
        tracked.lastName = f.name;
        tracked.appliedKey = `${f.name}x${f.w}x${f.h}`;
        win.setBounds({ x: cx, y: wa.y, width: f.w, height: f.h }, false);
        console.log("[island-reposition]", JSON.stringify({ why, ask: [f.w, f.h] }));
        return;
      }
      syncWindow(true);
      console.log("[island-reposition]", JSON.stringify({ why, sheet: true }));
    } catch { /* window gone */ }
  };
  screen.on("display-added", () => repositionCurrent("added"));
  screen.on("display-removed", () => repositionCurrent("removed"));
  screen.on("display-metrics-changed", () => repositionCurrent("metrics"));
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
});

app.on("second-instance", () => {
  if (win) { win.show(); win.focus(); }
});

// tray owns the lifecycle — closing the last window never quits.
app.on("window-all-closed", (e) => e.preventDefault());
