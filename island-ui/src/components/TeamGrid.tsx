import { useCallback, useEffect, useRef, useState } from "react";
import Mascot, { type MascotHandle, type MascotMood } from "./Mascot";
import { DotsIcon } from "./icons";
import { useDismiss, MenuRow } from "./pickers";
import { BashIcon, CheckIcon, PencilIcon, ReadIcon, XIcon } from "./icons";

// Team grid — minimal ref-style tiles (dot + name). Selection drives the
// main left container (Daily work card); Lens renders the same detail
// below the grid (it has no left card). 4 default mates, add to 8,
// rename inline. Slots persist local; live state rides the bridge.
const TEAM_KEY = "island.team.v1";
const TEAM_COLORS = ["#38bdf8", "#f87171", "#fb923c", "#a855f7", "#34d399", "#f472b6", "#facc15", "#22d3ee"];

const API = window.location.origin;

export interface AgentMini { session: string; agent: string; first: string }
// Crew roles (Munder-Dufflin-style: every mate grabs a lane). Slot-owned,
// cycled from the tile menu — the mate keeps it across sessions.
export const ROLE_POOL = ["lead", "scout", "coder", "critic", "scribe", "runner", "sage", "relay"];
export interface Member { id: string; name: string; color: string; role: string; sid?: string }
// Slot → live session: a bound sid wins (assign/relay pin it); otherwise
// the legacy positional slot. Missing session reads idle, never a stranger.
export function slotSession(members: Member[], sessions: AgentMini[], idx: number): AgentMini | undefined {
  const sid = members[idx]?.sid;
  if (sid) return sessions.find((s) => s.session === sid);
  return sessions[idx];
}
export interface Step { label: string; status: string }
export interface ProgFile { name: string; added: number; removed: number }
export interface Lens { file: string; lines: string[]; diff?: string[] }
export interface Progress { task: string; state: string; activity: string; steps: Step[]; files: ProgFile[]; lens: Lens }

// ponytail: ONE face (OOP single source) — grid cells, pill minis, nicki:
// every mate face renders here. Change the look once, here. wrapClass picks
// the size context (team-face 32px / pill-face 20px); faces registry is
// optional (pill minis stay out of the glance loop).
export function MateFace({ color, mood, wrapClass = "team-face", faceKey, faces }: {
  color?: string; mood?: MascotMood; wrapClass?: string; faceKey?: string;
  faces?: { current: Map<string, MascotHandle | null> };
}) {
  return (
    <span className={wrapClass} style={color ? { filter: `hue-rotate(${hueFor(color)}deg)` } : undefined} aria-hidden>
      <Mascot
        ref={faceKey && faces ? (h) => { faces.current.set(faceKey, h); } : undefined}
        mood={mood ?? "neutral"}
      />
    </span>
  );
}

// ponytail: ONE minis row — the minimized pill renders the same faces as
// the grid (was hand-rolled duplicate markup in Island.tsx).
export function TeamMinis({ members, title }: { members: Member[]; title?: string }) {
  return (
    <span className="pill-team mini-grid" title={title} aria-hidden>
      {members.slice(0, 4).map((m) => (
        <span key={m.id} className="pill-face" title={m.name}>
          <MateFace color={m.color} mood="neutral" wrapClass="" />
        </span>
      ))}
    </span>
  );
}
const NAME_POOL = ["luna", "milo", "nala", "zuri", "kaya", "finn", "nova", "remy", "coco", "juno", "theo", "wren"];
// Per-mate look: hue-rotated buddy by member color (orange ≈ 25° base).
// Nicki (work buddy, mascot-top) stays untinted — she's the main.
const HUE_ROT = [175, 335, 0, 245, 135, 305, 20, 165];
export function hueFor(color: string): number {
  const i = TEAM_COLORS.indexOf(color);
  return i >= 0 ? HUE_ROT[i % HUE_ROT.length] : 0;
}
// Crew quips — the Dunder Mifflin rule: people choose the team for the
// people, not the room. One personality line per pool name (customs get
// none); the job itself is member.role, slot-owned and cyclable by the user.
const MATE_QUIPS: Record<string, string> = {
  luna: "keeps the loop honest",
  milo: "first to try, loudest to cheer",
  nala: "sniffs out new routes",
  zuri: "thinks three moves ahead",
  kaya: "ships it done-done",
  finn: "pokes holes, keeps it honest",
  nova: "morale and victory laps",
  remy: "counts every token",
  coco: "calm after errors",
  juno: "watches the loop, retries",
  theo: "reads the docs so you don't",
  wren: "carries drops phone to pc",
};
// Crew packs removed — header is mate-only (roles cycle from the tile menu).
// Affection — Grok-companion spirit, honest version: drives per mate id,
// persisted local. Tiles show a heart once driven 3+ times.
const AFF_KEY = "island.affection.v1";
function loadAff(): Record<string, number> {
  try {
    const raw = localStorage.getItem(AFF_KEY);
    const d: unknown = JSON.parse(raw ?? "{}");
    if (typeof d === "object" && d !== null) return d as Record<string, number>;
  } catch { /* private mode */ }
  return {};
}
function nextName(ms: Member[]): string {
  const taken = new Set(ms.map((m) => m.name.toLowerCase()));
  return NAME_POOL.find((n) => !taken.has(n)) ?? `mate${ms.length + 1}`;
}

