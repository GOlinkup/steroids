import { useCallback, useEffect, useRef, useState } from "react";
import { Card, MenuRow, useDismiss } from "./pickers";
import { CheckIcon, DotsIcon, HandIcon, PencilIcon, PlayIcon, XIcon, ChevronDownIcon } from "./icons";
import type { ComponentType } from "react";

// "3m" / "2h" / "5d" — same recents language as the header meta.
// Hive timestamps are unix seconds, loop tasks are ms: normalize both.
function ago(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const s = Math.max(0, (Date.now() - ms) / 1000);
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
    <div className="team-wrap">
      <div className="team-head">
        <span className="team-title">RUN THE TEAM</span>
      </div>
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
          <button className="menu-act" onClick={() => void stop()}>Stop</button>
        ) : (
          <button className="menu-act primary" onClick={() => void run()}>
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

// One card, both boards: LoopTasks + HiveBoard share it (same dot +
// tag + ago + clamped body). Extra rows (steps, stats, buttons) ride
// children so neither board re-invents the shell.
export function BoardCard({ dot, status, tag, at, title, body, children }: {
  dot: string; status: string; tag: string; at: number; title: string;
  body?: string; children?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="card-title">
        <span style={{ color: dot }}>●</span>{" "}
        {status} <b className="kind-tag">{tag}</b>
        <span style={{ marginLeft: "auto", fontWeight: 400, opacity: .55 }}>{ago(at)}</span>
      </div>
      <div className="card-detail"><b>{title}</b></div>
      {!!body && (
        <div className="card-detail">{body.length > 100 ? `${body.slice(0, 100)}…` : body}</div>
      )}
      {children}
    </Card>
  );
}

// Bento grid of task cards, newest first. Home work-card language:
// verdict dot + team chip + ago, step checklist, stat row, clamped detail.
export function LoopTasks({ tasks }: { tasks: LoopTask[] }) {
  if (!tasks.length) {
    return (
      <div className="card-detail">
        No tasks yet — run one above.
      </div>
    );
  }
  return (
    <div className="team-grid">
      {tasks.map((t) => {
        const done = t.steps.filter((s) => s.status === "done" || s.status === "recovered").length;
        const tries = t.steps.reduce((n, s) => n + (s.attempts ?? 1), 0);
        return (
          <BoardCard key={t.id} dot={DOT[t.verdict] ?? "#8b949e"} status={t.verdict} tag="team" at={t.at} title={t.prompt} body={t.detail}>
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
          </BoardCard>
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

// Status icons, not dots: pencil = queued, play = moving, hand = stuck,
// check = landed, cross = failed. Shared by filter tiles + task tiles.
const STATUS_META: Record<string, { Icon: ComponentType<{ size?: number }>; color: string }> = {
  todo: { Icon: PencilIcon, color: "#8b949e" },
  running: { Icon: PlayIcon, color: "#fb923c" },
  blocked: { Icon: HandIcon, color: "#facc15" },
  done: { Icon: CheckIcon, color: "#34d399" },
  failed: { Icon: XIcon, color: "#f87171" },
};

// One live hive feed for both office surfaces (full board in Shelf +
// compact rail in chat): same poll, same tasks, same move. Hook, not copy.
export function useHive() {
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  const [board, setBoard] = useState("");
  const [roster, setRoster] = useState<Array<{ id: string; role: string; status: string }>>([]);
  const [feed, setFeed] = useState<Array<{ ts?: number; type?: string; title?: string; status?: string; frm?: string; to?: string }>>([]);
  const pull = useCallback(() => {
    fetch(`${BRIDGE}/hive`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.tasks)) setTasks(j.tasks);
        if (typeof j.board === "string") setBoard(j.board);
        if (Array.isArray(j.roster)) setRoster(j.roster.slice(0, 8));
        if (Array.isArray(j.log)) setFeed(j.log.slice(-5).reverse());
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    pull();
    const t = setInterval(pull, 5000);
    return () => clearInterval(t);
  }, [pull]);
  const add = (title: string) => {
    const v = title.trim().slice(0, 200);
    if (!v) return;
    fetch(`${BRIDGE}/hive/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: v }),
    })
      .catch(() => {})
      .finally(() => setTimeout(pull, 600));
  };
  const move = (id: string, patch: Record<string, string>) => {
    fetch(`${BRIDGE}/hive/task/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    })
      .catch(() => {})
      .finally(() => setTimeout(pull, 600));
  };
  return { tasks, board, roster, feed, pull, add, move };
}

// One task tile for every office surface (chat rail + shelf columns):
// the SAME team-cell tile the mates use — dot + title + assignee — with
// the ⋯ menu carrying the moves. Text sizing follows .team-mini,
// identical to the chat TEAM section.
export function TaskTile({ t, move, roster = [], onEdit, onDelete, onComment }: {
  t: HiveTask;
  move: (id: string, patch: Record<string, string>) => void;
  roster?: Array<{ id: string; role: string }>;
  onEdit?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
  onComment?: (id: string, text: string) => void;
}) {
  const s = (t.status || "todo").toLowerCase();
  const [open, setOpen] = useState(false);
  const [fly, setFly] = useState(false);
  const [editing, setEditing] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState("");
  const dismiss = useDismiss<HTMLDivElement>(open, () => { setOpen(false); setFly(false); setEditing(false); setCommenting(false); });
  const go = (status: string) => { move(t.id, { status }); setOpen(false); };
  const advance = () => go(s === "todo" ? "running" : s === "running" ? "done" : "todo");
  const meta = STATUS_META[s] ?? STATUS_META.todo;
  const StatusIcon = meta.Icon;
  return (
    <div className="team-cellwrap">
      <button
        className="team-cell"
        title={`${t.title} — ${t.status} · tap to advance`}
        onClick={advance}
      >
        <span style={{ color: meta.color, display: "inline-flex", flex: "none" }} aria-hidden>
          <StatusIcon size={17} />
        </span>
        <span className="team-meta">
          <span className="team-name">{t.title}</span>
          <span className="team-sub">{t.assignee}</span>
        </span>
      </button>
      <button
        className="team-dots"
        aria-label={`Options for ${t.title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(t.title);
          setOpen((o) => !o);
        }}
      >
        <DotsIcon size={15} />
      </button>
      {open && (
        <div ref={dismiss} className="sheet team-menu" role="menu" aria-label={`Options for ${t.title}`}>
          {editing ? (
            <div className="menu-row">
              <input
                className="team-edit"
                aria-label="Edit title"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim() && onEdit) { onEdit(t.id, draft.trim().slice(0, 200)); setEditing(false); setOpen(false); }
                  if (e.key === "Escape") { setEditing(false); setOpen(false); }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : commenting ? (
            <div className="menu-row">
              <input
                className="team-edit"
                aria-label="Add a comment"
                value={draft}
                autoFocus
                placeholder="Comment…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim() && onComment) { onComment(t.id, draft.trim().slice(0, 300)); setDraft(""); setCommenting(false); setOpen(false); }
                  if (e.key === "Escape") { setCommenting(false); setOpen(false); }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : (
            <>
            <>
              <MenuRow role="menuitem" onClick={() => go("running")}>
                ▶ Start
              </MenuRow>
              <MenuRow role="menuitem" onClick={() => go("blocked")}>
                ✋ Blocked
              </MenuRow>
            </>
          {s === "running" && (
            <>
              <MenuRow role="menuitem" onClick={() => go("done")}>
                ✓ Done
              </MenuRow>
              <MenuRow role="menuitem" onClick={() => go("blocked")}>
                ✋ Blocked
              </MenuRow>
              <MenuRow role="menuitem" onClick={() => go("todo")}>
                ◀ Back to todo
              </MenuRow>
            </>
          )}
          {s === "blocked" && (
            <>
              <MenuRow role="menuitem" onClick={() => go("running")}>
                ▶ Unblock
              </MenuRow>
              <MenuRow role="menuitem" onClick={() => go("done")}>
                ✓ Done
              </MenuRow>
            </>
          )}
          {(s === "done" || s === "failed") && (
            <MenuRow role="menuitem" onClick={() => go("todo")}>
              ↺ Reopen
            </MenuRow>
          )}
          {!!roster.length && (
            <div className={fly ? "fly-wrap open" : "fly-wrap"}>
              <MenuRow role="menuitem" aria-haspopup="menu" onClick={() => setFly((v) => !v)}>
                👤 {t.assignee}
                <span className="fly-arrow" aria-hidden>▸</span>
              </MenuRow>
              <div className="sheet flyout" role="menu" aria-label="Assignee">
                {roster.map((m) => (
                  <MenuRow
                    key={m.id}
                    role="menuitemradio"
                    active={t.assignee === m.id}
                    onClick={() => { move(t.id, { assignee: m.id }); setFly(false); setOpen(false); }}
                  >
                    {t.assignee === m.id ? "● " : "○ "}{m.id} · {m.role}
                  </MenuRow>
                ))}
              </div>
            </div>
          )}
          {onEdit && (
            <MenuRow role="menuitem" onClick={() => { setDraft(t.title); setEditing(true); }}>
              ✎ Edit
            </MenuRow>
          )}
          {onComment && (
            <MenuRow role="menuitem" onClick={() => { setDraft(""); setCommenting(true); }}>
              💬 Comment
            </MenuRow>
          )}
          {onDelete && (
            <MenuRow role="menuitem" danger onClick={() => { onDelete(t.id); setOpen(false); }}>
              ✕ Delete
            </MenuRow>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function HiveBoard({ loopTasks = [], onLoopDone = () => {} }: {
  loopTasks?: LoopTask[];
  onLoopDone?: (t: LoopTask) => void;
}) {
  const { tasks, roster, pull, move } = useHive();
  const cols: Array<{ key: string; label: string; items: HiveTask[] }> = [
    { key: "todo", label: "Todo", items: [] },
    { key: "doing", label: "Doing", items: [] },
    { key: "blocked", label: "Blocked", items: [] },
    { key: "done", label: "Done", items: [] },
    { key: "failed", label: "Failed", items: [] },
  ];
  for (const t of [...tasks].reverse().slice(0, 30)) {
    if (t.title.startsWith("crew step ")) continue; // machine rows — count below
    const s = (t.status || "todo").toLowerCase();
    if (s === "running") cols[1].items.push(t);
    else if (s === "todo") cols[0].items.push(t);
    else if (s === "blocked") cols[2].items.push(t);
    else if (s === "failed") cols[4].items.push(t);
    else cols[3].items.push(t);
  }
  for (const c of cols) c.items = c.items.slice(0, 6);
  const crewHidden = tasks.filter((t) => t.title.startsWith("crew step ")).length;
  // 4 groups, not 5: blocked + failed ride ONE "Stuck" tile.
  const groups = [
    { key: "todo", label: "Todo", meta: STATUS_META.todo, items: cols[0].items },
    { key: "doing", label: "Doing", meta: STATUS_META.running, items: cols[1].items },
    { key: "stuck", label: "Stuck", meta: STATUS_META.blocked, items: [...cols[2].items, ...cols[4].items] },
    { key: "done", label: "Done", meta: STATUS_META.done, items: cols[3].items },
  ];
  const [shutGroups, setShutGroups] = useState<Record<string, boolean>>({});
  const editTask = (id: string, title: string) => {
    fetch(`${BRIDGE}/hive/task/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    })
      .catch(() => {})
      .finally(() => setTimeout(pull, 600));
  };
  const deleteTask = (id: string) => {
    fetch(`${BRIDGE}/hive/task/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .catch(() => {})
      .finally(() => setTimeout(pull, 600));
  };
  const commentTask = (id: string, text: string) => {
    fetch(`${BRIDGE}/hive/task/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, text }),
    })
      .catch(() => {})
      .finally(() => setTimeout(pull, 600));
  };
  // section pill: Tasks / Automations / Team runs — one obvious switcher
  // (pill + dropdown) instead of stacked sections nobody can tell apart.
  const [section, setSection] = useState<"tasks" | "automations" | "runs">("tasks");
  const [shut, setShut] = useState(false);
  const [secOpen, setSecOpen] = useState(false);
  const secDismiss = useDismiss<HTMLDivElement>(secOpen, () => setSecOpen(false));
  const sectionLabel = section === "tasks" ? "Tasks" : section === "automations" ? "Automations" : "Team runs";
  // team-mini scope: shelf board text sizes match the chat TEAM section.
  return (
    <div className="team-wrap team-mini">
      <div className="team-head">
        <button
          className="team-title team-toggle"
          aria-expanded={!shut}
          title={shut ? "Show board" : "Hide board"}
          onClick={() => setShut((v) => !v)}
        >
          OFFICE BOARD
        </button>
        <div style={{ position: "relative", marginLeft: "auto", flex: "none" }}>
          <button
            className="effort-pill"
            aria-haspopup="menu"
            aria-expanded={secOpen}
            title="Switch section"
            onClick={() => setSecOpen((o) => !o)}
          >
            {sectionLabel} <ChevronDownIcon size={12} />
          </button>
          {secOpen && (
            <div ref={secDismiss} className="sheet team-menu" role="menu" aria-label="Board section">
              {(["tasks", "automations", "runs"] as const).map((k) => (
                <MenuRow
                  key={k}
                  role="menuitemradio"
                  active={section === k}
                  onClick={() => { setSection(k); setSecOpen(false); }}
                >
                  {k === "tasks" ? "Tasks" : k === "automations" ? "Automations" : "Team runs"}
                </MenuRow>
              ))}
            </div>
          )}
        </div>
      </div>
      {!shut && (
      <>
      {section === "tasks" && (
      <>
      <div className="team-grid filter-grid">
        {groups.map((g) => {
          const closed = !!shutGroups[g.key];
          const GIcon = g.meta.Icon;
          return (
            <div key={g.key} className="team-cellwrap">
              <button
                className="team-cell"
                aria-expanded={!closed}
                title={closed ? `Show ${g.label}` : `Hide ${g.label}`}
                onClick={() => setShutGroups((s) => ({ ...s, [g.key]: !s[g.key] }))}
              >
                <span style={{ color: g.meta.color, display: "inline-flex", flex: "none" }} aria-hidden>
                  <GIcon size={17} />
                </span>
                <span className="team-meta">
                  <span className="team-name">{g.label}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="board-cols">
        {groups.map((g) => (
          !shutGroups[g.key] && (
            <div key={g.key}>
              <div className="task-lines">
                {g.items.map((t) => (
                  <TaskTile key={t.id} t={t} move={move} roster={roster} onEdit={editTask} onDelete={deleteTask} onComment={commentTask} />
                ))}
              </div>
            </div>
          )
        ))}
      </div>
      {crewHidden > 0 && (
        <div className="card-detail">crew steps file under Live loops below.</div>
      )}
      </>
      )}
      {section === "automations" && (
        <SchedulesSection />
      )}
      {section === "runs" && (
        <>
          <LoopTile onDone={onLoopDone} />
          <LiveLoops />
          <LoopTasks tasks={loopTasks} />
        </>
      )}
      </>
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
    <div className="team-wrap">
      <div className="team-head">
        <span className="team-title">LIVE LOOPS</span>
      </div>
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
    <div className="team-wrap">
      <div className="team-head">
        <span className="team-title">AUTOMATIONS</span>
      </div>
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
        <div className="card-detail">None yet — add one above.</div>
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
