/* Steroids demo mascot — pixel sprite + tiny FSM canvas hero.
 * ART: 100% original, drawn in code below (no external assets).
 * License: CC0 — do whatever you want with the pixels.
 * Zero dependencies. Retro feel via pixelated rendering + walk bob + blink.
 *
 * States: idle / walk / think / busy / drag.
 * Wire-up (called from skill-graph.html, all REAL demo events):
 *   Mascot.think() — search input (query/scoring running)
 *   Mascot.idle()  — results drawn / fetch settled
 *   Mascot.busy()  — index fetch + force-layout running
 *   drag           — pointer down anywhere on the strip (left included)
 */
(function () {
  "use strict";
  var cv = document.getElementById("mascot");
  if (!cv) return;
  var ctx = cv.getContext("2d");
  var S = 6;                 // pixel size
  var W = 0, H = 104;        // strip height fixed
  var PX = 12, PY = 13;      // sprite grid

  // Body map: o=outline O=body L=highlight E=eye-white .=transparent
  // Pupils/legs/bubbles/motion-lines are drawn per-state on top.
  var BODY = [
    "....oooo....",
    "..ooOOOOoo..",
    ".oOOOOOOOOo.",
    ".oOLOOOOOOo.",
    "oOOOOOOOOOOo",
    "oOEEOOOEEOOo",
    "oOEEOOOEEOOo",
    "oOOOOOOOOOOo",
    "oOOOOOOOOOOo",
    ".oOOOOOOOOo.",
    "..ooOOOOoo..",
    "............",
    "............"
  ];
  var PAL = { o: "#5b3a1e", O: "#e8823c", L: "#f7b267", E: "#fff8ee" };

  var m = {
    state: "idle", frame: 0, ft: 0,
    x: 60, tx: 60, dir: 1, y: 0,
    idleT: 0, thinkT: 0, blink: 0, bob: 0
  };

  function fit() {
    var r = cv.getBoundingClientRect();
    W = Math.max(50, r.width);
    var dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    m.y = H - PY * S - 14;
  }

  function px(gx, gy, c) {
    ctx.fillStyle = c;
    ctx.fillRect(gx * S, gy * S, S, S);
  }

  function drawSprite(ox, oy, flip) {
    var gx, gy, ch;
    for (gy = 0; gy < PY; gy++) {
      for (gx = 0; gx < PX; gx++) {
        ch = BODY[gy].charAt(gx);
        if (ch === ".") continue;
        var dx = flip ? (PX - 1 - gx) : gx;
        px(ox + dx, oy + gy, PAL[ch] || "#fff");
      }
    }
    var st = m.state, f = m.frame;
    var ex = flip ? -1 : 1; // eye lean direction (walk facing)
    var eo = (st === "walk") ? ex : 0;

    function eye(cx, cy, mode) {
      // mode: open / shut / up / wide
      if (mode === "shut") { ctx.fillStyle = "#5b3a1e"; ctx.fillRect((ox + cx) * S, (oy + cy) * S + 2, S * 2, 2); return; }
      ctx.fillStyle = "#fff8ee"; ctx.fillRect((ox + cx) * S, (oy + cy) * S, S * 2, S * 2);
      ctx.fillStyle = "#23202a";
      var py = cy, pxx = cx;
      if (mode === "up") py = cy;
      if (mode === "wide") { ctx.fillRect((ox + cx) * S, (oy + py) * S, S * 2, S * 2); return; }
      var off = (mode === "up") ? 0 : S;
      ctx.fillRect((ox + pxx) * S + (eo > 0 ? 2 : 0), (oy + py) * S + off, S, S);
    }

    if (st === "think") { eye(2, 5, "up"); eye(8, 5, "up"); }
    else if (st === "busy") { eye(2, 5, "wide"); eye(8, 5, "wide"); }
    else if (m.blink > 0) { eye(2, 5, "shut"); eye(8, 5, "shut"); }
    else { eye(2, 5, "open"); eye(8, 5, "open"); }

    // legs: idle = both down, walk = alternate lift
    ctx.fillStyle = "#5b3a1e";
    var liftL = (st === "walk" && f === 1), liftR = (st === "walk" && f === 0);
    ctx.fillRect((ox + 3) * S, (oy + 11 + (liftL ? -1 : 0)) * S, S, S);
    ctx.fillRect((ox + 8) * S, (oy + 11 + (liftR ? -1 : 0)) * S, S, S);

    // think bubble: animated dots
    if (st === "think") {
      ctx.fillStyle = "#8b949e";
      var n = 1 + (Math.floor(m.thinkT / 300) % 3);
      for (var i = 0; i < n; i++) ctx.fillRect((ox + 9 + i * 2) * S, (oy - 2 - i) * S, S, S);
      ctx.fillStyle = "#e6e9f0";
      ctx.fillRect((ox + 8) * S, (oy - 6) * S, S * 5, S * 3);
      ctx.fillStyle = "#5b3a1e";
      for (var d = 0; d < n; d++) ctx.fillRect((ox + 9 + d) * S, (oy - 5) * S, S, S);
    }
    // busy motion lines
    if (st === "busy") {
      ctx.fillStyle = f ? "#7ee787" : "#1f6feb";
      ctx.fillRect((ox - 2) * S, (oy + 3) * S, S, S * 2);
      ctx.fillRect((ox - 2) * S, (oy + 7) * S, S, S * 2);
      ctx.fillRect((ox + PX + 1) * S, (oy + 3) * S, S, S * 2);
      ctx.fillRect((ox + PX + 1) * S, (oy + 7) * S, S, S * 2);
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    // ground shadow
    ctx.fillStyle = "rgba(126,231,135,.15)";
    var sw = PX * S * 0.7;
    ctx.fillRect(m.x * 1 + PX * S * 0.15, m.y + PY * S, sw, 3);
    var bobY = 0;
    if (m.state === "walk") bobY = (m.frame === 0 ? -2 : 0);
    if (m.state === "busy") bobY = Math.sin(t / 90) * 2;
    var flip = m.dir < 0;
    ctx.save();
    var sx = Math.round(m.x / S), sy = Math.round((m.y + bobY) / S);
    drawSprite(sx, sy, flip);
    ctx.restore();
    // state label (proves the FSM is live)
    ctx.fillStyle = "#6e7681";
    ctx.font = "10px ui-monospace,monospace";
    ctx.fillText("mascot:" + m.state, 8, H - 6);
    ctx.fillStyle = "#3b4763";
    ctx.fillText("drag me anywhere", W - 110, H - 6);
  }

  var last = 0;
  function loop(t) {
    var dt = Math.min(100, t - (last || t)); last = t;
    m.ft += dt;
    if (m.ft > (m.state === "walk" ? 160 : 300)) {
      m.ft = 0; m.frame = (m.frame + 1) % 2;
    }
    if (m.blink > 0) m.blink -= dt;
    else if (m.state === "idle" && Math.random() < dt / 4000) m.blink = 150;

    if (m.state === "walk") {
      var dx = m.tx - m.x;
      m.dir = dx >= 0 ? 1 : -1;
      m.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.09);
      if (Math.abs(dx) < 2) setState("idle");
    } else if (m.state === "idle") {
      m.idleT += dt;
      if (m.idleT > 5000) { // wander off on its own: feels alive
        m.idleT = 0;
        m.tx = 20 + Math.random() * Math.max(40, W - PX * S - 40);
        setState("walk");
      }
    }
    if (m.state === "think") m.thinkT += dt;
    draw(t);
    requestAnimationFrame(loop);
  }

  function setState(s) {
    if (m.state === "drag" && s !== "drag") { /* released below */ }
    m.state = s; m.frame = 0; m.ft = 0;
    if (s === "idle") m.idleT = 0;
    if (s === "think") m.thinkT = 0;
  }

  // drag via pointer events — anywhere on the strip, left included
  var dragging = false;
  function toX(e) {
    var r = cv.getBoundingClientRect();
    return Math.max(0, Math.min(W - PX * S, e.clientX - r.left - (PX * S) / 2));
  }
  cv.addEventListener("pointerdown", function (e) {
    dragging = true; m.tx = m.x;
    cv.setPointerCapture(e.pointerId);
    m._pre = (m.state === "drag") ? "idle" : m.state;
    setState("drag");
    m.x = toX(e);
    e.preventDefault();
  });
  cv.addEventListener("pointermove", function (e) {
    if (dragging) { m.x = toX(e); m.dir = 1; }
  });
  function drop() {
    if (!dragging) return;
    dragging = false;
    setState("idle");
  }
  cv.addEventListener("pointerup", drop);
  cv.addEventListener("pointercancel", drop);

  window.Mascot = {
    think: function () { if (m.state !== "drag") setState("think"); },
    idle: function () { if (m.state !== "drag" && m.state !== "walk") setState("idle"); },
    busy: function () { if (m.state !== "drag") setState("busy"); },
    state: function () { return m.state; }
  };

  window.addEventListener("resize", fit);
  fit();
  requestAnimationFrame(loop);
})();
