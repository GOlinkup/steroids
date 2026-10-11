// SHEET-FREEZE — human order 2026-10-11: top-center positioning + sheet
// geometry locked. No agent edits this file until the human says "unfreeze".
// Enforced by tests/test_sheet_freeze.py. Details: CONTRIBUTING.md.
// Steroids Island notch pin (KWin script).
// The island is a widget, not a window: keep it top-center of its output.
// External moves are ignored on this setup and client-side placement gets
// mangled, so the compositor itself enforces x/y (size stays the client's).
function targetFor(win) {
  var area = workspace.clientArea(KWin.FullScreenArea, win);
  var g = win.frameGeometry;
  return {
    x: Math.round(area.x + (area.width - g.width) / 2),
    y: area.y,
  };
}

function pin(win) {
  if (!win || !isIsland(win)) {
    return;
  }
  var t = targetFor(win);
  var g = win.frameGeometry;
  if (Math.abs(g.x - t.x) > 2 || Math.abs(g.y - t.y) > 2) {
    print("[island-pin] move " + g.x + "," + g.y + " " + g.width + "x" + g.height + " -> " + t.x + "," + t.y);
    win.frameGeometry = { x: t.x, y: t.y, width: g.width, height: g.height };
  }
}

function isIsland(win) {
  var cap = "";
  var cls = "";
  try { cap = String(win.caption || ""); } catch (e) {}
  try { cls = String(win.resourceClass || ""); } catch (e2) {}
  return cap.indexOf("Steroids Island") === 0 || cls.toLowerCase().indexOf("electron") !== -1;
}

function watch(win) {
  if (!win || !isIsland(win)) {
    return;
  }
  pin(win);
  win.frameGeometryChanged.connect(function () {
    pin(win);
  });
}

workspace.windowAdded.connect(watch);
workspace.windowList().forEach(watch);
