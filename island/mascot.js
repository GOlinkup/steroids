// Steroids island mascot — Canvas 2D pixel renderer. Version lives in pyproject.toml.
//
// Ours: 14x14 spotter with headband + right-side knot tails (asymmetric on
// purpose — symmetric blobs read AI-generated). Motion is plate snap, not
// bounce: poke squish 140ms, strain line-eyes 800ms (a rep, not "annoyed"),
// flex pulse 600ms (no 720 spin), breathe 3s, jump 500ms.
(function (g) {
  'use strict';

  var C = {
    skin: '#e8823c', light: '#f7cf9f', top: '#f2c184', dark: '#b95f26',
    white: '#fff6ea', pupil: '#14100b', band: '#ff4d1c'
  };

  // Static body rects [x, y, w, h, color] — eyes/pupils drawn separately.
  // Row y=4 is the headband; x12-13 tails fly right only.
  var BODY = [
    [4, 3, 6, 1, C.top],
    [2, 4, 10, 1, C.band],
    [12, 4, 2, 1, C.band],
    [1, 5, 12, 1, C.skin],
    [0, 5, 1, 3, C.dark], [13, 5, 1, 3, C.dark],
    [1, 6, 1, 2, C.skin], [5, 6, 4, 2, C.skin], [12, 6, 1, 2, C.skin],
    [1, 8, 1, 1, C.skin], [2, 8, 3, 1, C.white],
    [5, 8, 4, 1, C.skin], [9, 8, 3, 1, C.white], [12, 8, 1, 1, C.skin],
    [2, 9, 10, 1, C.skin]
  ];

  // Eye whites + pupil cell, per eye. Eye pivot y = 7 (blink squashes about it).
  var EYES = [
    { cx: 3.5, whites: [[2, 6, 3, 1], [2, 7, 1, 1], [4, 7, 1, 1]], pupil: [3, 7] },
    { cx: 10.5, whites: [[9, 6, 3, 1], [9, 7, 1, 1], [11, 7, 1, 1]], pupil: [10, 7] }
  ];

  function Mascot(canvas, opts) {
    opts = opts || {};
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.px = opts.px || 8;
    canvas.width = 14 * this.px;
    canvas.height = 14 * this.px;
    this.look = { x: 0, y: 0 };
    this.reduce = typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    var now = this._now();
    this.nextBlink = now + 2000;
    this.blinkUntil = 0;
    this.squishUntil = 0;
    this.annoyedUntil = 0;
    this.dizzyUntil = 0; this.dizzyFrom = 0;
    this.jumpUntil = 0; this.jumpFrom = 0;
    this._raf = 0; this._dead = false;
    if (!this.reduce) this._loop();
    else this._draw(now);
  }

  Mascot.prototype._now = function () {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
  };

  // --- triggers (steroids reps) ---
  Mascot.prototype.poke = function () { this.squishUntil = this._now() + 140; };
  Mascot.prototype.annoy = function () {
    var n = this._now();
    this.squishUntil = n + 140; this.annoyedUntil = n + 800; // strain face
  };
  Mascot.prototype.dizzy = function () {
    var n = this._now();
    this.dizzyFrom = n; this.dizzyUntil = n + 600; // flex pulse, not a spin
  };
  Mascot.prototype.celebrate = function () {
    var n = this._now();
    this.jumpFrom = n; this.jumpUntil = n + 500;
  };
  Mascot.prototype.setLook = function (x, y) {
    this.look.x = Math.max(-1, Math.min(1, x));
    this.look.y = Math.max(-1, Math.min(1, y));
  };
  Mascot.prototype.destroy = function () {
    this._dead = true;
    if (this._raf) cancelAnimationFrame(this._raf);
  };

  Mascot.prototype._loop = function () {
    var self = this;
    function frame() {
      if (self._dead) return;
      self._draw(self._now());
      self._raf = requestAnimationFrame(frame);
    }
    this._raf = requestAnimationFrame(frame);
  };

  Mascot.prototype._draw = function (now) {
    var ctx = this.ctx, px = this.px;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);

    // auto-blink every 4.6s, 120ms shut
    if (!this.reduce && now >= this.nextBlink) {
      this.blinkUntil = now + 120;
      this.nextBlink = now + 4600;
    }
    var blinking = now < this.blinkUntil;

    // breathe 3s: scaleY 1 -> 1.03
    var br = 1;
    if (!this.reduce) br = 1 + 0.03 * (0.5 - 0.5 * Math.cos(now / 3000 * Math.PI * 2));

    var sx = 1, sy = br;
    if (now < this.squishUntil) { sx = 1.15; sy = 0.85; }

    // jump curve: up -30% @35%, overshoot, settle (matches logo-jump CSS)
    var dy = 0;
    if (now < this.jumpUntil) {
      var jp = (now - this.jumpFrom) / 500;
      if (jp < 0.35) dy = -4.2 * (jp / 0.35);
      else if (jp < 0.7) dy = -4.2 + 4.2 * ((jp - 0.35) / 0.35);
      else { var k = (jp - 0.7) / 0.3; dy = 1.1 * Math.sin(k * Math.PI) * -1 + 0; }
    }

    ctx.save();
    ctx.translate(this.cv.width / 2, this.cv.height); // pivot: bottom-center
    if (now < this.dizzyUntil && !this.reduce) {
      // ponytail: flex pulse (a rep), not a 720 spin — scale only.
      var dp = (now - this.dizzyFrom) / 600;
      var flex = 1 + 0.12 * Math.sin(dp * Math.PI);
      ctx.scale(flex, 2 - flex);
    } else {
      ctx.scale(sx, sy);
    }
    ctx.translate(-this.cv.width / 2 + 0, -this.cv.height + dy * px / 4);

    var i, r;
    for (i = 0; i < BODY.length; i++) {
      r = BODY[i];
      ctx.fillStyle = r[4];
      ctx.fillRect(r[0] * px, r[1] * px, r[2] * px, r[3] * px);
    }

    var annoyed = now < this.annoyedUntil;
    for (var e = 0; e < EYES.length; e++) {
      var eye = EYES[e];
      if (annoyed) {
        ctx.fillStyle = C.pupil; // line eyes
        ctx.fillRect((eye.cx - 1.5) * px, 6.8 * px, 3 * px, 0.35 * px);
        continue;
      }
      var eyeSY = blinking ? 0.08 : 1;
      ctx.save();
      ctx.translate(eye.cx * px, 7 * px);
      ctx.scale(1, eyeSY);
      ctx.translate(-eye.cx * px, -7 * px);
      ctx.fillStyle = C.white;
      for (i = 0; i < eye.whites.length; i++) {
        r = eye.whites[i];
        ctx.fillRect(r[0] * px, r[1] * px, r[2] * px, r[3] * px);
      }
      if (!blinking && !(now < this.dizzyUntil)) {
        ctx.fillStyle = C.pupil;
        var ox = this.look.x * 0.8, oy = this.look.y * 0.8;
        ctx.fillRect((eye.pupil[0] + ox) * px, (eye.pupil[1] + oy) * px, px, px);
      }
      ctx.restore();
    }
    ctx.restore();
  };

  g.SteroidsMascot = Mascot;
})(typeof window !== 'undefined' ? window : globalThis);
