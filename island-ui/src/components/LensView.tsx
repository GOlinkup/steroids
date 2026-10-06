import { useCallback, useEffect, useRef, useState } from "react";
import Mascot from "./Mascot";
import { HandIcon } from "./icons";
import { estimateHand, loadHandDetector } from "./hand";

export interface Shot {
  name: string;
  src: string;
  label: string;
  time: string;
}

type HandStatus = "off" | "loading" | "ready" | "no-camera" | "no-model";

// Lens view — one full live picture (what the AI is doing now).
// Tap steps shots, LIVE jumps back. Hand mode: index = cursor,
// pinch-hold = tap, palm-hold = back to live. Any camera (PC/phone).
// Served shots pop newest-first from the bridge (/shots); empty keeps
// the mascot in the lens box so the agent eye has a home before shots land.
// ponytail: no demo bundle — stale statics masqueraded as live.
export const DEMO_SHOTS: Shot[] = [];

export function LensView({ shots, initialZoom }: { shots: Shot[]; initialZoom?: string | null }) {
  const [idx, setIdx] = useState(() => {
    const i = shots.findIndex((s) => s.name === initialZoom);
    return i >= 0 ? i : 0;
  });
  const [live, setLive] = useState(true);
  const [handOn, setHandOn] = useState(false);
  const [handStatus, setHandStatus] = useState<HandStatus>("off");
  const [cursor, setCursor] = useState<{ x: number; y: number; pinch: boolean } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef(0);
  const runRef = useRef(0);

  const step = useCallback(() => {
    const n = Math.max(1, shots.length);
    if (live) {
      setLive(false);
      setIdx(1 % n);
    } else {
      setIdx((i) => (i + 1) % n);
    }
  }, [live, shots.length]);

  const goLive = useCallback(() => {
    setLive(true);
    setIdx(0);
  }, []);

  const disableHand = useCallback(() => {
    runRef.current++;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const v = videoRef.current;
    if (v?.srcObject) {
      (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
    setHandOn(false);
    setHandStatus("off");
    setCursor(null);
  }, []);

  useEffect(() => () => disableHand(), [disableHand]);

  const enableHand = useCallback(async () => {
    const run = ++runRef.current;
    setHandOn(true);
    setHandStatus("loading");
    setCursor(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 } },
        audio: false,
      });
    } catch {
      if (runRef.current === run) {
        setHandStatus("no-camera");
        setHandOn(false);
      }
      return;
    }
    if (runRef.current !== run) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const v = videoRef.current;
    if (!v) {
      stream.getTracks().forEach((t) => t.stop());
      setHandOn(false);
      setHandStatus("off");
      return;
    }
    v.srcObject = stream;
    try {
      await v.play();
    } catch {
      /* autoplay block — frames still flow */
    }
    let detector;
    try {
      detector = await loadHandDetector();
    } catch {
      if (runRef.current === run) setHandStatus("no-model");
      stream.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setHandOn(false);
      return;
    }
    if (runRef.current !== run) return;
    setHandStatus("ready");
    let last = 0;
    let pinchSince = 0;
    let palmSince = 0;
    let pinched = false;
    let palmed = false;
    const loop = async (t: number) => {
      if (runRef.current !== run) return;
      if (t - last > 90 && v.videoWidth) {
        last = t;
        const f = await estimateHand(detector, v);
        if (runRef.current !== run) return;
        if (f.present) {
          setCursor({ x: f.x, y: f.y, pinch: f.pinch });
          if (f.pinch && !pinched) {
            if (!pinchSince) pinchSince = t;
            if (t - pinchSince > 450) {
              pinched = true;
              step();
            }
          } else if (!f.pinch) {
            pinched = false;
            pinchSince = 0;
          }
          if (f.palm && !palmed) {
            if (!palmSince) palmSince = t;
            if (t - palmSince > 900) {
              palmed = true;
              goLive();
            }
          } else if (!f.palm) {
            palmed = false;
            palmSince = 0;
          }
        } else {
          setCursor(null);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [step, goLive]);

  // Live = the whole space is the newest picture (what the AI is doing now).
  // Tap the picture to freeze + step through; tap LIVE to jump back.
  const current = live ? shots[0] : shots[Math.min(idx, shots.length - 1)];
  const pos = live ? 0 : Math.min(idx, shots.length - 1);
  const handHint =
    handStatus === "loading"
      ? "starting camera…"
      : handStatus === "no-camera"
        ? "no camera — check permission"
        : handStatus === "no-model"
          ? "hand model needs net once"
          : cursor
            ? "pinch = tap · palm = live"
            : "show your hand";
  if (!current) {
    return (
      <div className="lens-live lens-idle" title="agent eye idle — shots land here">
        <div className="lens-mascot">
          <Mascot px={14} />
        </div>
        <div className="lens-cap">
          <b>agent eye idle</b>
          <span>shots land here</span>
        </div>
      </div>
    );
  }
  return (
    <div className="lens-live" onClick={step} title={live ? "tap to browse shots" : "tap for next · LIVE jumps back"}>
      <img src={current.src} alt={current.label} />
      {cursor && (
        <span
          className={cursor.pinch ? "hand-cursor pinch" : "hand-cursor"}
          style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
          aria-hidden
        />
      )}
      <div className="lens-live-top">
        {live ? (
          <span className="live-pill"><i className="live-dot" />LIVE</span>
        ) : (
          <button
            className="live-pill"
            onClick={(e) => {
              e.stopPropagation();
              goLive();
            }}
          >
            <i className="live-dot" />LIVE
          </button>
        )}
        <button
          className={handOn ? "live-pill on" : "live-pill"}
          aria-pressed={handOn}
          title={handOn ? "turn hand control off" : "control lens with your hand"}
          onClick={(e) => {
            e.stopPropagation();
            if (handOn) disableHand();
            else void enableHand();
          }}
        >
          <HandIcon size={12} />Hand
        </button>
        <span className="lens-count">{shots.length > 1 ? `${pos + 1}/${shots.length}` : current.time}</span>
      </div>
      <div className="lens-cap">
        <b>{current.label}</b>
        <span>{handOn ? handHint : current.time}</span>
      </div>
      <video
        ref={videoRef}
        className={handOn ? "hand-cam on" : "hand-cam"}
        muted
        playsInline
        aria-hidden
      />
    </div>
  );
}
