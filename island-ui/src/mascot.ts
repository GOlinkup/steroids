// Steroids island mascot — Canvas 2D pixel renderer, TypeScript.
// Ours: headband + right-side knot tails, plate-snap motion.

const C = {
  skin: "#e8823c",
  light: "#f7cf9f",
  top: "#f2c184",
  dark: "#b95f26",
  white: "#fff6ea",
  pupil: "#14100b",
  band: "#ff4d1c",
};

// Static body rects [x, y, w, h, color] — eyes/pupils drawn separately.
// Row y=4 is the headband; x12-13 tails fly right only.
const BODY: Array<[number, number, number, number, string]> = [
  [4, 3, 6, 1, C.top],
  [2, 4, 10, 1, C.band],
  [12, 4, 2, 1, C.band],
  [1, 5, 12, 1, C.skin],
  [0, 5, 1, 3, C.dark],
  [13, 5, 1, 3, C.dark],
  [1, 6, 1, 2, C.skin],
  [5, 6, 4, 2, C.skin],
  [12, 6, 1, 2, C.skin],
  [1, 8, 1, 1, C.skin],
  [2, 8, 3, 1, C.white],
  [5, 8, 4, 1, C.skin],
  [9, 8, 3, 1, C.white],
  [12, 8, 1, 1, C.skin],
  [2, 9, 10, 1, C.skin],
];

interface Eye {
  cx: number;
  whites: Array<[number, number, number, number]>;
  pupil: [number, number];
}

// Eye whites + pupil cell, per eye. Eye pivot y = 7 (blink squashes about it).
const EYES: Eye[] = [
  { cx: 3.5, whites: [[2, 6, 3, 1], [2, 7, 1, 1], [4, 7, 1, 1]], pupil: [3, 7] },
  { cx: 10.5, whites: [[9, 6, 3, 1], [9, 7, 1, 1], [11, 7, 1, 1]], pupil: [10, 7] },
];

export interface MascotOpts {
  px?: number;
}

export class SteroidsMascot {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private px: number;
  private look = { x: 0, y: 0 };
  private reduce: boolean;
  private nextBlink: number;
  private blinkUntil = 0;
  private squishUntil = 0;
  private annoyedUntil = 0;
  private dizzyUntil = 0;
  private dizzyFrom = 0;
  private jumpUntil = 0;
  private jumpFrom = 0;
  private raf = 0;
  private dead = false;

  constructor(canvas: HTMLCanvasElement, opts: MascotOpts = {}) {
    this.cv = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.px = opts.px || 8;
    canvas.width = 14 * this.px;
    canvas.height = 14 * this.px;
    this.reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = this.now();
    this.nextBlink = now + 2000;
    if (!this.reduce) this.loop();
    else this.draw(now);
  }

  private now(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  poke() { this.squishUntil = this.now() + 140; }

  annoy() {
    const n = this.now();
    this.squishUntil = n + 140;
    this.annoyedUntil = n + 800;
  }

  dizzy() {
    const n = this.now();
    this.dizzyFrom = n;
    this.dizzyUntil = n + 600; // flex pulse, not a spin
  }

  celebrate() {
    const n = this.now();
    this.jumpFrom = n;
    this.jumpUntil = n + 500;
  }

  setLook(x: number, y: number) {
    this.look.x = Math.max(-1, Math.min(1, x));
    this.look.y = Math.max(-1, Math.min(1, y));
  }

  destroy() {
    this.dead = true;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  private loop() {
    const frame = () => {
      if (this.dead) return;
      this.draw(this.now());
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private draw(now: number) {
    const ctx = this.ctx;
    const px = this.px;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);

    // auto-blink every 4.6s, 120ms shut
    if (!this.reduce && now >= this.nextBlink) {
      this.blinkUntil = now + 120;
      this.nextBlink = now + 4600;
    }
    const blinking = now < this.blinkUntil;

    // breathe 3s: scaleY 1 -> 1.03
    let br = 1;
    if (!this.reduce) br = 1 + 0.03 * (0.5 - 0.5 * Math.cos((now / 3000) * Math.PI * 2));

    let sx = 1;
    let sy = br;
    if (now < this.squishUntil) {
      sx = 1.15;
      sy = 0.85;
    }

    // jump curve: up -30% @35%, overshoot, settle
    let dy = 0;
    if (now < this.jumpUntil) {
      const jp = (now - this.jumpFrom) / 500;
      if (jp < 0.35) dy = -4.2 * (jp / 0.35);
      else if (jp < 0.7) dy = -4.2 + 4.2 * ((jp - 0.35) / 0.35);
      else {
        const k = (jp - 0.7) / 0.3;
        dy = 1.1 * Math.sin(k * Math.PI) * -1 + 0;
      }
    }

    ctx.save();
    ctx.translate(this.cv.width / 2, this.cv.height); // pivot: bottom-center
    if (now < this.dizzyUntil && !this.reduce) {
      // ponytail: flex pulse (a rep), not a 720 spin — scale only.
      const dp = (now - this.dizzyFrom) / 600;
      const flex = 1 + 0.12 * Math.sin(dp * Math.PI);
      ctx.scale(flex, 2 - flex);
    } else {
      ctx.scale(sx, sy);
    }
    ctx.translate(-this.cv.width / 2 + 0, -this.cv.height + ((dy * px) / 4));

    for (const r of BODY) {
      ctx.fillStyle = r[4];
      ctx.fillRect(r[0] * px, r[1] * px, r[2] * px, r[3] * px);
    }

    const annoyed = now < this.annoyedUntil;
    for (const eye of EYES) {
      if (annoyed) {
        ctx.fillStyle = C.pupil; // line eyes
        ctx.fillRect((eye.cx - 1.5) * px, 6.8 * px, 3 * px, 0.35 * px);
        continue;
      }
      const eyeSY = blinking ? 0.08 : 1;
      ctx.save();
      ctx.translate(eye.cx * px, 7 * px);
      ctx.scale(1, eyeSY);
      ctx.translate(-eye.cx * px, -7 * px);
      ctx.fillStyle = C.white;
      for (const w of eye.whites) {
        ctx.fillRect(w[0] * px, w[1] * px, w[2] * px, w[3] * px);
      }
      if (!blinking && !(now < this.dizzyUntil)) {
        ctx.fillStyle = C.pupil;
        const ox = this.look.x * 0.8;
        const oy = this.look.y * 0.8;
        ctx.fillRect((eye.pupil[0] + ox) * px, (eye.pupil[1] + oy) * px, px, px);
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
