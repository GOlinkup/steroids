import { useCallback, useEffect, useRef, useState } from "react";

// "3m" / "2h" / "5d" — same recents language as the header meta.
function ago(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const BRIDGE =
  new URLSearchParams(window.location.search).get("bridge") ||
  window.location.origin;

// Shelf-persisted loop tasks: every command the team runs lands here as
// a bento card (verdict dot + steps), team-tile style. Survives reloads.
const LOOPS_KEY = "island.loops.v1";

export type LoopStep = { name: string; status: string; attempts?: number; seconds?: number };
export interface LoopTask {
  id: string;
  prompt: string;
  verdict: string;
  detail: string;
  steps: LoopStep[];
  elapsed: number;
  at: number;
}

function loadTasks(): LoopTask[] {
  try {
    const raw = localStorage.getItem(LOOPS_KEY);
    const arr: unknown = JSON.parse(raw ?? "[]");
    if (Array.isArray(arr)) return (arr as LoopTask[]).slice(0, 10);
  } catch {
    // corrupted store reads empty, never throws
  }
  return [];
}

const DOT: Record<string, string> = {
  done: "#34d399",
  recovered: "#38bdf8",
  needs_user: "#facc15",
  "blocked-needs-skill": "#fb923c",
  failed: "#f87171",
};

// Runner tile: one command in, a task card out. The loop runs minutes
// server-side — POST starts a job, we poll it, cancel stops between steps.
export function LoopTile({ onDone }: { onDone: (t: LoopTask) => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState("");
  const [liveSteps, setLiveSteps] = useState<Array<{ name: string; status: string }>>([]);
  const [crew, setCrew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<string | null>(null);

  const stop = async () => {
    const id = cancelRef.current;
    cancelRef.current = null;
    if (id) {
      await fetch(`${BRIDGE}/loop?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    }
    setBusy(false);
    setActivity("");
    setLiveSteps([]);
  };

  const run = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setError(null);
    setActivity("routing…");
    try {
      const r = await fetch(`${BRIDGE}/loop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, crew: crew || undefined }),
      });
      const data = await r.json();
      if (!data.id) throw new Error(data.error || "loop failed to start");
      cancelRef.current = data.id as string;
      setLiveSteps([]);
      for (;;) {
        await new Promise((w) => setTimeout(w, 2000));
        if (!cancelRef.current) return; // stopped by the user
        let s: {
          activity?: unknown; done?: unknown; error?: unknown;
          loop?: unknown; ok?: unknown; elapsed?: unknown; steps?: unknown;
        } | null = null;
        try {
          s = await (await fetch(`${BRIDGE}/loop?id=${encodeURIComponent(data.id)}`)).json();
        } catch {
          s = null;
        }
        // Server restarted, job swept, or network died mid-run: exit
        // honestly with the reason, never spin forever.
        if (!s || (!s.done && s.error)) {
          cancelRef.current = null;
          setBusy(false);
          setActivity("");
          setLiveSteps([]);
          throw new Error(s && s.error ? String(s.error) : "loop lost (server restarted?)");
        }
        if (s.activity) setActivity(String(s.activity));
        if (Array.isArray(s.steps)) {
          setLiveSteps((s.steps as Array<{ name?: unknown; status?: unknown }>).map((st) => ({
            name: String(st.name ?? "?"), status: String(st.status ?? "?"),
          })));
        }
        if (!s.done) continue;
        cancelRef.current = null;
        setBusy(false);
        setActivity("");
        setLiveSteps([]);
        if (!s.loop) throw new Error(s.error ? String(s.error) : "loop lost");
        const job = s.loop as { verdict?: unknown; detail?: unknown; steps?: unknown; elapsed?: unknown };
        const t: LoopTask = {
          id: `${Date.now()}`,
          prompt: p,
          verdict: String(job.verdict ?? (s.ok ? "done" : "failed")),
          detail: String(job.detail ?? ""),
          steps: (Array.isArray(job.steps) ? job.steps : []).map((st) => {
            const r = st as { name?: unknown; status?: unknown; attempts?: unknown; seconds?: unknown };
            const step: LoopStep = { name: String(r.name ?? "?"), status: String(r.status ?? "?") };
            if (typeof r.attempts === "number") step.attempts = r.attempts;
            if (typeof r.seconds === "number") step.seconds = r.seconds;
            return step;
          }),
          elapsed: Number(job.elapsed ?? s.elapsed ?? 0),
          at: Date.now(),
        };
        onDone(t);
        setPrompt("");
        return;
      }
    } catch (e) {
      cancelRef.current = null;
      setBusy(false);
      setActivity("");
      setLiveSteps([]);
      setError(e instanceof Error ? e.message : "loop failed");
    }
  };

  return (
    <div>
      <div className="card-title">Run the team</div>
      <div className="card-detail">One command — skills, plan, run, verify.</div>
      <div className="btn-row">
        <input
          className="team-edit"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          placeholder="e.g. write a git commit message"
          aria-label="Team task prompt"
          disabled={busy}
        />
        {busy ? (
          <button onClick={() => void stop()}>Stop</button>
        ) : (
          <button className="primary" onClick={() => void run()}>
            Run
          </button>
        )}
        <label className="card-detail" title="Each step runs its own session, tiles track them live">
          <input
            type="checkbox"
            checked={crew}
            onChange={(e) => setCrew(e.target.checked)}
            aria-label="Run as a crew"
          />{" "}
          as a crew
        </label>
      </div>
      {busy && <div className="card-detail">Working… {activity}</div>}
      {busy && liveSteps.length > 0 && (
        <div className="card-detail">
          {liveSteps.slice(-6).map((s) => (
            <div key={s.name}>
              {s.status === "done" || s.status === "recovered" ? "✓" : s.status === "failed" ? "✗" : "·"} {s.name}
            </div>
          ))}
        </div>
      )}
      {error && <div className="card-detail error">{error}</div>}
    </div>
  );
}

