import { useEffect, useRef } from "react";
import Mascot, { type MascotHandle } from "./Mascot";
import "./huddle.css";

export interface HuddleProps {
  lite: boolean;
}

// ponytail: empty-state hero — stays until the first message sends
// (parent shows it when messages.length===0). No timers, no tap-to-kill.
export default function Huddle({ lite }: HuddleProps) {
  const mascotRef = useRef<MascotHandle>(null);
  // ambient life: wave + jump every 9s so all mascot motion plays here
  // (breathe + blink run on their own loops). Tap still pokes/annoys/dizzies.
  useEffect(() => {
    if (lite) return;
    const t = window.setInterval(() => mascotRef.current?.poke(), 9000);
    return () => window.clearInterval(t);
  }, [lite]);
  return (
    <div
      className={lite ? "huddle-stage huddle-static" : "huddle-stage"}
      role="dialog"
      aria-label="Crew ready"
    >
      <div className="huddle-nicki">
        {/* wave mood: rounded hands up, always (neutral hides them). */}
        <Mascot ref={mascotRef} mood="wave" />
        <div className="huddle-bubble" aria-live="polite">
          <span className="huddle-bubble-text">Crew ready — what&apos;s first?</span>
        </div>
      </div>
    </div>
  );
}
