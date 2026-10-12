// RunsView — new-repo Routines shape, our dots schedules. One row per
// automation: name, on/off, last runs. Empty state honest (no mock rows).
import { useEffect, useState } from "react";
import type { IslandView } from "../store";

const API = window.location.origin;

interface Run { status?: string; result?: string; at?: string }
interface Sched { id: string; name?: string; title?: string; enabled?: boolean; active?: boolean; runs?: Run[] }

export function RunsView({ onTab }: { onTab?: (v: IslandView) => void }) {
  const [rows, setRows] = useState<Sched[] | null>(null);
  useEffect(() => {
    let dead = false;
    fetch(`${API}/schedules`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!dead) setRows(Array.isArray(j.schedules) ? j.schedules : []);
      })
      .catch(() => {
        if (!dead) setRows([]);
      });
    return () => {
      dead = true;
    };
  }, []);

  return (
    <div className="bots-view">
      <div className="bots-head">
        <span>RUNS {rows === null ? "" : rows.length}</span>
      </div>
      {rows === null && <div className="card-detail">Loading schedules…</div>}
      {rows !== null && rows.length === 0 && (
        <div className="card">
          <div className="card-title">No routines standing</div>
          <div className="card-detail">Ask a bot to do something on a schedule and it lands here.</div>
          <div className="btn-row">
            <button className="primary" onClick={() => onTab?.("chat")}>Open chat</button>
          </div>
        </div>
      )}
      {(rows ?? []).map((s) => {
        const on = s.enabled ?? s.active ?? true;
        const last = (s.runs ?? [])[0];
        return (
          <div key={s.id} className="bot-row">
            <b className="kind-tag" aria-label={on ? "enabled" : "paused"}>{on ? "on" : "paused"}</b>
            <span className="bot-meta">
              <span className="bot-top">
                <span className="bot-name">{s.name || s.title || s.id.slice(0, 8)}</span>
              </span>
              <span className="live-dim">
                {on ? "standing" : "paused"}
                {last ? ` · ${last.status ?? ""} ${String(last.result ?? "").slice(0, 80)}` : " · never run"}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