// Home bento language: 41s / 2m52s / 6m21s, never raw 381.1s.
function fmtElapsed(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${Math.round(s % 60)}s`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

// Bento grid of task cards, newest first. Home work-card language:
// verdict dot + team chip + ago, step checklist, stat row, clamped detail.
export function LoopTasks({ tasks }: { tasks: LoopTask[] }) {
  if (!tasks.length) {
    return (
      <div className="card-detail">
        No team tasks yet — run one above and its card lands here.
      </div>
    );
  }
  return (
    <div className="team-grid">
      {tasks.map((t) => {
        const done = t.steps.filter((s) => s.status === "done" || s.status === "recovered").length;
        const tries = t.steps.reduce((n, s) => n + (s.attempts ?? 1), 0);
        return (
          <div className="card" key={t.id}>
            <div className="card-title">
              <span style={{ color: DOT[t.verdict] ?? "#8b949e" }}>●</span>{" "}
              {t.verdict} <b className="kind-tag">team</b>
              <span style={{ marginLeft: "auto", fontWeight: 400, opacity: .55 }}>{ago(t.at)}</span>
            </div>
            <div className="card-detail"><b>{t.prompt}</b></div>
            <div className="card-detail">
              {t.steps.slice(-5).map((s) => (
                <div key={s.name}>
                  {s.status === "done" || s.status === "recovered" ? "✓" : s.status === "failed" ? "✗" : "·"} {s.name}
                  {(s.attempts ?? 1) > 1 ? ` ×${s.attempts}` : ""}
                </div>
              ))}
            </div>
            <div className="stat-row">
              <span><b>{done}/{t.steps.length}</b> steps</span>
              <span><b>{fmtElapsed(t.elapsed)}</b></span>
              {tries > t.steps.length && <span><b>{tries}</b> tries</span>}
            </div>
            <div className="card-detail">{t.detail.length > 140 ? t.detail.slice(0, 140) + "…" : t.detail}</div>
          </div>
        );
      })}
    </div>
  );
}

// Floor board: the hive ledger (crew rows + hand-written todos) in the
// same bento language as LoopTasks. Polls GET /hive while mounted.
export interface HiveTask {
  id: string; title: string; spec: string; assignee: string;
  status: string; result: string; at: number; updated: number;
}

const HIVE_DOT: Record<string, string> = {
  ...DOT, todo: "#8b949e", running: "#fb923c",
};

export function HiveBoard() {
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  const pull = useCallback(() => {
    fetch(`${BRIDGE}/hive`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.tasks)) setTasks(j.tasks);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    pull();
    const t = setInterval(pull, 5000);
    return () => clearInterval(t);
  }, [pull]);
  return (
    <div>
      <div className="card-title">Floor board</div>
      <div className="card-detail">Crew ledger — tell the team in chat, rows land here.</div>
      {!tasks.length ? (
        <div className="card-detail">
          Nothing on the floor yet — add a todo above or run the team.
        </div>
      ) : (
        <div className="team-grid">
          {[...tasks].reverse().slice(0, 8).map((t) => (
            <div className="card" key={t.id}>
              <div className="card-title">
                <span style={{ color: HIVE_DOT[t.status] ?? "#8b949e" }}>●</span>{" "}
                {t.status} <b className="kind-tag">{t.assignee}</b>
                <span style={{ marginLeft: "auto", fontWeight: 400, opacity: .55 }}>{ago(t.updated || t.at)}</span>
              </div>
              <div className="card-detail"><b>{t.title}</b></div>
              {(t.spec || t.result) && (
                <div className="card-detail">
                  {((t.result || t.spec) ?? "").length > 140
                    ? `${(t.result || t.spec).slice(0, 140)}…`
                    : (t.result || t.spec)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Live loops: every running team loop server-side (chat-started ones
// included — the fix for "can't see when they're running"). Renders
// nothing when idle. Polls GET /loops, Stop per row (DELETE /loop?id=).
export interface LiveLoop {
  id: string; activity: string; elapsed: number;
  steps: Array<{ name?: unknown; status?: unknown }>;
  interrupted?: boolean;
  resumable?: { prompt: string; provider: string; crew?: boolean } | null;
}

export function LiveLoops() {
  const [loops, setLoops] = useState<LiveLoop[]>([]);
  const pull = useCallback(() => {
    fetch(`${BRIDGE}/loops`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.loops)) {
          setLoops(j.loops.map((l: LiveLoop) => ({
            id: String(l.id), activity: String(l.activity ?? ""),
            elapsed: Number(l.elapsed ?? 0),
            steps: Array.isArray(l.steps) ? l.steps : [],
            interrupted: !!l.interrupted,
            resumable: l.resumable && typeof l.resumable.prompt === "string" && l.resumable.prompt
              ? { prompt: l.resumable.prompt, provider: l.resumable.provider || "opencode", crew: l.resumable.crew }
              : null,
          })));
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    pull();
    const t = setInterval(pull, 3000);
    return () => clearInterval(t);
  }, [pull]);
  if (!loops.length) return null;
  const stop = (id: string) => {
    setLoops((cur) => cur.filter((l) => l.id !== id));
    fetch(`${BRIDGE}/loop?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      .catch(() => {})
      .finally(() => setTimeout(pull, 800));
  };
  // interrupted loop: one tap reposts the same goal (never auto-reruns).
  const resume = (l: LiveLoop) => {
    if (!l.resumable) return;
    setLoops((cur) => cur.filter((x) => x.id !== l.id));
    fetch(`${BRIDGE}/loop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: l.resumable.prompt,
        provider: l.resumable.provider,
        crew: l.resumable.crew || undefined,
      }),
    })
      .catch(() => {})
      .finally(() => setTimeout(pull, 1500));
  };
  return (
    <div>
      <div className="card-title">Live loops</div>
      <div className="card-detail">Running right now — chat, shelf, anywhere. Stop one here, resume the interrupted.</div>
      {loops.map((l) => (
        <div className="menu-row" key={l.id}>
          <i className="live-dot" />
          <span>{l.activity || "working…"} · {fmtElapsed(l.elapsed)}</span>
          {l.interrupted && l.resumable
            ? <button className="menu-act primary" onClick={() => resume(l)}>Resume</button>
            : <button className="menu-act" onClick={() => stop(l.id)}>Stop</button>}
        </div>
      ))}
    </div>
  );
}

// Automations: dots recurring prompts (Manus-style create/pause/run-cards).
// Rows fire when the dots runner is up (bot/serve); the island owns
// create/edit/delete + run history, same grammar as /schedule chat.
export interface DotRun { status: string; result: string; at: string }
export interface DotSchedule {
  id: number; prompt_text: string; cron_expression: string; timezone: string;
  is_active: boolean; next_run_at: string; runs: DotRun[];
}

export function SchedulesSection() {
  const [scheds, setScheds] = useState<DotSchedule[] | null>(null);
  const [freq, setFreq] = useState("daily");
  const [time, setTime] = useState("09:00");
  const [day, setDay] = useState("mon");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pull = useCallback(() => {
    fetch(`${BRIDGE}/schedules`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.schedules)) setScheds(j.schedules);
        else setScheds(null);
        if (j.error && !Array.isArray(j.schedules)) setErr(String(j.error));
      })
      .catch(() => setScheds(null));
  }, []);
  useEffect(() => { pull(); }, [pull]);
  const op = (body: Record<string, unknown>) => {
    setBusy(true);
    setErr("");
    fetch(`${BRIDGE}/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((j) => {
        setBusy(false);
        if (!j.ok) setErr(String(j.error || "schedule failed"));
        else { setPrompt(""); pull(); }
      })
      .catch(() => { setBusy(false); setErr("bridge unreachable"); });
  };
  if (scheds === null) return null; // dots down — no dead section
  const when = (iso: string) => iso.replace("T", " ").slice(0, 16);
  return (
    <div>
      <div className="card-title">Automations</div>
      <div className="card-detail">Recurring prompts — pause, resume, run now. Rows fire when the dots runner is up.</div>
      <div className="menu-row">
        <select
          className="team-edit"
          aria-label="Frequency"
          value={freq}
          disabled={busy}
          onChange={(e) => setFreq(e.target.value)}
        >
          <option value="hourly">hourly</option>
          <option value="daily">daily</option>
          <option value="weekdays">weekdays</option>
          <option value="weekly">weekly</option>
        </select>
        {freq !== "hourly" && (
          <input
            className="team-edit"
            aria-label="Time HH:MM"
            value={time}
            disabled={busy}
            onChange={(e) => setTime(e.target.value)}
            placeholder="09:00"
          />
        )}
        {freq === "weekly" && (
          <select
            className="team-edit"
            aria-label="Day"
            value={day}
            disabled={busy}
            onChange={(e) => setDay(e.target.value)}
          >
            {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </div>
      <div className="menu-row">
        <input
          className="team-edit"
          aria-label="Recurring prompt"
          value={prompt}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Every morning: summarize the floor…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && prompt.trim()) op({ op: "create", freq, time, day, prompt: prompt.trim() });
          }}
        />
        <button
          className="menu-act primary"
          disabled={busy || !prompt.trim()}
          onClick={() => op({ op: "create", freq, time, day, prompt: prompt.trim() })}
        >
          Add
        </button>
      </div>
      {scheds.map((s) => (
        <div key={s.id}>
          <div className="menu-row">
            <i className={s.is_active ? "live-dot" : "chip-dot"} />
            <span>{s.prompt_text} · {s.cron_expression} · next {when(s.next_run_at)}</span>
            {s.is_active
              ? <button className="menu-act" disabled={busy} onClick={() => op({ op: "pause", id: s.id })}>Pause</button>
              : <button className="menu-act" disabled={busy} onClick={() => op({ op: "resume", id: s.id })}>Resume</button>}
            <button className="menu-act" disabled={busy} title="Enqueue one run now" onClick={() => op({ op: "run", id: s.id })}>Run</button>
            <button className="menu-act" disabled={busy} title="Delete schedule" onClick={() => op({ op: "delete", id: s.id })}>✕</button>
          </div>
          {s.runs.length > 0 && (
            <div className="card-detail">
              {s.runs.map((r, i) => (
                <div key={i}>{r.status} — {(r.result || "").slice(0, 100)}</div>
              ))}
            </div>
          )}
        </div>
      ))}
      {!scheds.length && (
        <div className="card-detail">No automations yet — add one above, same as /schedule in chat.</div>
      )}
      {err && <div className="card-detail error">{err}</div>}
    </div>
  );
}