function loadTeam(): Member[] {
  const fresh = (): Member[] => ["luna", "milo", "nala", "zuri"].map((name, i) => ({
    id: `m${i + 1}`, name, color: TEAM_COLORS[i], role: ROLE_POOL[i % ROLE_POOL.length] ?? "mate",
  }));
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // drop the auto-nicki tile (she's the mascot, not a mate).
        const ok = arr.filter((m): m is Member =>
          typeof m === "object" && m !== null && typeof (m as Member).name === "string" &&
          (m as Member).id !== "m-nicki"
        ).slice(0, 8);
        if (ok.length) {
          // force-rename: every slot takes the pool name (and color) in
          // order — customs included. Old names are gone for good.
          // Missing roles backfill by slot; kept roles + session pins
          // survive migration.
          return ok.map((m, i) => ({
            ...m,
            name: NAME_POOL[i % NAME_POOL.length] ?? m.name,
            color: TEAM_COLORS[i % TEAM_COLORS.length] ?? m.color,
            role: typeof (m as Member).role === "string" && (m as Member).role
              ? (m as Member).role
              : (ROLE_POOL[i % ROLE_POOL.length] ?? "mate"),
            sid: typeof (m as Member).sid === "string" && (m as Member).sid
              ? (m as Member).sid
              : undefined,
          }));
        }
      }
    }
  } catch { /* private mode — defaults */ }
  // default roster ships alphabetical; insertion order after that is
  // load-bearing (slot i ↔ live session i), so the grid never re-sorts.
  return fresh();
}

async function fetchProgress(sid: string): Promise<Progress | null> {
  try {
    const r = await fetch(`${API}/session?session=${encodeURIComponent(sid)}`);
    const j = await r.json();
    return (j?.progress as Progress) ?? null;
  } catch {
    return null;
  }
}

