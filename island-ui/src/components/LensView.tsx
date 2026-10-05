import { useState } from "react";
import { ActivityOrb } from "../orb";
import { IDLE_ACTIVITY } from "../orb_state";

export interface Shot {
  name: string;
  src: string;
  label: string;
  time: string;
}

// Lens view — live window into agent visual work (mirrors `steroids lens`).
// Served shots pop newest-first; demo bundle ships with the build.
export const DEMO_SHOTS: Shot[] = [
  { name: "preview-index.png", src: "shots/preview-index.png", label: "preview index", time: "now" },
  { name: "chart-accuracy.png", src: "shots/chart-accuracy.png", label: "chart accuracy", time: "2m" },
  { name: "chart-speed.png", src: "shots/chart-speed.png", label: "chart speed", time: "9m" },
  { name: "logo.png", src: "shots/logo.png", label: "mascot", time: "1h" },
];

export function LensView({ shots, initialZoom }: { shots: Shot[]; initialZoom?: string | null }) {
  const [zoom, setZoom] = useState<Shot | null>(
    () => shots.find((s) => s.name === initialZoom) ?? null,
  );
  return (
    <>
      <div className="lens-grid">
        {shots.map((s, i) => (
          <figure
            key={s.name}
            className="shot-card"
            style={{ animationDelay: `${i * 0.05}s` }}
            onClick={() => setZoom(s)}
          >
            <img src={s.src} alt={s.label} loading="lazy" />
            <figcaption>
              <b>{s.label}</b>
              <span>{s.time}</span>
            </figcaption>
          </figure>
        ))}
        {!shots.length && (
          <>
            <ActivityOrb activity={IDLE_ACTIVITY} label="lens idle" />
            <div className="empty">No shots yet — point `steroids lens --watch` at a dir.</div>
          </>
        )}
      </div>
      {zoom && (
        <div className="zoom-overlay" onClick={() => setZoom(null)}>
          <img src={zoom.src} alt={zoom.label} />
          <div className="zoom-cap"><b>{zoom.label}</b><span>{zoom.time} · click to close</span></div>
        </div>
      )}
    </>
  );
}
