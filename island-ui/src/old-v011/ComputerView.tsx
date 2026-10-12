// ComputerView — new-repo computer panel shape, our sandbox truth.
// Per live bot: working-dir files touched + code lens. Black surfaces,
// same card language as Bots. Tap a row to resume that bot in chat.
import { useEffect } from "react";
import Mascot from "./Mascot";
import { LensBlock, useSessionProgress, type AgentMini } from "./TeamGrid";
import type { IslandView } from "../store";

export function ComputerView({
  sessions = [],
  onResume,
  onTab,
}: {
  sessions?: AgentMini[];
  onResume?: (sid: string, first: string) => void;
  onTab?: (v: IslandView) => void;
}) {
  const { prog, refresh } = useSessionProgress(sessions);
  useEffect(() => {
    sessions.forEach((s) => refresh(s.session));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.map((s) => s.session).join(",")]);

  return (
    <div className="bots-view">
      <div className="bots-head">
        <span>COMPUTERS {sessions.length}</span>
      </div>
      {sessions.length === 0 && (
        <div className="card">
          <div className="card-title">No computers awake</div>
          <div className="card-detail">Start a bot and its workspace shows up here.</div>
          <div className="btn-row">
            <button className="primary" onClick={() => onTab?.("chat")}>Open chat</button>
          </div>
        </div>
      )}
      {sessions.map((s) => {
        const p = prog[s.session];
        return (
          <div key={s.session} className="bot-row" role="button" tabIndex={0}
            title={`${s.agent} workspace · tap to resume`}
            onClick={() => onResume?.(s.session, s.first)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onResume?.(s.session, s.first);
            }}
          >
            <span className="msg-face"><Mascot mood="smart" /></span>
            <span className="bot-meta">
              <span className="bot-top">
                <b className="kind-tag">{s.agent}</b>
                <span className="bot-name">{s.first || s.session.slice(0, 8)}</span>
              </span>
              <LensBlock lens={p?.lens} />
              {p && p.files.length > 0 ? (
                <span className="live-dim">
                  {p.files.slice(0, 3).map((f) => `${f.name} +${f.added} −${f.removed}`).join(" · ")}
                </span>
              ) : (
                <span className="live-dim">{p ? "no files touched yet" : "loading…"}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