// Live progress per agent-session id. Shared by tiles + detail + Daily card.
export function useSessionProgress(sessions: AgentMini[]) {
  const [prog, setProg] = useState<Record<string, Progress>>({});
  const key = sessions.map((s) => s.session).join(",");
  useEffect(() => {
    let dead = false;
    sessions.forEach((s) => {
      void fetchProgress(s.session).then((p) => {
        if (!dead && p) setProg((prev) => ({ ...prev, [s.session]: p }));
      });
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const refresh = useCallback((sid: string) => {
    void fetchProgress(sid).then((p) => {
      if (p) setProg((prev) => ({ ...prev, [sid]: p }));
    });
  }, []);
  return { prog, refresh };
}

export function useTeam(): { members: Member[]; rename: (id: string, name: string) => void; remove: (id: string) => void; cycleRole: (id: string) => void; setSid: (id: string, sid: string) => void; add: () => void } {
  const [members, setMembers] = useState<Member[]>(loadTeam);
  useEffect(() => {
    try {
      localStorage.setItem(TEAM_KEY, JSON.stringify(members));
    } catch { /* private mode */ }
  }, [members]);
  const rename = (id: string, name: string) =>
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, name: name.slice(0, 24) } : m)));
  const remove = (id: string) =>
    setMembers((ms) => (ms.length <= 1 ? ms : ms.filter((m) => m.id !== id)));
  const cycleRole = (id: string) =>
    setMembers((ms) => ms.map((m) => {
      if (m.id !== id) return m;
      const i = ROLE_POOL.indexOf(m.role);
      return { ...m, role: ROLE_POOL[(i + 1) % ROLE_POOL.length] ?? "mate" };
    }));
  const setSid = (id: string, sid: string) =>
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, sid } : m)));
  const add = () =>
    setMembers((ms) => {
      if (ms.length >= 8) return ms;
      const name = nextName(ms);
      const color = TEAM_COLORS[NAME_POOL.indexOf(name) % TEAM_COLORS.length] ?? TEAM_COLORS[ms.length % TEAM_COLORS.length];
      return [...ms, { id: `m${Date.now()}`, name, color, role: ROLE_POOL[ms.length % ROLE_POOL.length] ?? "mate" }];
    });
  return { members, rename, remove, cycleRole, setSid, add };
}

// Step glyph — one icon per kind (navbar stroke family), shared by
// MemberDetail + Daily work steps. Active renders a CSS .spin arc,
// done a green check, todos dim via .st-todo.
export function StepGlyph({ label, status }: { label: string; status: string }) {
  if (status === "done") return <CheckIcon size={13} />;
  if (status === "error") return <XIcon size={13} />;
  if (status === "active") return <span className="spin" aria-hidden />;
  const l = label.toLowerCase();
  if (l.includes("read")) return <ReadIcon size={13} />;
  if (l.includes("edit")) return <PencilIcon size={13} />;
  if (l.includes("bash")) return <BashIcon size={13} />;
  if (l.includes("done") || l.includes("finish")) return <CheckIcon size={13} />;
  // ponytail: every step gets the same 13px icon slot — a centered dot,
  // never a text glyph that sits off-baseline vs the icons.
  return <span className="st-dot" aria-hidden />;
}
// Step list — one shared composite (was pasted 3× across TeamGrid /
// Cards / Daily with the same slice(-5) + status-class mapping). Steps
// in, rows out; empty renders nothing.
export function StepsList({ steps, n = 5 }: { steps: Step[]; n?: number }) {
  if (!steps.length) return null;
  return (
    <div className="live-steps">
      {steps.slice(-n).map((st) => (
        <div
          key={st.label}
          className={st.status === "done" ? "st-done" : st.status === "error" ? "st-error" : st.status === "active" ? "st-active" : "st-todo"}
        >
          <span className={`st-ic ${st.status === "done" ? "st-done" : st.status === "error" ? "st-error" : st.status === "active" ? "st-active" : ""}`}>
            <StepGlyph label={st.label} status={st.status} />
          </span>
          <span className="st-label">{st.label}</span>
        </div>
      ))}
    </div>
  );
}
// Code lens — what the agent is touching right now (coucou-frames
// style): filename bar + tail of the file. Rides the progress payload,
// so no extra fetch; absent file renders nothing.
export function LensBlock({ lens }: { lens?: Lens | null }) {
  if (!lens || !lens.file) return null;
  const diff = (lens.diff ?? []).slice(-8);
  return (
    <div className="lens-block">
      <div className="lens-file">{lens.file}</div>
      {lens.lines.length > 0 && (
        <pre className="lens-code">{lens.lines.join("\n")}</pre>
      )}
      {diff.length > 0 && (
        <pre className="lens-diff">{diff.map((ln, i) => (
          <span key={i} className={ln.startsWith("+") ? "ld-add" : ln.startsWith("-") ? "ld-del" : ln.startsWith("@") ? "ld-hunk" : undefined}>{ln}{"\n"}</span>
        ))}</pre>
      )}
    </div>
  );
}
// Segmented ticks — same language as the home capsules.
export function SegBar({ ratio, n = 20, flat = false }: { ratio: number; n?: number; flat?: boolean }) {
  const on = Math.max(0, Math.min(n, Math.round(ratio * n)));
  return (
    <div className={flat ? "segbar flat" : "segbar"} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i < on ? "on" : ""} />
      ))}
    </div>
  );
}

