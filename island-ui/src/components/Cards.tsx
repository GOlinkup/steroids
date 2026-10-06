import { useEffect, useRef, useState } from "react";
import { PlusIcon, MicIcon, XIcon, ArrowUpIcon, PhoneIcon } from "./icons";
import { EffortPicker, ProviderPicker, ENGINES, displayModel } from "./pickers";
export { EffortPicker, ProviderPicker, ENGINES, displayModel } from "./pickers";
import { ActivityOrb } from "../orb";
import { IDLE_ACTIVITY } from "../orb_state";
import {
  formatSize,
  type AgentSession,
  type Approval,
  type Attachment,
  type ChatMessage,
  type ExploreFeed,
  type Question,
  type SkillHit,
} from "../store";

// Explore view — the live surface: search all 1,357 skills, trending,
// recent routes, agent sessions. Everything taps through to chat.
// Needs the bridge; offline it says so instead of showing mock shelves.
export function ExploreView({
  live,
  feed,
  onSearch,
  onPickSkill,
  agentSessions = [],
  onResumeAgent,
}: {
  live: boolean;
  feed: ExploreFeed | null;
  onSearch: (q: string) => Promise<SkillHit[]>;
  onPickSkill: (label: string) => void;
  agentSessions?: AgentSession[];
  onResumeAgent?: (sid: string, first: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SkillHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);
  useEffect(() => {
    const query = q.trim();
    if (!query || !live) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      onSearch(query).then((h) => {
        if (reqId.current !== id) return;
        setHits(h);
        setSearching(false);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, live, onSearch]);
  return (
    <div className="explore">
      <input
        className="explore-search"
        placeholder="Search skills…"
        value={q}
        disabled={!live}
        title={live ? "Search all indexed skills" : "Start the bridge for live search"}
        onChange={(e) => setQ(e.target.value)}
      />
      {!live && (
        <div className="card explore-offline">
          <div className="card-detail">Explore is live when the bridge runs:<br />`python3 island/bridge.py --serve`</div>
        </div>
      )}
      {q.trim() !== "" && (
        <>
          <div className="explore-label">{searching ? "Searching…" : `${hits?.length ?? 0} skills`}</div>
          <div className="try-col">
            {(hits ?? []).map((h) => (
              <button key={h.name} className="skill-hit" onClick={() => onPickSkill(h.name)}>
                <b>{h.name}</b>
                {!!h.description && <span>{h.description}</span>}
              </button>
            ))}
          </div>
        </>
      )}
      {!!feed?.trending.length && (
        <>
          <div className="explore-label">Trending</div>
          <div className="trend-row">
            {feed.trending.map((t) => (
              <button key={t.skill} className="trend-chip" onClick={() => onPickSkill(t.skill)}>
                {t.skill}<em>{t.n}</em>
              </button>
            ))}
          </div>
        </>
      )}
      {!!feed?.recent.length && (
        <>
          <div className="explore-label">Recent routes</div>
          <div className="try-col">
            {feed.recent.map((r, i) => (
              <div key={`${r.ts}-${i}`} className="recent-row">
                <span className="recent-chips">
                  {r.skills.map((s) => (
                    <button key={s} className="skill-chip" onClick={() => onPickSkill(s)}>{s}</button>
                  ))}
                </span>
                <span className="recent-age">{age(r.ts)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {!!agentSessions.length && (
        <>
          <div className="explore-label">Agent sessions</div>
          <div className="try-col">
            {agentSessions.slice(0, 5).map((s) => (
              <button
                key={s.session}
                className="try-btn"
                title={`${s.agent} · ${s.session}`}
                onClick={() => onResumeAgent?.(s.session, s.first)}
              >
                <b className="kind-tag">{s.agent}</b> {s.first}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function age(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Teach / close-call approval card — Allow / Deny / Always.
export function ApprovalCard({
  approval,
  onDecide,
}: {
  approval: Approval;
  onDecide: (decision: string) => void;
}) {
  return (
    <div className="card approval">
      <div className="card-title">{approval.title}</div>
      <div className="card-detail">{approval.detail}</div>
      <div className="btn-row">
        {approval.options.map((o) => (
          <button key={o} className={o === "Deny" ? "danger" : "primary"} onClick={() => onDecide(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// AskUser-style question card — single or multi-select up to 4 choices.
export function QuestionCard({
  question,
  onAnswer,
}: {
  question: Question;
  onAnswer: (answers: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (c: string) =>
    setPicked((p) =>
      question.multi ? (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]) : [c],
    );
  return (
    <div className="card question">
      <div className="card-title">{question.title}</div>
      <div className="choice-col">
        {question.choices.map((c) => (
          <button
            key={c}
            className={picked.includes(c) ? "choice picked" : "choice"}
            onClick={() => toggle(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="btn-row">
        <button className="primary" onClick={() => onAnswer(picked)} disabled={!picked.length}>
          Send{question.multi && picked.length > 1 ? ` (${picked.length})` : ""}
        </button>
      </div>
    </div>
  );
}

// Chat panel — engine picker (provider + model + effort, or Auto),
// animated token meter, square OpenAI-style composer, history lives top-right.
// Engine control lives in ./pickers.tsx (reusable OOP base).

// Composer status: last-turn time + phone-pipe state. Provider/model
// already show in the pills above, so this line carries what they can't:
// relay live vs offline + how many drops are queued to fire on reconnect.
export function StatusLine({ thinking, turnMs, linked, queued }: { thinking: boolean; turnMs: number | null; linked: boolean; queued: number }) {
  const link = linked ? "linked" : queued > 0 ? `offline · queued ${queued}` : "offline";
  const bits = [thinking ? "…" : turnMs !== null ? `${turnMs.toFixed(1)}s` : null, link].filter(
    (b): b is string => b !== null,
  );
  return (
    <span className="tokens" title="last turn time · phone pipe (relay live, outbox offline)">
      {bits.join(" · ")}
    </span>
  );
}

export function ChatPanel({
  messages,
  onSend,
  thinking,
  attachments,
  onFiles,
  onRemoveAttachment,
  onOpenLens,
  onDropToPhone,
  phoneLinked = false,
  queuedDrops = 0,
  liveShots = [],
}: {
  messages: ChatMessage[];
  onSend: (text: string, provider?: string, opts?: { model: string; effort: string }) => void;
  thinking: boolean;
  attachments: Attachment[];
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (id: number) => void;
  onOpenLens: () => void;
  onDropToPhone?: () => void;
  phoneLinked?: boolean;
  queuedDrops?: number;
  liveShots?: Array<{ src: string; label: string }>;
}) {
  const [provider, setProvider] = useState(ENGINES[0].id);
  const [model, setModel] = useState(ENGINES[0].models[0]);
  const [effort, setEffort] = useState<string>("med");
  const [openPicker, setOpenPicker] = useState<null | "provider" | "effort">(null);
  const [draft, setDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [turnMs, setTurnMs] = useState<number | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [composerDrag, setComposerDrag] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const snapRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const sentAt = useRef(0);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; timer: ReturnType<typeof setInterval> } | null>(null);
  const pickProvider = (id: string) => {
    const eng = ENGINES.find((e) => e.id === id) ?? ENGINES[0];
    setProvider(eng.id);
    setModel(eng.models[0]);
  };
  const togglePicker = (which: "provider" | "effort") =>
    setOpenPicker((cur) => (cur === which ? null : which));
  const submit = () => {
    const t = draft.trim();
    if ((!t && !attachments.length) || thinking) return;
    sentAt.current = performance.now();
    setTurnMs(null);
    setDraft("");
    if (boxRef.current) boxRef.current.style.height = "auto";
    onSend(t, provider, { model, effort });
  };
  const canSend = draft.trim().length > 0 || attachments.length > 0;

  const stopRecording = (cancel = false) => {
    const r = recRef.current;
    if (!r) return;
    clearInterval(r.timer);
    recRef.current = null;
    setRecording(false);
    setRecSecs(0);
    if (cancel) {
      try { r.rec.stop(); } catch { /* ignore */ }
      return;
    }
    r.rec.onstop = () => {
      const blob = new Blob(r.chunks, { type: r.rec.mimeType || "audio/webm" });
      if (blob.size > 0) {
        onFiles([new File([blob], `voice-${new Date().toLocaleTimeString().replaceAll(":", "")}.webm`, { type: blob.type })]);
      }
    };
    try { r.rec.stop(); } catch { /* ignore */ }
  };

  const toggleRecording = async () => {
    if (recording) {
      stopRecording();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const timer = setInterval(() => setRecSecs((s) => s + 1), 1000);
      recRef.current = { rec, chunks, timer };
      rec.start();
      setRecording(true);
      setRecSecs(0);
    } catch {
      // mic denied — no fake state, just stay idle
    }
  };
  // stamp turn time when the reply lands
  const wasThinking = useRef(false);
  useEffect(() => {
    if (wasThinking.current && !thinking && sentAt.current) {
      setTurnMs((performance.now() - sentAt.current) / 1000);
      sentAt.current = 0;
    }
    wasThinking.current = thinking;
  }, [thinking]);
  return (
    <div
      className={dragOver ? "card chat-card dragover" : "card chat-card"}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        // card-level catch-all; composer handles its own drops (stopPropagation
        // there) so a file never attaches twice via the page handler.
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (!files.length) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        onFiles(files);
      }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData?.files ?? []);
        if (files.length) {
          e.preventDefault();
          onFiles(files);
        }
      }}
    >
      <div className="chat-log">
        {messages.length === 0 && !thinking && (
          <ActivityOrb
            activity={{ ...IDLE_ACTIVITY, listening: recording }}
            label={recording ? "listening" : "breathing"}
          />
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "chat-row user" : "chat-row"}>
            <div className={m.role === "user" ? "bubble" : "reply"}>
              {m.attachments?.filter((a) => a.kind === "image" && a.url).map((a) => (
                <img
                  key={a.id}
                  src={a.url}
                  alt={a.name}
                  className="bubble-img"
                  onClick={onOpenLens}
                />
              ))}
              {m.attachments?.filter((a) => a.kind === "audio" && a.url).map((a) => (
                <audio key={a.id} src={a.url} controls className="bubble-audio" />
              ))}
              {m.attachments?.filter((a) => !(a.kind === "image" && a.url) && !(a.kind === "audio" && a.url)).map((a) => (
                <span key={a.id} className="inline-chip"><b className="kind-tag">{kindIcon(a.kind)}</b> {a.name}</span>
              ))}
              {m.content && <div>{md(m.content)}</div>}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="chat-row">
            <div className="reply working">
              {liveShots[0] && (
                <img
                  src={liveShots[0].src}
                  alt={liveShots[0].label}
                  className="bubble-img"
                  onClick={onOpenLens}
                />
              )}
              <div className="typing"><i /><i /><i /></div>
              <span className="work-cap">
                <i className="live-dot" />working{liveShots[0] ? ` · ${liveShots[0].label}` : ""}
              </span>
            </div>
          </div>
        )}
      </div>
      {attachments.length > 0 && (
        <div className="chip-row">
          {attachments.map((a) => (
            a.kind === "image" && a.url ? (
              <span key={a.id} className="chip image-full">
                <img src={a.url} alt={a.name} className="bubble-img" />
                <button className="chip-x" onClick={() => onRemoveAttachment(a.id)} aria-label="Remove"><XIcon /></button>
              </span>
            ) : (
              <span key={a.id} className="chip">
                {a.kind === "image" && a.url && (
                  <img src={a.url} alt={a.name} style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} />
                )}
                <i className="chip-dot" />
                <span><b className="kind-tag">{kindIcon(a.kind)}</b> {a.name} · {formatSize(a.size)}</span>
                <button className="chip-x" onClick={() => onRemoveAttachment(a.id)} aria-label="Remove"><XIcon /></button>
              </span>
            )
          ))}
        </div>
      )}
      <div
        className={composerDrag ? "composer-box dragover" : "composer-box"}
        onDragEnter={(e) => {
          if (!e.dataTransfer?.types.includes("Files")) return;
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current++;
          setComposerDrag(true);
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer?.types.includes("Files")) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setComposerDrag(false);
        }}
        onDrop={(e) => {
          e.stopPropagation();
          dragDepth.current = 0;
          setComposerDrag(false);
          const files = Array.from(e.dataTransfer?.files ?? []);
          if (files.length) {
            e.preventDefault();
            setAttachOpen(false);
            onFiles(files);
            return;
          }
          // text/URL drop: insert into the draft instead of swallowing it.
          const text = e.dataTransfer?.getData("text") ?? "";
          if (text) {
            e.preventDefault();
            setDraft((d) => (d ? `${d} ${text}` : text));
          }
        }}
      >
        {composerDrag && (
          <div className="composer-drop-hint" aria-hidden>Release to attach 📎</div>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={snapRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <textarea
          ref={boxRef}
          className="composer-input"
          rows={1}
          placeholder={attachments.length ? "Ask about these files…" : `Ask ${displayModel(model)} anything…`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const el = boxRef.current;
            if (el) {
              el.style.height = "auto";
              el.style.height = Math.min(120, el.scrollHeight) + "px";
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-innerbar">
          <div className="attach-wrap">
            <button
              className="tool-btn"
              title="Attach or link — files, camera, more"
              onClick={() => setAttachOpen((o) => !o)}
            >
              <PlusIcon size={20} />
            </button>
            {attachOpen && (
              <div className="attach-menu" role="menu" aria-label="Attach options">
                <button
                  className="attach-opt"
                  onClick={() => { setAttachOpen(false); fileRef.current?.click(); }}
                >
                  📎 Attach files
                </button>
                <button
                  className="attach-opt"
                  onClick={() => { setAttachOpen(false); snapRef.current?.click(); }}
                >
                  📷 Snap from camera
                </button>
              </div>
            )}
          </div>
          <button
            className="effort-pill drop-btn"
            title={phoneLinked ? "Send attached files via the paired phone pipe" : "No pair yet — queues, fires on reconnect"}
            onClick={() => onDropToPhone?.()}
            disabled={!attachments.length}
          >
            <PhoneIcon size={14} /> {isPcSide ? "Drop to phone" : "Drop to PC"}
          </button>
          <div className="picker-group">
            <ProviderPicker
              provider={provider}
              model={model}
              onProvider={pickProvider}
              onModel={setModel}
              open={openPicker === "provider"}
              onToggle={() => togglePicker("provider")}
            />
            <EffortPicker
              value={effort}
              model={displayModel(model)}
              onChange={setEffort}
              open={openPicker === "effort"}
              onToggle={() => togglePicker("effort")}
            />
          </div>
          <button
            className={recording ? "tool-btn recording" : "tool-btn"}
            title={recording ? `Stop recording (${recSecs}s)` : "Record voice note"}
            onClick={toggleRecording}
          >
            {recording ? <span className="rec-dot" /> : <MicIcon size={20} />}
          </button>
          <button className={canSend ? "send-btn ready" : "send-btn"} onClick={submit} aria-label="Send" disabled={!canSend}><ArrowUpIcon size={20} /></button>
        </div>
      </div>
      <div className="composer-status">
        <StatusLine thinking={thinking} turnMs={turnMs} linked={phoneLinked} queued={queuedDrops} />
      </div>
    </div>
  );
}

function kindIcon(kind: Attachment["kind"]): string {
  switch (kind) {
    case "image": return "IMG";
    case "audio": return "AUD";
    case "code": return "CODE";
    case "doc": return "DOC";
    default: return "FILE";
  }
}

// Minimal markdown-lite: **bold**, `code`, line breaks. No dep, offline.
export function md(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return <b key={i}>{p.slice(2, -2)}</b>;
    }
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
      return <code key={i} className="inline-code">{p.slice(1, -1)}</code>;
    }
    return (
      <span key={i}>
        {p.split("\n").map((line, j, arr) => (
          <span key={j}>
            {line}
            {j < arr.length - 1 && <br />}
          </span>
        ))}
      </span>
    );
  });
}

// Settings view — sound + volume, provider, active pills, auto-close.
// Everything configurable lives here so the navbar stays at 6 icons.
export interface SettingsState {
  soundOn: boolean;
  volume: number;
  provider: string;
  activePills: string[];
  autoClose: number;
  autoSave: boolean;
}

const ALL_PILLS = ["steroids", "opencode", "claude", "codex", "ollama"];

// Pair panel — links this browser with the phone over the self relay.
// Zero typing: the phone knocks, the PC taps Allow once, linked forever.
// PC side shows knocks + the LAN URL to open on the phone. Same WiFi, no cloud.
export interface LinkRequest {
  token: string;
  label: string;
}

export const isPcSide =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

export function PairPanel({
  linked,
  pending,
  lan,
  onPaired,
  onApprove,
  onUnpair,
}: {
  linked: boolean;
  pending: LinkRequest[];
  lan: string;
  onPaired: (endpoint: string, key: string) => void;
  onApprove: (token: string) => void;
  onUnpair: () => void;
}) {
  const [knocking, setKnocking] = useState(false);
  const [msg, setMsg] = useState("");
  const origin = window.location.origin;
  const knock = async () => {
    setKnocking(true);
    setMsg("knocking — tap Allow on the PC…");
    try {
      const r = await fetch(`${origin}/relay/link-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Phone" }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error("knock refused");
      const t0 = Date.now();
      while (Date.now() - t0 < 5 * 60 * 1000) {
        await new Promise((w) => setTimeout(w, 2000));
        const s = await fetch(`${origin}/relay/link-status?token=${j.token}`)
          .then((x) => x.json()).catch(() => null);
        if (s?.approved && s.key) {
          setKnocking(false);
          setMsg("");
          onPaired(origin, s.key);
          return;
        }
      }
      setMsg("no answer — knock again while the PC island is open");
    } catch {
      setMsg("bridge not reachable — same WiFi as the PC?");
    }
    setKnocking(false);
  };
  if (linked) {
    return (
      <div className="set-row col">
        <span className="set-label">Phone link</span>
        <div className="btn-row">
          <button className="primary" disabled>✓ Phone linked</button>
          <button onClick={onUnpair}>Unpair</button>
        </div>
      </div>
    );
  }
  return (
    <div className="set-row col">
      <span className="set-label">Phone link</span>
      {isPcSide ? (
        <>
          {!!lan && <div className="card-detail">on your phone open {lan} → Settings → Link this phone</div>}
          {pending.length === 0 && <div className="card-detail">no phones knocking</div>}
          {pending.map((p) => (
            <div className="btn-row" key={p.token}>
              <span>📲 {p.label} wants to link</span>
              <button className="primary" onClick={() => onApprove(p.token)}>Allow</button>
            </div>
          ))}
        </>
      ) : (
        <div className="btn-row">
          <button className="primary" onClick={() => void knock()} disabled={knocking}>
            {knocking ? "Waiting for PC…" : "Link this phone"}
          </button>
        </div>
      )}
      {!!msg && <div className="card-detail">{msg}</div>}
    </div>
  );
}

export function SettingsView({
  settings,
  onChange,
  pair,
}: {
  settings: SettingsState;
  onChange: (s: SettingsState) => void;
  pair?: React.ReactNode;
}) {
  const set = (patch: Partial<SettingsState>) => onChange({ ...settings, ...patch });
  const togglePill = (id: string) =>
    set({
      activePills: settings.activePills.includes(id)
        ? settings.activePills.filter((p) => p !== id)
        : [...settings.activePills, id],
    });
  return (
    <div className="card settings">
      <div className="set-row">
        <button
          className={settings.autoSave ? "switch on" : "switch"}
          onClick={() => set({ autoSave: !settings.autoSave })}
          aria-label="Auto-save incoming drops"
        >
          <i />
        </button>
        <span>Auto-save incoming drops</span>
      </div>
      <div className="set-row">
        <button
          className={settings.soundOn ? "switch on" : "switch"}
          onClick={() => set({ soundOn: !settings.soundOn })}
          aria-label="Sound"
        >
          <i />
        </button>
        <span>Notification sounds</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.volume * 100)}
          onChange={(e) => set({ volume: Number(e.target.value) / 100 })}
          className="vol"
        />
      </div>
      <div className="set-row">
        <span className="set-label">Chat provider</span>
        <div className="seg">
          {["opencode", "claude", "codex", "ollama"].map((p) => (
            <button
              key={p}
              className={settings.provider === p ? "seg-btn on" : "seg-btn"}
              onClick={() => set({ provider: p })}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="set-row col">
        <span className="set-label">Active pills</span>
        <div className="pill-toggles">
          {ALL_PILLS.map((p) => (
            <button
              key={p}
              className={settings.activePills.includes(p) ? "hpill on" : "hpill"}
              onClick={() => togglePill(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <span className="set-label">Auto-close</span>
        <div className="seg">
          {[10, 15, 30].map((s) => (
            <button
              key={s}
              className={settings.autoClose === s ? "seg-btn on" : "seg-btn"}
              onClick={() => set({ autoClose: s })}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>
      {pair}
    </div>
  );
}
