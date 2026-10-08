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
export interface Member { id: string; name: string; color: string }
export interface Step { label: string; status: string }
export interface ProgFile { name: string; added: number; removed: number }
export interface Lens { file: string; lines: string[] }
export interface Progress { task: string; state: string; activity: string; steps: Step[]; files: ProgFile[]; lens: Lens }

// Name pool: every mate arrives named, deletes free the name back up.
const NAME_POOL = ["atlas", "bolt", "korus", "nova", "pixel", "mochi", "dash", "echo", "fizz", "maro", "tico", "yuki"];
function nextName(ms: Member[]): string {
  const taken = new Set(ms.map((m) => m.name.toLowerCase()));
  return NAME_POOL.find((n) => !taken.has(n)) ?? `mate${ms.length + 1}`;
}

function loadTeam(): Member[] {
  const fresh = (): Member[] => ["atlas", "bolt", "korus", "nova"].map((name, i) => ({
    id: `m${i + 1}`, name, color: TEAM_COLORS[i],
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
        if (ok.length) return ok;
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

export function useTeam(): { members: Member[]; rename: (id: string, name: string) => void; remove: (id: string) => void; add: () => void } {
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
  const add = () =>
    setMembers((ms) => {
      if (ms.length >= 8) return ms;
      const name = nextName(ms);
      const color = TEAM_COLORS[NAME_POOL.indexOf(name) % TEAM_COLORS.length] ?? TEAM_COLORS[ms.length % TEAM_COLORS.length];
      return [...ms, { id: `m${Date.now()}`, name, color }];
    });
  return { members, rename, remove, add };
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
  return <span aria-hidden>·</span>;
}
// Code lens — what the agent is touching right now (coucou-frames
// style): filename bar + tail of the file. Rides the progress payload,
// so no extra fetch; absent file renders nothing.
export function LensBlock({ lens }: { lens?: Lens | null }) {
  if (!lens || !lens.file) return null;
  return (
    <div className="lens-block">
      <div className="lens-file">{lens.file}</div>
      {lens.lines.length > 0 && (
        <pre className="lens-code">{lens.lines.join("\n")}</pre>
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
export function MemberDetail({ member, session, progress, onResume, onRename, onRemove, onClose, manage = true }: {
  member: Member;
  session?: AgentMini;
  progress?: Progress;
  onResume?: (sid: string, first: string) => void;
  onRename?: (name: string) => void;
  onRemove?: () => void;
  onClose?: () => void;
  manage?: boolean;
}) {
  const done = progress?.steps.filter((s) => s.status === "done").length ?? 0;
  const total = progress?.steps.length ?? 0;
  const liveStep = progress?.steps.find((s) => s.status === "active" || s.status === "pending");
  return (
    <div className="member-detail" style={{ ["--live-accent" as string]: member.color }}>
      <div className="live-top">
        <span className="live-hero">{member.name}</span>
        <span className="live-sub">{session?.agent ?? "no session yet"}</span>
        {total > 0 && <span className="live-side">{done}/{total}</span>}
        {onClose && <button className="team-x" aria-label="Back to work" onClick={onClose}>×</button>}
      </div>
      {total > 0 && <SegBar ratio={done / total} n={20} />}
      {progress && progress.steps.length > 0 && (
        <div className="live-steps">
          {progress.steps.slice(-5).map((st, i) => (
            <div
              key={st.label}
              className={st.status === "done" ? "st-done" : st.status === "error" ? "st-error" : st.status === "active" ? "st-active" : "st-todo"}
            >
              <span className="ln">{String(i + 1).padStart(2, "0")}</span>
              <span className={`st-ic ${st.status === "done" ? "st-done" : st.status === "error" ? "st-error" : st.status === "active" ? "st-active" : ""}`}>
                <StepGlyph label={st.label} status={st.status} />
              </span>{" "}
              {st.label}
            </div>
          ))}
        </div>
      )}
      <div className="live-dim">
        {liveStep ? `· ${liveStep.label}` : ""}
        {liveStep && progress && (progress.activity || progress.task || session?.first) ? " — " : ""}
        {progress ? ((progress.activity || progress.task || session?.first) ?? "") : (session ? "loading…" : "quiet — no live session in this slot")}
      </div>
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
    </div>
  );
}

export function TeamGrid({ sessions = [], onResume, sel, onSel, detail = "below", team: teamProp, live: liveProp }: {
  sessions?: AgentMini[];
  onResume?: (sid: string, first: string) => void;
  sel?: string | null;
  onSel?: (id: string | null) => void;
  detail?: "below" | "none";
  team?: ReturnType<typeof useTeam>;
  live?: ReturnType<typeof useSessionProgress>;
}) {
  const teamInternal = useTeam();
  const liveInternal = useSessionProgress(sessions);
  const { members, rename, remove, add } = teamProp ?? teamInternal;
  const { prog, refresh } = liveProp ?? liveInternal;
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
    const s = idx >= 0 ? sessions[idx] : undefined;
    if (!s) return;
    refresh(s.session);
    const t = setInterval(() => refresh(s.session), 4000);
    return () => clearInterval(t);
  }, [cur, members, sessions, refresh]);

  const selIdx = members.findIndex((m) => m.id === cur);
  const selSession = selIdx >= 0 ? sessions[selIdx] : undefined;
  return (
    <div className="team-wrap">
      <div className="team-head">
        <b className="team-title">TEAM</b>
        <button className="effort-pill team-add" onClick={add} title={members.length >= 8 ? "Team is full (8)" : "Add a mate"}>
          + Add mate
        </button>
      </div>
      <div className="team-grid">
        {members.map((m, i) => {
          const s = sessions[i];
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
                title={s ? `${s.agent} · ${s.first}` : `${m.name} — tap to view`}
                aria-pressed={m.id === cur}
                onClick={() => {
                  pick(m.id === cur ? null : m.id);
                  if (s) refresh(s.session);
                }}
              >
                <span className="team-face" aria-hidden>
                  <Mascot
                    ref={(h) => { faces.current.set(m.id, h); }}
                    mood={mood}
                  />
                </span>
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
                  <span className="team-name">{m.name}</span>
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
      {detail === "below" && cur && selIdx >= 0 && (
        <div className="team-detail">
          <MemberDetail
            member={members[selIdx]}
            session={selSession}
            progress={selSession ? prog[selSession.session] : undefined}
            onResume={onResume}
            onRename={(n) => rename(members[selIdx].id, n)}
            onRemove={members.length > 1 ? () => { remove(members[selIdx].id); pick(null); } : undefined}
            onClose={() => pick(null)}
          />
        </div>
      )}
    </div>
  );
}