// One member's live session: task, Read/Edit/Bash/Done checklist with
// spinner on the running step, touched files, resume. Rendered inside
// Daily's left card (and below the grid in Lens).
export function MemberDetail({ member, session, progress, onResume, onRename, onRemove, onClose, onRole, team, onAssign, onRelay, manage = true }: {
  member: Member;
  session?: AgentMini;
  progress?: Progress;
  onResume?: (sid: string, first: string) => void;
  onRename?: (name: string) => void;
  onRemove?: () => void;
  onClose?: () => void;
  onRole?: () => void;
  // crew dispatch: give-a-task posts a real turn; relay hands this
  // mate's latest work to the target mate (bridge /handoff brief).
  team?: Member[];
  onAssign?: (targetId: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  onRelay?: (fromId: string, targetId: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  manage?: boolean;
}) {
  const [task, setTask] = useState("");
  const [target, setTarget] = useState(member.id);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { setTarget(member.id); setNote(""); }, [member.id]);
  const done = progress?.steps.filter((s) => s.status === "done").length ?? 0;
  const total = progress?.steps.length ?? 0;
  const liveStep = progress?.steps.find((s) => s.status === "active" || s.status === "pending");
  return (
    <div className="member-detail" style={{ ["--live-accent" as string]: member.color }}>
      <div className="live-top">
        <span className="live-hero">{member.name}</span>
        <span className="live-sub">{session ? `${member.name} · ${session.agent}` : `${member.role} · no session yet`}</span>
        {total > 0 && <span className="live-side">{done}/{total}</span>}
        {onClose && <button className="team-x" aria-label="Back to work" onClick={onClose}>×</button>}
      </div>
      {total > 0 && <SegBar ratio={done / total} n={20} />}
      {progress && progress.steps.length > 0 && (
        <StepsList steps={progress.steps} />
      )}
      {/* ponytail: idle slot with no session renders nothing — never an empty dim line. */}
      {(session || progress) && (
      <div className="live-dim">
        {liveStep ? `· ${liveStep.label}` : ""}
        {liveStep && progress && (progress.activity || progress.task || session?.first) ? " — " : ""}
        {progress ? ((progress.activity || progress.task || session?.first) ?? "") : (session ? "loading…" : "")}
      </div>
      )}
      {progress && progress.files.length > 0 && (
        <>
          <LensBlock lens={progress?.lens} />
          <div className="live-dim">
            {progress.files.slice(0, 3).map((f) => `${f.name} +${f.added} −${f.removed}`).join(" · ")}
          </div>
        </>
      )}
      <div className="team-detail-row">
        {session && onResume && (
          <button className="menu-act primary" onClick={() => onResume(session.session, session.first)}>
            Resume in chat
          </button>
        )}
        {manage && onRole && (
          <button className="menu-act" title="Cycle crew role" onClick={onRole}>↻ {member.role}</button>
        )}
        {manage && onRename && (
          <input
            className="team-edit"
            value={member.name}
            aria-label="Member name"
            onChange={(e) => onRename(e.target.value)}
          />
        )}
        {manage && onRemove && (
          <button className="menu-act" onClick={onRemove}>Remove</button>
        )}
      </div>
      {(onAssign || onRelay) && (team ?? []).length > 0 && (
        <div className="assign-row">
          <select
            className="assign-sel"
            aria-label="Assign to mate"
            value={target}
            disabled={busy}
            onChange={(e) => setTarget(e.target.value)}
          >
            {(team ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.name} · {m.role}</option>
            ))}
          </select>
          <input
            className="team-edit"
            value={task}
            aria-label="Task text"
            placeholder={`Give ${((team ?? []).find((m) => m.id === target)?.name) ?? "mate"} a task…`}
            disabled={busy}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && task.trim() && onAssign && !busy) {
                setBusy(true);
                setNote("sending…");
                onAssign(target, task.trim()).then((r) => {
                  setBusy(false);
                  setNote(r.ok ? "sent — watch the tile light up" : `stuck: ${r.error || "bridge refused"}`);
                  if (r.ok) setTask("");
                });
              }
            }}
          />
          {onAssign && (
            <button
              className="menu-act primary"
              disabled={busy || !task.trim()}
              onClick={() => {
                if (!task.trim()) return;
                setBusy(true);
                setNote("sending…");
                onAssign(target, task.trim()).then((r) => {
                  setBusy(false);
                  setNote(r.ok ? "sent — watch the tile light up" : `stuck: ${r.error || "bridge refused"}`);
                  if (r.ok) setTask("");
                });
              }}
            >
              Assign
            </button>
          )}
          {onRelay && (
            <button
              className="menu-act"
              title="Relay this mate's latest work to the selected mate"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setNote("relaying…");
                onRelay(member.id, target, task.trim()).then((r) => {
                  setBusy(false);
                  setNote(r.ok ? "relayed — brief handed over" : `stuck: ${r.error || "nothing to relay"}`);
                  if (r.ok) setTask("");
                });
              }}
            >
              ⤳
            </button>
          )}
        </div>
      )}
      {note && <div className="live-dim">{note}</div>}
    </div>
  );
}

