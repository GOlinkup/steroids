import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from "react";
import neutralSvg from "../assets/buddy-neutral.svg?raw";
import joyfulSvg from "../assets/buddy-joyful-wide.svg?raw";
import surprisedSvg from "../assets/buddy-surprised-wide-left.svg?raw";
import happySvg from "../assets/buddy-happy.svg?raw";
import sleepySvg from "../assets/buddy-sleepy-squint.svg?raw";
import smartSvg from "../assets/buddy-smart.svg?raw";
import annoyedSvg from "../assets/buddy-annoyed.svg?raw";
import waveSvg from "../assets/buddy-wave.svg?raw";
import thinkingSvg from "../assets/buddy-thinking.svg?raw";
import dizzySvg from "../assets/buddy-dizzy.svg?raw";

export interface MascotHandle {
  poke: () => void;
  annoy: () => void;
  dizzy: () => void;
  celebrate: () => void;
  groove: (on: boolean, energy?: number) => void;
  hop: () => void;
  setLook: (x: number, y: number) => void;
}

export type MascotMood =
  | "neutral"
  | "joyful-wide"
  | "surprised-wide-left"
  | "happy"
  | "sleepy-squint"
  | "smart"
  | "annoyed"
  | "wave"
  | "thinking"
  | "dizzy";

interface Props {
  px?: number;
  onTap?: (taps: number) => void;
  /** Ambient face: wins whenever no interaction fx is running. */
  mood?: MascotMood;
}

type Expr = MascotMood;
type Fx = "squish" | "jump" | "wobble" | null;

const SVG: Record<Expr, string> = {
  neutral: neutralSvg,
  "joyful-wide": joyfulSvg,
  "surprised-wide-left": surprisedSvg,
  happy: happySvg,
  "sleepy-squint": sleepySvg,
  smart: smartSvg,
  annoyed: annoyedSvg,
  wave: waveSvg,
  thinking: thinkingSvg,
  dizzy: dizzySvg,
};

// ponytail: Island remounts Mascot on fsm transitions (key={fsmState}), which
// would wipe a mid-celebration face. Module-level lastExpr carries it across.
let lastExpr: Expr = "neutral";

// SVG buddy (Mochi-grade paint over lab geometry) — same tap/motion contract as before.
const Mascot = forwardRef<MascotHandle, Props>(function Mascot({ onTap, mood }, ref) {
  const [expr, setExprState] = useState<Expr>(lastExpr);
  const [fx, setFx] = useState<Fx>(null);
  const [blinking, setBlinking] = useState(false);
  const [burst, setBurst] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tapsRef = useRef<number[]>([]);
  const timersRef = useRef<number[]>([]);

  const setExpr = (e: Expr) => {
    lastExpr = e;
    setExprState(e);
  };

  // re-arm the revert if we mounted mid-face (remount cleared the old timer)
  useEffect(() => {
    if (lastExpr === "neutral") return;
    const t = window.setTimeout(() => setExpr("neutral"), lastExpr === "annoyed" ? 900 : 1300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mochi blink rhythm: random 2.2–5.4s, 22% double-blink.
  useEffect(() => {
    let alive = true;
    let t1 = 0;
    let t2 = 0;
    let t3 = 0;
    const loop = () => {
      if (!alive) return;
      t1 = window.setTimeout(() => {
        if (!alive) return;
        setBlinking(true);
        t2 = window.setTimeout(() => {
          if (!alive) return;
          setBlinking(false);
          if (Math.random() < 0.22) {
            t3 = window.setTimeout(() => {
              if (!alive) return;
              setBlinking(true);
              t2 = window.setTimeout(() => {
                if (!alive) return;
                setBlinking(false);
                loop();
              }, 120);
            }, 230);
          } else {
            loop();
          }
        }, 120);
      }, 2200 + Math.random() * 3200);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const later = (ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  // single tap: hands up (wave) + jump, then melt back. The resting
  // face belongs to the mood prop (or neutral) — never the parade.
  const doPoke = () => {
    setExpr("wave");
    setFx("jump");
    later(160, () => setFx(null));
    later(1100, () => setExpr("neutral"));
  };
  const doAnnoy = () => {
    setExpr("annoyed");
    later(900, () => setExpr("neutral"));
  };
  const doDizzy = () => {
    setExpr("dizzy");
    setFx("wobble");
    later(1300, () => {
      setFx(null);
      setExpr("neutral");
    });
  };
  const doCelebrate = () => {
    setExpr("wave");
    setFx("jump");
    setBurst(true);
    later(550, () => setFx(null));
    later(600, () => setExpr("happy"));
    later(1100, () => setBurst(false));
    later(1300, () => setExpr("neutral"));
  };

  useImperativeHandle(ref, () => ({
    poke: doPoke,
    annoy: doAnnoy,
    dizzy: doDizzy,
    celebrate: doCelebrate,
    // groove: beat-following bounce (hop edges kick, --e rides height).
    // Same contract as Daily's dancer; silent unless driven.
    groove: (on: boolean, energy = 0) => {
      const el = wrapRef.current;
      if (!el) return;
      el.style.setProperty("--e", Math.max(0, Math.min(1, energy)).toFixed(2));
      el.classList.toggle("grooving", on);
      if (!on) el.classList.remove("hop");
    },
    hop: () => {
      const el = wrapRef.current;
      if (!el) return;
      el.classList.remove("hop");
      void el.offsetWidth;
      el.classList.add("hop");
    },
    setLook: (x, y) => {
      const el = wrapRef.current;
      if (!el) return;
      el.style.setProperty("--lx", `${(Math.max(-1, Math.min(1, x)) * 6).toFixed(1)}px`);
      el.style.setProperty("--ly", `${(Math.max(-1, Math.min(1, y)) * 6).toFixed(1)}px`);
    },
  }));

  const handleClick = () => {
    const now = Date.now();
    tapsRef.current = tapsRef.current.filter((t) => now - t < 600);
    tapsRef.current.push(now);
    const n = tapsRef.current.length;
    if (n >= 3) {
      tapsRef.current = [];
      doDizzy();
      onTap?.(3);
    } else if (n === 2) {
      doAnnoy();
      onTap?.(2);
    } else {
      doPoke();
      onTap?.(1);
    }
  };

  return (
    <div
      ref={wrapRef}
      className={blinking ? "mascot mascot-svg blink" : "mascot mascot-svg"}
      role="img"
      aria-label="Nicki, the Steroids mascot"
      onClick={handleClick}
    >
      <div
        className={fx ? `m-fx m-${fx}` : "m-fx"}
        // ponytail: raw SVG strings keep zero runtime deps (no AGPL engine in bundle).
        // mood owns the resting face; a tap fx borrows it for the moment.
        dangerouslySetInnerHTML={{ __html: SVG[fx ? expr : (mood ?? expr)] }}
      />
      {burst && (
        <span className="m-stars" aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </span>
      )}
    </div>
  );
});

export default Mascot;