export function useLoopTasks(): [LoopTask[], (t: LoopTask) => void] {
  // QA hook: ?demo=loops seeds two cards for screenshots (same ritual as
  // demo=approval). Clearly marked demo data, never mistaken for runs.
  const [tasks, setTasks] = useState<LoopTask[]>(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "loops") {
      const now = Date.now();
      return [
        { id: "demo-1", prompt: "write a git commit message", verdict: "done",
          detail: "3 steps executed and verified. (demo seed)", elapsed: 41.2,
          steps: [{ name: "route", status: "done" }, { name: "plan", status: "done" },
                  { name: "step-0-commit", status: "done", attempts: 1, seconds: 12.4 }], at: now },
        { id: "demo-2", prompt: "create a file hello.txt with hello", verdict: "needs_user",
          detail: "Step file-organizer failed (named file not produced: hello.txt). (demo seed)",
          elapsed: 88.0,
          steps: [{ name: "route", status: "done" }, { name: "plan", status: "done" },
                  { name: "step-0-file-organizer", status: "failed", attempts: 2, seconds: 61.3 }], at: now - 60000 },
      ];
    }
    return loadTasks();
  });
  const add = (t: LoopTask) => {
    setTasks((cur) => {
      const next = [t, ...cur].slice(0, 10);
      try {
        localStorage.setItem(LOOPS_KEY, JSON.stringify(next));
      } catch {
        // quota errors keep memory-only, never throw
      }
      return next;
    });
  };
  return [tasks, add];
}