export function TeamGrid({ sessions = [], onResume, onPick, onPickNicki, onGoChat, sel, onSel, detail = "below", team: teamProp, live: liveProp, compact = false }: {
  sessions?: AgentMini[];
  onResume?: (sid: string, first: string) => void;
  // pick mode (chat view): tapping a live tile opens that agent's chat
  // instead of selecting — the conversation moves, no detail panel.
  onPick?: (sid: string, first: string) => void;
  // back to nicki's own draft (only passed while driving a mate).
  onPickNicki?: () => void;
  // jump to the chat composer (home of the provider dropdown).
  onGoChat?: () => void;
  sel?: string | null;
  onSel?: (id: string | null) => void;
  detail?: "below" | "none";
  team?: ReturnType<typeof useTeam>;
  live?: ReturnType<typeof useSessionProgress>;
  // compact (chat view): start collapsed so the crew costs one header row
  // while chatting; the user can expand. Null = follow compact.
  compact?: boolean;
}) {
  const teamInternal = useTeam();
  const liveInternal = useSessionProgress(sessions);
  const { members, rename, remove, cycleRole, setSid, add } = teamProp ?? teamInternal;
  const { prog, refresh } = liveProp ?? liveInternal;
  // affection: drives per mate id (see AFF_KEY). Bumped on explicit
  // Resume; tiles show one heart at 3+ drives.
  const [aff, setAff] = useState<Record<string, number>>(loadAff);
  const bumpAff = (id: string) =>
    setAff((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      try {
        localStorage.setItem(AFF_KEY, JSON.stringify(next));
      } catch { /* private mode */ }
      return next;
    });
  const [inner, setInner] = useState<string | null>(null);
  const cur = onSel ? sel ?? null : inner;
  // ⋯ menu: resume / rename / remove without leaving the grid.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const menuDismiss = useDismiss<HTMLDivElement>(menuId !== null, () => {
    setMenuId(null);
    setRenaming(null);
  });
  // every mate keeps our face: a live mini that looks around, blinks,
  // and feels its own session (working → bright, error → annoyed).
  const faces = useRef(new Map<string, MascotHandle | null>());
  useEffect(() => {
    const timer = setInterval(() => {
      for (const h of faces.current.values()) {
        try {
          h?.setLook((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.2);
        } catch { /* unmounted mid-glance */ }
      }
    }, 3500);
    return () => clearInterval(timer);
  }, []);
  const pick = (id: string | null) => {
    if (onSel) onSel(id);
    else setInner(id);
  };
  // selected tile re-polls while open (4s rhythm — steps land step-by-step).
  useEffect(() => {
    if (!cur) return;
    const idx = members.findIndex((m) => m.id === cur);
    const s = idx >= 0 ? slotSession(members, sessions, idx) : undefined;
    if (!s) return;
    refresh(s.session);
    const t = setInterval(() => refresh(s.session), 4000);
    return () => clearInterval(t);
  }, [cur, members, sessions, refresh]);

  const selIdx = members.findIndex((m) => m.id === cur);
  const selSession = selIdx >= 0 ? slotSession(members, sessions, selIdx) : undefined;
  // grid stays visible while chatting (compact class shrinks it);
  // toggle only hides on explicit tap. compact no longer auto-collapses.
  const [shut, setShut] = useState<boolean | null>(null);
  const collapsed = shut ?? false;
  void compact;
  // nicki leads the grid visually (this chat is hers). Visual-only: she
  // takes no session slot, so slotSession indexing below is untouched.
  const nickiOn = !cur && !onPickNicki;
  const nickiClick = () => {
    // driving a mate: nicki's tile jumps back to her own draft.
    if (onPickNicki) {
      onPickNicki();
      return;
    }
    // chat pick mode: already talking to her — focus the composer.
    if (onPick) {
      document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
      return;
    }
    if (onGoChat) {
      onGoChat();
      return;
    }
    pick(null);
  };
  return (
    <div className="team-wrap">
      <div className="team-head">
        <button
          className="team-title team-toggle"
          aria-expanded={!collapsed}
          title={collapsed ? `Show crew (${members.length + 1})` : "Hide crew while chatting"}
          onClick={() => setShut(!collapsed)}
        >
          TEAM {members.length + 1}
        </button>
        <button className="effort-pill team-add" onClick={add} title={members.length >= 8 ? "Team is full (8)" : "Add a mate"}>
          {collapsed ? "+" : "+ Add mate"}
        </button>
      </div>
      {!collapsed && (
      <div className="team-grid">
        <div key="nicki" className="team-cellwrap">
          <button
            className={nickiOn ? "team-cell nicki on" : "team-cell nicki"}
            title={onPickNicki ? "nicki — main · back to her draft" : "nicki — main · this chat is hers · tap to talk"}
            aria-pressed={nickiOn}
            onClick={nickiClick}
          >
            <MateFace mood={nickiOn ? "happy" : "neutral"} faceKey="nicki" faces={faces} />
            <span className="team-meta">
              <span className="team-name">nicki</span>
              <span className="team-sub">main</span>
            </span>
          </button>
          {onPickNicki && (
            <button
              className="team-dots"
              aria-label="Options for nicki"
              aria-expanded={menuId === "nicki"}
              onClick={(e) => {
                e.stopPropagation();
                setMenuId(menuId === "nicki" ? null : "nicki");
                setRenaming(null);
              }}
            >
              <DotsIcon size={15} />
            </button>
          )}
          {onPickNicki && menuId === "nicki" && (
            <div ref={menuDismiss} className="sheet team-menu" role="menu" aria-label="Options for nicki">
              <MenuRow
                role="menuitem"
                onClick={() => {
                  onPickNicki();
                  setMenuId(null);
                }}
              >
                ↩ Back to draft
              </MenuRow>
            </div>
          )}
        </div>
        {members.map((m, i) => {
          const s = slotSession(members, sessions, i);
          const p = s ? prog[s.session] : undefined;
          const mood: MascotMood =
            p?.state === "error" ? "annoyed"
            : p?.state === "working" ? "happy"
            : p?.state === "thinking" ? "thinking"
            : p?.state === "finished" ? "joyful-wide"
            : "neutral";
          return (
            <div key={m.id} className="team-cellwrap">
              <button
                className={m.id === cur ? "team-cell on" : "team-cell"}
                title={s ? `${m.name} — ${m.role}${MATE_QUIPS[m.name] ? `. ${MATE_QUIPS[m.name]}` : ""} · ${s.agent} · ${s.first}` : `${m.name} — ${m.role}${MATE_QUIPS[m.name] ? `. ${MATE_QUIPS[m.name]}` : ""} · tap to view`}
                aria-pressed={m.id === cur}
                onClick={() => {
                  pick(m.id === cur ? null : m.id);
                  // pick mode: the tile IS the jump — open the mate's
                  // chat directly instead of selecting a detail panel.
                  // First tap claims the lane: an unpinned slot binds the
                  // session its tile is already showing (Munder-Difflin
                  // lanes — every mate keeps its own CLI from here on).
                  if (onPick && s) {
                    if (!m.sid) setSid(m.id, s.session);
                    refresh(s.session);
                    onPick(s.session, s.first);
                    return;
                  }
                  // pick mode + idle mate (no session yet): stay on
                  // nicki's chat — focus the composer, select nothing.
                  if (onPick) {
                    document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
                    return;
                  }
                  if (s) refresh(s.session);
                }}
              >
                <MateFace color={m.color} mood={mood} faceKey={m.id} faces={faces} />
                {renaming === m.id ? (
                  <input
                    className="team-edit"
                    value={draft}
                    autoFocus
                    aria-label="Member name"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      if (draft.trim()) rename(m.id, draft.trim());
                      setRenaming(null);
                      setMenuId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draft.trim()) {
                        rename(m.id, draft.trim());
                        setRenaming(null);
                        setMenuId(null);
                      }
                      if (e.key === "Escape") {
                        setRenaming(null);
                        setMenuId(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="team-meta">
                    <span className="team-name">{m.name}{(aff[m.id] ?? 0) >= 3 && <span className="team-hearts" title={`${aff[m.id]} drives`}>♥</span>}</span>
                    {!s && <span className="team-sub">{m.role}</span>}
                  </span>
                )}
                {/* engine row, full tile width: agent only (the name is
                    already the tile title — "luna · opencode" repeated it).
                    Tap jumps to the chat composer dropdown that owns
                    the switch. */}
                {s && (
                  onGoChat ? (
                    <span
                      className="team-prov"
                      role="button"
                      tabIndex={0}
                      title={`${m.name} · ${s.agent} — open provider in chat`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onGoChat();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          onGoChat();
                        }
                      }}
                    >
                      {s.agent}
                    </span>
                  ) : (
                    <span className="team-sub team-wide">{s.agent}</span>
                  )
                )}
              </button>
              <button
                className="team-dots"
                aria-label={`Options for ${m.name}`}
                aria-expanded={menuId === m.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(menuId === m.id ? null : m.id);
                  setRenaming(null);
                }}
              >
                <DotsIcon size={15} />
              </button>
              {menuId === m.id && (
                <div ref={menuDismiss} className="sheet team-menu" role="menu" aria-label={`Options for ${m.name}`}>
                  {s && onResume && (
                    <MenuRow
                      role="menuitem"
                      onClick={() => {
                        bumpAff(m.id);
                        onResume(s.session, s.first);
                        setMenuId(null);
                      }}
                    >
                      ↩ Resume in chat
                    </MenuRow>
                  )}
                  <MenuRow
                    role="menuitem"
                    onClick={() => {
                      setDraft(m.name);
                      setRenaming(m.id);
                    }}
                  >
                    ✎ Rename
                  </MenuRow>
                  {members.length > 1 && (
                    <MenuRow
                      role="menuitem"
                      danger
                      onClick={() => {
                        remove(m.id);
                        if (cur === m.id) pick(null);
                        setMenuId(null);
                      }}
                    >
                      ✕ Remove
                    </MenuRow>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
      {detail === "below" && !onPick && !collapsed && cur && selIdx >= 0 && (
        <div className="team-detail">
          <MemberDetail
            member={members[selIdx]}
            session={selSession}
            progress={selSession ? prog[selSession.session] : undefined}
            onResume={onResume ? (sid, first) => { if (selIdx >= 0) bumpAff(members[selIdx].id); onResume(sid, first); } : undefined}
            onRole={() => cycleRole(members[selIdx].id)}
            onRename={(n) => rename(members[selIdx].id, n)}
            onRemove={members.length > 1 ? () => { remove(members[selIdx].id); pick(null); } : undefined}
            onClose={() => pick(null)}
          />
        </div>
      )}
    </div>
  );
}
