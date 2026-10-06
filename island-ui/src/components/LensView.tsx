import { useCallback, useEffect, useState } from "react";
import Mascot from "./Mascot";

export interface Shot {
  name: string;
  src: string;
  label: string;
  time: string;
}

// Lens view — one full live picture (what the AI is doing now).
// Tap steps shots, LIVE jumps back. Hand drives the real PC cursor via
// the bridge (island/handd.py): index = move, quick pinch = click,
// hold = drag, fist 1s = exit. No in-lens dot — the computer pointer
// IS the cursor.
// Served shots pop newest-first from the bridge (/shots); empty keeps
// the mascot in the lens box until shots land.
// ponytail: no demo bundle — stale statics masqueraded as live.
export const DEMO_SHOTS: Shot[] = [];

export function LensView({ shots, initialZoom }: { shots: Shot[]; initialZoom?: string | null }) {
  const [idx, setIdx] = useState(() => {
    const i = shots.findIndex((s) => s.name === initialZoom);
    return i >= 0 ? i : 0;
  });
  const [live, setLive] = useState(true);
  const [gazeOn, setGazeOn] = useState(false);
  const [gazeMsg, setGazeMsg] = useState("off");

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

// Lense (island/gazed.py) via the bridge — eyes steer, blink clicks.
// Module scope: the effect below only wires the poll loop (external system);
// state lands async after fetch, never synchronously in the effect.
async function pollGaze(
  setOn: (v: boolean) => void,
  setMsg: (m: string) => void,
) {
  try {
    const r = await fetch(`${window.location.origin}/gaze`);
    const j = await r.json();
    setOn(!!j.running);
    if (j.running) setMsg("eyes steer · blink clicks");
  } catch {
    /* bridge off — lense unavailable */
  }
}

  useEffect(() => {
    pollGaze(setGazeOn, setGazeMsg);
    const t = setInterval(() => pollGaze(setGazeOn, setGazeMsg), 3000);
    return () => clearInterval(t);
  }, []);

  const toggleGaze = useCallback(async () => {
    setGazeMsg("starting…");
    try {
      const r = await fetch(`${window.location.origin}/gaze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: gazeOn ? "stop" : "start" }),
      });
      const j = await r.json();
      setGazeOn(!!(j.running ?? j.ok));
      setGazeMsg(j.running ? "eyes steer · blink clicks" : (j.error ?? "off"));
    } catch {
      setGazeMsg("bridge off");
    }
  }, [gazeOn]);

  // Live = the whole space is the newest picture (what the AI is doing now).
  // Tap the picture to freeze + step through; tap LIVE to jump back.
  const current = live ? shots[0] : shots[Math.min(idx, shots.length - 1)];
  const pos = live ? 0 : Math.min(idx, shots.length - 1);
  const [feedTick, setFeedTick] = useState(0);
  useEffect(() => {
    if (!gazeOn) return;
    const t = setInterval(() => setFeedTick((n) => n + 1), 150);
    return () => clearInterval(t);
  }, [gazeOn]);
  const feedSrc = `${window.location.origin}/gaze-frame?t=${feedTick}`;
  if (!current) {
    return (
      <div className="lens-live lens-idle">
        {gazeOn ? (
          <img className="lens-feed" src={feedSrc} alt="your camera" />
        ) : (
          <div className="lens-mascot">
            <Mascot px={14} />
          </div>
        )}
        <div className="lens-live-top">
          <span className="live-pill"><i className="live-dot" />LIVE</span>
          <button
            className={gazeOn ? "live-pill on" : "live-pill"}
            aria-pressed={gazeOn}
            title={gazeOn ? "stop the lense" : "eyes steer, double-blink or pinch clicks"}
            onClick={(e) => {
              e.stopPropagation();
              void toggleGaze();
            }}
          >
            👁Lense
          </button>
          <span className="lens-count">{gazeOn ? gazeMsg : "live"}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="lens-live" onClick={step} title={live ? "tap to browse shots" : "tap for next · LIVE jumps back"}>
      <img src={current.src} alt={current.label} />
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
          className={gazeOn ? "live-pill on" : "live-pill"}
          aria-pressed={gazeOn}
          title={gazeOn ? "stop the lense" : "eyes steer, double-blink or pinch clicks"}
          onClick={(e) => {
            e.stopPropagation();
            void toggleGaze();
          }}
        >
          👁Lense
        </button>
        <span className="lens-count">{shots.length > 1 ? `${pos + 1}/${shots.length}` : current.time}</span>
      </div>
      <div className="lens-cap">
        <b>{current.label}</b>
        <span>{gazeOn ? gazeMsg : current.time}</span>
      </div>
      {gazeOn && (
        <img className="lens-pip" src={feedSrc} alt="" aria-hidden />
      )}
    </div>
  );
}
