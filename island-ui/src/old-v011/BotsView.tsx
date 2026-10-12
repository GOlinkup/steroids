// BotsView — new-repo roster page (OpenMausBot sidebar shape, our data).
// One row per live agent session: face, engine tag, last line, live step.
// Waiting approvals banner on top jumps to the approval card. Tap a row to
// resume that bot in chat. Self-contained: progress rides useSessionProgress,
// pending count polls /pending here (no App threading beyond sessions).
import { useEffect, useState } from "react";
import Mascot from "./Mascot";
import { StepsList, useSessionProgress, type AgentMini } from "./TeamGrid";
import type { IslandView } from "../store";

const API = window.location.origin;

export function BotsView({
  sessions = [],
  onResume,
  onTab,
}: {
  sessions?: AgentMini[];
  onResume?: (sid: string, first: string) => void;
  onTab?: (v: IslandView) => void;
}) {
  const { prog, refresh } = useSessionProgress(sessions);
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let dead = false;
    const poll = () => {
      fetch(`${API}/pending`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!dead) setWaiting(Array.isArray(j.pending) ? j.pending.length : 0);
        })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 8000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    sessions.forEach((s) => refresh(s.session));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.map((s) => s.session).join(",")]);

  return (
    <div className="bots-view">
      <div className="bots-head">
        <span>BOTS {sessions.length}</span>
      </div>
      {waiting > 0 && (
        <button className="bots-waiting" onClick={() => onTab?.("approval")}>
          {waiting} waiting on you — tap to decide
        </button>
      )}
      {sessions.length === 0 && (
        <div className="card">
          <div className="card-title">No bots running</div>
          <div className="card-detail">Give a mate a task from the team rail, or start a chat.</div>
          <div className="btn-row">
            <button className="primary" onClick={() => onTab?.("chat")}>Open chat</button>
          </div>
        </div>
      )}
      {sessions.map((s) => {
        const p = prog[s.session];
        const liveStep = p?.steps.find((st) => st.status === "active" || st.status === "pending");
        return (
          <div key={s.session} className="bot-row" role="button" tabIndex={0}
            title={`${s.agent} · tap to resume`}
            onClick={() => onResume?.(s.session, s.first)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onResume?.(s.session, s.first);
            }}
          >
            <span className="msg-face"><Mascot mood="neutral" /></span>
            <span className="bot-meta">
              <span className="bot-top">
                <b className="kind-tag">{s.agent}</b>
                <span className="bot-name">{s.first || s.session.slice(0, 8)}</span>
              </span>
              <span className="live-dim">
                {liveStep ? `· ${liveStep.label}` : ""}
                {p ? (p.activity || p.task || "") : "loading…"}
              </span>
              {p && p.steps.length > 0 && <StepsList steps={p.steps} n={3} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}
