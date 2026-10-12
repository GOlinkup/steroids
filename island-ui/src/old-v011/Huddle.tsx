import Mascot from "./Mascot";
import type { IslandView } from "../store";
import "./huddle.css";

export interface HuddleProps {
  lite: boolean;
  onAction?: (v: IslandView | "newchat") => void;
}

// Empty-state greeting — new-repo shape: compact face + line + quick
// chips. No big hero stage; the team rail below stays the star.
export default function Huddle({ lite, onAction }: HuddleProps) {
  void lite;
  const go = (v: IslandView | "newchat") => {
    if (v === "newchat") {
      document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
      return;
    }
    onAction?.(v);
  };
  return (
    <div className="huddle-new" role="dialog" aria-label="Get started">
      <span className="msg-face huddle-face"><Mascot mood="wave" /></span>
      <span className="huddle-line">What&apos;s first?</span>
      <span className="huddle-chips">
        <button className="huddle-chip" onClick={() => go("newchat")}>New chat</button>
        <button className="huddle-chip" onClick={() => go("bots")}>Bots</button>
        <button className="huddle-chip" onClick={() => go("computer")}>Computers</button>
        <button className="huddle-chip" onClick={() => go("runs")}>Runs</button>
      </span>
    </div>
  );
}
