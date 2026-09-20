/* Steroids demo mascot — orange pill + living-face FSM canvas hero.
 * ART: 100% original capsule (warm Claude-Code orange is color only —
 * NEVER the starburst mark), drawn in code below (no external assets).
 * License: CC0 — do whatever you want with the pixels.
 * Zero dependencies. Shape lock: transparent strip (only clearRect, no
 * scene/backdrop painted), circular blob, big eyes, dark-theme rim light.
 * Personality: SHY. Pupils track the real cursor; hover = bashful
 * (looks away, blushes, peeks back); typing = watches the input, bounce
 * on submit; long idle = nap. Every reaction is event-driven (cursor,
 * pointer, focus/keypress, query lifecycle) — no fake timers.
 *
 * States: idle / walk / think / busy / drag / sleep.
 * Wire-up (called from skill-graph.html, all REAL demo events):
 *   Mascot.think()  — search input (query/scoring running)
 *   Mascot.idle()   — results drawn / fetch settled
 *   Mascot.busy()   — index fetch + force-layout running (startles first)
 * Self-wired (mascot.js attaches directly, no html edits needed):
 *   cursor mousemove, sprite hover, #search focus/keypress/Enter
 */
(function () {
  "use strict";
  var cv = document.getElementById("mascot");
  if (!cv) return;
  var ctx = cv.getContext("2d");
  var S = 6;                 // pixel size
  var W = 0, H = 104;        // strip height fixed
  var PX = 16, PY = 12;      // pill grid (capsule, wider than tall)

  // Pill map: o=outline O=body .=transparent (eyes painted by eye())
  // Rim light + pupils + cheeks + arms + legs are painted per-state on top.
  var BODY = [
    ".....oooooo.....",
    "...ooOOOOOOoo...",
    "..oOOOOOOOOOOo..",
    ".oOOOOOOOOOOOOo.",
    ".oOOOOOOOOOOOOo.",
    "oOOOOOOOOOOOOOOo",
    "oOOOOOOOOOOOOOOo",
    "oOOOOOOOOOOOOOOo",
    "oOOOOOOOOOOOOOOo",
    ".oOOOOOOOOOOOOo.",
    "..oOOOOOOOOOOo..",
    "...ooOOOOOOoo..."
  ];
  var PAL = { o: "#5b3a1e", O: "#e8823c", E: "#fff8ee" };
  var RIM = "#ffd9a8", BLUSH = "#f27d7d", PUPIL = "#23202a";

  var m = {
    state: "idle", frame: 0, ft: 0,
    x: 60, tx: 60, dir: 1,
    idleT: 0, thinkT: 0, blink: 0,
    hover: false, hoverT: 0,      // bashful timer
    cursor: null,                 // {x,y} in strip coords, real mousemove
    watch: false,                 // user in the search field
    bounceT: 0, squashT: 0, startleT: 0, anticT: 0,
    glide: 0, lastPX: 0, lastPT: 0, // drag momentum
    prev: null, blend: 0,         // 150ms cross-blend snapshot
    sleepZ: 0
  };
  function setState(s) {
    if (s !== m.state) {
      // snapshot for cross-blend: every state pair eases, never hard-cuts
      m.prev = { state: m.state, frame: m.frame, x: m.x, dir: m.dir, blink: m.blink > 0 };
      m.blend = 150;
    }
    m.state = s; m.frame = 0; m.ft = 0;
    if (s === "idle") m.idleT = 0;
    if (s === "think") { m.thinkT = 0; m.anticT = 220; } // anticipation crouch
    if (s !== "sleep") m.sleepZ = 0;
    if (s !== "drag") m.glide = 0;
  }
  function wake() {
    if (m.state === "sleep") setState("idle");
    m.idleT = 0;
  }

  function fit() {
    var r = cv.getBoundingClientRect();
    W = Math.max(50, r.width);
    var dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  function baseY() { return H - PY * S - 12; }

  function px(gx, gy, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(gx * S), Math.round(gy * S), S, S);
  }

  // pupil target: cursor-follow, clamped to the eye; shy look-away on hover
  function pupilOff() {
    var ox = 0, oy = 0;
    if (m.hover && Math.floor(m.hoverT / 900) % 2 === 0) {
      return { x: -1, y: 0 }; // bashful: looks away (peek-back on odd beats)
    }
    if (m.watch) return { x: 0, y: -1 }; // watches the input field above
    if (m.cursor) {
      var sx = m.x + (PX * S) / 2, sy = baseY() + 5 * S;
      var dx = m.cursor.x - sx, dy = m.cursor.y - sy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      ox = Math.max(-1, Math.min(1, Math.round(dx / d)));
      oy = Math.max(-1, Math.min(1, Math.round(dy / d)));
    }
    return { x: ox, y: oy };
  }

  function eye(cx, cy, mode, po) {
    // 3x3 white + 1px pupil; modes: open / shut / up / wide
    if (mode === "shut" || m.state === "sleep") {
      ctx.fillStyle = "#5b3a1e";
      ctx.fillRect((cx) * S, (cy + 1) * S + 2, S * 3, 2);
      return;
    }
    ctx.fillStyle = "#fff8ee";
    ctx.fillRect(cx * S, cy * S, S * 3, S * 3);
    ctx.fillStyle = PUPIL;
    var ux = cx + 1 + (po ? po.x : 0), uy = cy + 1 + (po ? po.y : 0);
    if (mode === "up") uy = cy;
    if (mode === "wide") { ctx.fillRect(cx * S, cy * S, S * 3, S * 3); return; }
    ux = Math.max(cx, Math.min(cx + 2, ux));
    uy = Math.max(cy, Math.min(cy + 2, uy));
    ctx.fillRect(ux * S, uy * S, S, S);
  }

  function drawSprite(ox, oy, flip, st, f, blinkOn, ghost) {
    var gx, gy, ch;
    for (gy = 0; gy < PY; gy++) {
      for (gx = 0; gx < PX; gx++) {
        ch = BODY[gy].charAt(gx);
        if (ch === ".") continue;
        var dx = flip ? (PX - 1 - gx) : gx;
        var c = PAL[ch] || "#fff";
        // dark-theme rim light: top arc + upper-left edge
        if (ch === "O" && (gy <= 2 || (gx <= 2 && gy <= 5))) c = RIM;
        px(ox + dx, oy + gy, c);
      }
    }
    var po = ghost ? { x: 0, y: 0 } : pupilOff();
    if (st === "think") { eye(ox + 4, oy + 4, "up"); eye(ox + 9, oy + 4, "up"); }
    else if (st === "busy") { eye(ox + 4, oy + 4, "wide"); eye(ox + 9, oy + 4, "wide"); }
    else if (blinkOn) { eye(ox + 4, oy + 4, "shut"); eye(ox + 9, oy + 4, "shut"); }
    else { eye(ox + 4, oy + 4, "open", po); eye(ox + 9, oy + 4, "open", po); }

    // blush when bashful (hover) — skipped on cross-blend ghosts
    if (m.hover && !ghost) {
      px(ox + 2, oy + 7, BLUSH); px(ox + 3, oy + 7, BLUSH);
      px(ox + 12, oy + 7, BLUSH); px(ox + 13, oy + 7, BLUSH);
    }
    // buffed arms: hang at the sides, flex up when excited/busy
    var flex = (m.bounceT > 0 || st === "busy");
    var ay = oy + (flex ? 2 : 5);
    ctx.fillStyle = "#e8823c";
    ctx.fillRect((ox - 1) * S, ay * S, S, S * 3);
    ctx.fillRect((ox + PX) * S, ay * S, S, S * 3);
    ctx.fillStyle = "#5b3a1e";
    ctx.fillRect((ox - 1) * S, (ay + (flex ? 0 : 2)) * S, S, S);
    ctx.fillRect((ox + PX) * S, (ay + (flex ? 0 : 2)) * S, S, S);
    // legs: idle = both down, walk = alternate lift
    ctx.fillStyle = "#5b3a1e";
    var liftL = (st === "walk" && f === 1), liftR = (st === "walk" && f === 0);
    ctx.fillRect((ox + 5) * S, (oy + 11 + (liftL ? -1 : 0)) * S, S, S);
    ctx.fillRect((ox + 10) * S, (oy + 11 + (liftR ? -1 : 0)) * S, S, S);

    // think bubble appears AFTER the anticipation crouch, never with it
    if (st === "think" && !ghost && m.anticT <= 0) {
      ctx.fillStyle = "#8b949e";
      var n = 1 + (Math.floor(m.thinkT / 300) % 3), i;
      for (i = 0; i < n; i++) ctx.fillRect((ox + 12 + i * 2) * S, (oy - 2 - i) * S, S, S);
      ctx.fillStyle = "#e6e9f0";
      ctx.fillRect((ox + 11) * S, (oy - 6) * S, S * 5, S * 3);
      ctx.fillStyle = "#5b3a1e";
      for (i = 0; i < n; i++) ctx.fillRect((ox + 12 + i) * S, (oy - 5) * S, S, S);
    }
    // busy motion ticks (skipped on ghosts)
    if (st === "busy" && !ghost) {
      ctx.fillStyle = f ? "#7ee787" : "#1f6feb";
      ctx.fillRect((ox - 2) * S, (oy + 3) * S, S, S * 2);
      ctx.fillRect((ox + PX + 1) * S, (oy + 3) * S, S, S * 2);
    }
    // sleep Z's drift up (skipped on ghosts)
    if (st === "sleep" && !ghost) {
      ctx.fillStyle = "#8b949e";
      var z = Math.floor(m.sleepZ / 500) % 3;
      ctx.font = "10px ui-monospace,monospace";
      ctx.fillText("z", (ox + 13) * S, (oy - 1 - z) * S);
      if (z === 2) ctx.fillText("z", (ox + 14) * S, (oy - 3) * S);
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H); // transparent: no scene painted, ever
    var bobY = 0, scX = 1, scY = 1;
    var st = m.state;
    if (st === "idle") scY = 1 + Math.sin(t / 1000) * 0.02;          // breathe
    if (st === "sleep") scY = 1 + Math.sin(t / 1500) * 0.035;        // slow breathe
    if (st === "walk") {                                              // stretch + squash
      bobY = (m.frame === 0 ? -2 : 0);
      scX = (m.frame === 0 ? 1.06 : 0.96); scY = (m.frame === 0 ? 0.94 : 1.04);
    }
    if (st === "busy") bobY = Math.sin(t / 90) * 2;
    if (st === "think" && m.anticT > 0) scY = 0.9;                    // anticipation crouch
    if (m.bounceT > 0) bobY -= Math.abs(Math.sin(m.bounceT / 90)) * 10;
    if (m.squashT > 0) { scX = 1.12; scY = 0.85; }                    // landing squash
    if (m.startleT > 0) { scX = 0.94; scY = 1.1; }                    // startle pop
    var sx = Math.round(m.x / S), sy = Math.round((baseY() + bobY) / S);
    var cxp = m.x + (PX * S) / 2, bot = baseY() + PY * S;
    // cross-blend ghost: previous state fades out under the current one
    if (m.prev && m.blend > 0) {
      ctx.save();
      ctx.globalAlpha = (m.blend / 150) * 0.5;
      var gx = Math.round(m.prev.x / S);
      drawSprite(gx, sy, m.prev.dir < 0, m.prev.state, m.prev.frame, m.prev.blink, true);
      ctx.restore();
    }
    if (scX !== 1 || scY !== 1) {
      ctx.save();
      ctx.translate(cxp, bot); ctx.scale(scX, scY); ctx.translate(-cxp, -bot);
      drawSprite(sx, sy, m.dir < 0, st, m.frame, m.blink > 0, false);
      ctx.restore();
    } else {
      drawSprite(sx, sy, m.dir < 0, st, m.frame, m.blink > 0, false);
    }
    ctx.fillStyle = "#6e7681";
    ctx.font = "10px ui-monospace,monospace";
    ctx.fillText("mascot:" + m.state + (m.hover ? "+shy" : ""), 8, H - 6);
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
    else if ((m.state === "idle") && Math.random() < dt / 4000) m.blink = 150;
    if (m.bounceT > 0) m.bounceT -= dt;
    if (m.squashT > 0) m.squashT -= dt;
    if (m.startleT > 0) m.startleT -= dt;
    if (m.anticT > 0) m.anticT -= dt;
    if (m.blend > 0) { m.blend -= dt; if (m.blend <= 0) m.prev = null; }
    if (m.hover) m.hoverT += dt; else m.hoverT = 0;
    // drag momentum: released fast = glide with friction, then settle
    if (m.state === "drag" && !dragging && m.glide !== 0) {
      m.x += m.glide * dt / 1000;
      m.glide *= Math.pow(0.02, dt / 1000); // friction
      if (m.x < 0) { m.x = 0; m.glide = 0; }
      if (m.x > W - PX * S) { m.x = W - PX * S; m.glide = 0; }
      if (Math.abs(m.glide) < 30) { m.glide = 0; m.squashT = 180; setState("idle"); }
    }

    if (m.state === "walk") {
      var dx = m.tx - m.x;
      m.dir = dx >= 0 ? 1 : -1;
      m.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.09);
      if (Math.abs(dx) < 2) setState("idle");
    } else if (m.state === "idle") {
      m.idleT += dt;
      if (m.idleT > 6000 && m.idleT < 20000) {
        m.idleT = 0; // wanders when idle: genuine idle behavior
        m.tx = 20 + Math.random() * Math.max(40, W - PX * S - 40);
        setState("walk");
      } else if (m.idleT >= 20000) {
        setState("sleep"); // long idle: naps, wakes on any event
      }
    }
    if (m.state === "think") m.thinkT += dt;
    if (m.state === "sleep") m.sleepZ += dt;
    draw(t);
    requestAnimationFrame(loop);
  }

  // --- real-event wiring (self-attached) ---
  function stripPos(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  window.addEventListener("mousemove", function (e) {
    m.cursor = stripPos(e); // pupils follow the real cursor
  }, { passive: true });

  function overSprite(e) {
    var p = stripPos(e);
    return p.x >= m.x && p.x <= m.x + PX * S && p.y >= baseY() && p.y <= baseY() + PY * S;
  }
  cv.addEventListener("pointermove", function (e) {
    if (!dragging) { m.hover = overSprite(e); if (m.hover) wake(); }
  });

  var dragging = false;
  function toX(e) {
    var r = cv.getBoundingClientRect();
    return Math.max(0, Math.min(W - PX * S, e.clientX - r.left - (PX * S) / 2));
  }
  cv.addEventListener("pointerdown", function (e) {
    dragging = true; wake(); m.tx = m.x; m.glide = 0;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    setState("drag");
    m.x = toX(e);
    e.preventDefault();
  });
  cv.addEventListener("pointermove", function (e) {
    if (dragging) {
      var nx = toX(e), now = performance.now();
      if (m.lastPT > 0 && now > m.lastPT) m.glide = (nx - m.lastPX) / ((now - m.lastPT) / 1000);
      m.lastPX = nx; m.lastPT = now;
      m.x = nx; m.dir = 1;
    }
  });
  function drop() {
    if (!dragging) return;
    dragging = false;
    m.lastPT = 0;
    if (Math.abs(m.glide) < 60) { // slow release: stop dead + squash
      m.glide = 0; m.squashT = 180;
      setState("idle");
    } // fast release: loop() glides it home, squash on settle
  }
  cv.addEventListener("pointerup", drop);
  cv.addEventListener("pointercancel", drop);

  // typing: watches the real search field, bounce on submit
  var search = document.getElementById("search");
  if (search) {
    search.addEventListener("focus", function () { wake(); m.watch = true; });
    search.addEventListener("blur", function () { m.watch = false; });
    search.addEventListener("keypress", function () {
      wake(); m.watch = true;
      if (m.state !== "drag" && m.state !== "think" && m.state !== "busy") setState("idle");
    });
    search.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { wake(); m.bounceT = 450; } // excited bounce
    });
  }

  window.Mascot = {
    think: function () { wake(); if (m.state !== "drag") setState("think"); },
    idle: function () { if (m.state !== "drag" && m.state !== "walk" && m.state !== "sleep") setState("idle"); },
    busy: function () {
      wake();
      if (m.state !== "drag") { m.startleT = 200; setState("busy"); } // startle pop
    },
    state: function () { return m.state; }
  };

  window.addEventListener("resize", fit);
  fit();
  requestAnimationFrame(loop);
})();
