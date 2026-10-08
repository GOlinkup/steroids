import { useCallback, useState } from "react";
import Mascot from "./Mascot";
import { TeamGrid, type AgentMini } from "./TeamGrid";

export interface Shot {
  name: string;
  src: string;
  label: string;
  time: string;
}

// Structural match for ShelfItem (Cards) — no import, no cycle.
export interface StagedFile {
  file: File;
  url: string;
}

// Lens view — one full live picture (what the AI is doing now).
// Tap steps shots, LIVE jumps back. Hand drives the real PC cursor via
// the bridge (island/handd.py): index = move, quick pinch = click,
// hold = drag, fist 1s = exit. No in-lens dot — the computer pointer
// IS the cursor.
// Served shots pop newest-first from the bridge (/shots); empty keeps
// the mascot in the lens box until shots land.
// Staged shelf files ride below the picture — the visual inbox lives here.
// ponytail: no demo bundle — stale statics masqueraded as live.
export const DEMO_SHOTS: Shot[] = [];

export function LensView({
  shots,
  initialZoom,
  staged = [],
  onAttachStaged,
  agentSessions = [],
  onResumeAgent,
}: {
  shots: Shot[];
  initialZoom?: string | null;
  staged?: StagedFile[];
  onAttachStaged?: (file: File) => void;
  agentSessions?: AgentMini[];
  onResumeAgent?: (sid: string, first: string) => void;
}) {
  const [idx, setIdx] = useState(() => {
    const i = shots.findIndex((s) => s.name === initialZoom);
    return i >= 0 ? i : 0;
  });
  const [live, setLive] = useState(true);

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

  // Live = the whole space is the newest picture (what the AI is doing now).
  // Tap the picture to freeze + step through; tap LIVE to jump back.
  const current = live ? shots[0] : shots[Math.min(idx, shots.length - 1)];
  const pos = live ? 0 : Math.min(idx, shots.length - 1);
  return (
    <div className="lens-wrap">
      {!current ? (
        <div className="lens-live lens-idle">
          <div className="lens-mascot">
            <Mascot px={14} />
          </div>
          <div className="lens-cap">
            <span>No shots yet — they land when the bridge serves /shots (`python3 island/bridge.py --serve`)</span>
          </div>
          <div className="lens-live-top">
            <span className="live-pill"><i className="live-dot" />LIVE</span>
            <span className="lens-count">live</span>
          </div>
        </div>
      ) : (
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
            <span className="lens-count">{shots.length > 1 ? `${pos + 1}/${shots.length}` : current.time}</span>
          </div>
          <div className="lens-cap">
            <b>{current.label}</b>
            <span>{current.time}</span>
          </div>
        </div>
      )}
      {staged.length > 0 && (
        <div className="lens-staged">
          <div className="explore-label">Staged</div>
          {staged.map((s) => (
            <div key={s.url} className="shelf-row">
              {s.file.type.startsWith("image/") ? (
                <img src={s.url} alt="" className="shelf-thumb" />
              ) : (
                <i className="chip-dot" />
              )}
              <span className="shelf-name">{s.file.name}</span>
              {onAttachStaged && (
                <button className="menu-act" onClick={() => onAttachStaged(s.file)}>
                  Attach
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <TeamGrid sessions={agentSessions} onResume={onResumeAgent} />
    </div>
  );
}
