import type { CSSProperties } from "react";
import Mascot from "./Mascot";
import "./huddle.css";

export interface HuddleProps {
  chips: { bridge: boolean; agent: boolean; phone: boolean };
  lite: boolean;
  onChip?: (kind: "bridge" | "agent" | "phone") => void;
  onDone: () => void;
}

const CHIP_ORDER: Array<"bridge" | "agent" | "phone"> = ["bridge", "agent", "phone"];

// ponytail: empty-state hero — stays until the first message sends
// (parent shows it when messages.length===0). No timers, no tap-to-kill.
export default function Huddle({ chips, lite, onChip }: HuddleProps) {
  return (
    <div
      className={lite ? "huddle-stage huddle-static" : "huddle-stage"}
      role="dialog"
      aria-label="Crew ready"
    >
      <div className="huddle-nicki">
        <Mascot mood="neutral" />
        <div className="huddle-bubble" aria-live="polite">
          <span className="huddle-bubble-text">Crew ready — what&apos;s first?</span>
        </div>
      </div>
      <div className="pill-row huddle-chips">
        {CHIP_ORDER.map((kind, i) => (
          <button
            key={kind}
            type="button"
            className={chips[kind] ? "hpill live" : "hpill"}
            style={{ "--i": i, "--pill": chips[kind] ? "#22c55e" : "#888" } as CSSProperties}
            aria-label={`${kind} ${chips[kind] ? "connected" : "off"}`}
            onClick={(e) => {
              e.stopPropagation();
              onChip?.(kind);
            }}
          >
            <span className="dot" aria-hidden="true" />
            {kind} <em>{chips[kind] ? "connected" : "off"}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
