import { useEffect, useRef, useState } from "react";
import { PlusIcon, MicIcon, XIcon, ArrowUpIcon, DropIcon, CopyIcon, CheckIcon, ThumbUpIcon, ThumbDownIcon, PencilIcon, ResetIcon, PhoneIcon, BoltIcon } from "./icons";
import { EffortPicker, PillButton, ProviderPicker, useDismiss, useEngines, ENGINES, displayModel } from "./pickers";
export { EffortPicker, ProviderPicker, ENGINES, displayModel } from "./pickers";
import { ActivityOrb } from "../orb";
import { IDLE_ACTIVITY } from "../orb_state";
import {
  classifyAttachment,
  formatSize,
  type AgentSession,
  type Approval,
  type Attachment,
  type ChatMessage,
  type ExploreFeed,
  type IslandView,
  type Question,
  type SkillHit,
} from "../store";

// Card shell — one OOP base for every view card (home/daily + chat +
// approval/question/finished). Radius + side/bottom padding live in
// `.card` (index.css) only; variants add width/state, never geometry.
export function Card({
  className = "",
  children,
  ...rest
}: {
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </div>
  );
}

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
  // ponytail: searching flips true inside the debounce timeout (async), never
  // synchronously in the effect — sync setState here double-renders per keystroke.
  useEffect(() => {
    const query = q.trim();
    if (!query || !live) return;
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      setSearching(true);
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
      {live && q.trim() !== "" && (
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

// Dashed rounded frame drawn as SVG so the dashes march — ported from
// the Coucou drop card (docs/coucou-study, MIT code). Rendered only while
// a drag hovers, never idle.
function DropFrame({ rx = 20 }: { rx?: number }) {
  return (
    <svg className="drop-frame" preserveAspectRatio="none" aria-hidden>
      <rect rx={rx} />
    </svg>
  );
}

// Composer status: last-turn time + phone-pipe state. Queue count lives
// only in the chat strip suggestion, never nagged here.
export function StatusLine({ thinking, turnMs, linked }: { thinking: boolean; turnMs: number | null; linked: boolean }) {
  const link = linked ? "phone linked" : "phone offline";
  const bits = [thinking ? "…" : turnMs !== null ? `${turnMs.toFixed(1)}s` : null, link].filter(
    (b): b is string => b !== null,
  );
  if (!bits.length) return null;
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
  onAdoptAttachments,
  onOpenLens,
  onDropToPhone,
  onDropFilesToPhone,
  phoneLinked = false,
  liveShots = [],
  bridgeOn = false,
  providers = null,
  installState = "idle",
  onInstall = () => {},
  liveActivity = null,
  livePartial = null,
  turnEngine = "",
}: {
  messages: ChatMessage[];
  // filesOverride: explicit attachment set for this turn. undefined = use
  // the composer's pending chips; [] = text-only (skill taps must never
  // steal chips you staged for another question).
  onSend: (text: string, provider?: string, opts?: { model: string; effort: string }, filesOverride?: Attachment[] | null) => void;
  thinking: boolean;
  attachments: Attachment[];
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (id: number) => void;
  // history chips carry no File handle — the app re-resolves them via url.
  onAdoptAttachments: (atts: Attachment[]) => void;
  onOpenLens: () => void;
  onDropToPhone?: () => void;
  onDropFilesToPhone?: (files: File[]) => void;
  phoneLinked?: boolean;
  liveShots?: Array<{ src: string; label: string }>;
  bridgeOn?: boolean;
  // No-agent setup: bridge up but neither CLI found. Card installs
  // opencode in one click; hidden in every other state.
  providers?: { opencode: boolean; claude: boolean } | null;
  installState?: "idle" | "working" | "error";
  onInstall?: () => void;
  liveActivity?: string | null;
  livePartial?: string | null;
  turnEngine?: string;
}) {
  const engines = useEngines();
  const [provider, setProvider] = useState(ENGINES[0].id);
  const [model, setModel] = useState(ENGINES[0].models[0]);
  const [effort, setEffort] = useState<string>("med");
  const [openPicker, setOpenPicker] = useState<null | "provider" | "effort">(null);
  const [draft, setDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [turnMs, setTurnMs] = useState<number | null>(null);
  const [workSecs, setWorkSecs] = useState(0);
  // ponytail: reset-on-prop-change via render-adjust, not an effect —
  // sync setState in useEffect double-renders every turn start.
  const [prevThinking, setPrevThinking] = useState(thinking);
  if (thinking !== prevThinking) {
    setPrevThinking(thinking);
    if (thinking) setWorkSecs(0);
  }
  // Live strip (Atoll live activities): mic / queued drops / battery poll.
  // Rows render only while live — nothing live, no strip.
  const [battery, setBattery] = useState<{ has_battery: boolean; pct: number | null; charging: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () => {
      fetch(`${window.location.origin}/battery`)
        .then((r) => r.json())
        .then((j) => {
          if (alive && j && typeof j.has_battery === "boolean") setBattery(j);
        })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (!thinking) return;
    const t0 = Date.now();
    const timer = setInterval(() => setWorkSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [thinking]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [votes, setVotes] = useState<Record<number, 1 | -1>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const attachDismiss = useDismiss<HTMLDivElement>(attachOpen, () => setAttachOpen(false));  const [composerDrag, setComposerDrag] = useState(false);
  const [phoneDrag, setPhoneDrag] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const snapRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const sentAt = useRef(0);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; timer: ReturnType<typeof setInterval> } | null>(null);
  const pickProvider = (id: string) => {
    const eng = engines.find((e) => e.id === id) ?? engines[0];
    setProvider(eng.id);
    // keep the current model when it exists on the new engine (e.g. the
    // live opencode list); otherwise fall back to its first model.
    setModel((cur) => (eng.models.includes(cur) ? cur : eng.models[0]));
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
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !thinking;

  // edit a sent message back into the composer, attachments ride along
  // (fresh ids, same object URLs); regen re-sends the last user turn
  // WITH its attachments as an explicit set, composer chips untouched.
  const editBack = (text: string, atts?: Attachment[]) => {
    setDraft(text);
    if (atts?.length) onAdoptAttachments(atts);
    const el = boxRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(120, el.scrollHeight) + "px";
      el.focus();
    }
  };
  const regenLast = () => {
    const last = [...messages].reverse().find((m) => m.role === "user");
    if (!last || thinking) return;
    sentAt.current = performance.now();
    setTurnMs(null);
    onSend(last.content, provider, { model, effort }, last.attachments ?? []);
  };
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  // message actions: copy the reply, like what the agent sent. Local only.
  const copyMsg = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
  };
  const toggleVote = (id: number, v: 1 | -1) =>
    setVotes((prev) => {
      const n = { ...prev };
      if (n[id] === v) delete n[id];
      else n[id] = v;
      return n;
    });

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
  const wasThinking = useRef(false);  useEffect(() => {
    if (wasThinking.current && !thinking && sentAt.current) {
      setTurnMs((performance.now() - sentAt.current) / 1000);
      sentAt.current = 0;
    }
    wasThinking.current = thinking;
  }, [thinking]);
  return (
    <Card
      className={dragOver ? "chat-card dragover" : "chat-card"}
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
        {(recording ||
          (battery?.has_battery === true && (battery.charging || (battery.pct ?? 100) <= 20))) && (
          <div className="live-strip" aria-live="polite">
            {recording && (
              <span className="live-row">
                <i className="live-dot" />Recording {recSecs}s — tap the mic to stop
              </span>
            )}
            {battery?.has_battery === true && (battery.charging || (battery.pct ?? 100) <= 20) && (
              <span className="live-row">
                <BoltIcon size={12} />
                {battery.charging ? `Charging ${battery.pct ?? "?"}%` : `Battery ${battery.pct ?? "?"}% — plug in`}
              </span>
            )}
          </div>
        )}
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
                  title={`${a.name} — click to open full size`}
                  className="bubble-img"
                  onClick={() => { if (a.url) window.open(a.url, "_blank", "noopener"); }}
                />
              ))}
              {m.attachments?.filter((a) => a.kind === "audio" && a.url).map((a) => (
                <audio key={a.id} src={a.url} controls className="bubble-audio" />
              ))}
              {m.attachments?.filter((a) => !(a.kind === "image" && a.url) && !(a.kind === "audio" && a.url)).map((a) => (
                <span key={a.id} className="inline-chip"><b className="kind-tag">{kindIcon(a.kind)}</b> {a.name}</span>
              ))}
              {m.content && <div>{md(m.content)}</div>}
              {m.role === "user" && m.content && (
                <div className="msg-actions">
                  <button
                    className="msg-act"
                    title="Copy message"
                    onClick={() => void copyMsg(m.id, m.content)}
                  >
                    {copiedId === m.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  </button>
                  <button
                    className="msg-act"
                    title="Edit in composer (attachments ride along)"
                    onClick={() => editBack(m.content, m.attachments)}
                  >
                    <PencilIcon size={14} />
                  </button>
                </div>
              )}
              {m.role === "assistant" && m.content && (
                <div className="msg-actions">
                  <button
                    className="msg-act"
                    title={copiedId === m.id ? "Copied" : "Copy reply"}
                    onClick={() => void copyMsg(m.id, m.content)}
                  >
                    {copiedId === m.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  </button>
                  <button
                    className={votes[m.id] === 1 ? "msg-act on" : "msg-act"}
                    title="Good reply"
                    onClick={() => toggleVote(m.id, 1)}
                  >
                    <ThumbUpIcon size={14} />
                  </button>
                  <button
                    className={votes[m.id] === -1 ? "msg-act on" : "msg-act"}
                    title="Bad reply"
                    onClick={() => toggleVote(m.id, -1)}
                  >
                    <ThumbDownIcon size={14} />
                  </button>
                  {m.id === lastAssistantId && (
                    <button
                      className="msg-act"
                      title="Regenerate reply"
                      onClick={regenLast}
                    >
                      <ResetIcon size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="chat-row">
            <div className="reply working">
              <div className="work-pulse" aria-hidden />
              <div className="work-meta">
                <span className="work-cap">
                  <i className={bridgeOn ? "live-dot" : "dead-dot"} />
                  {bridgeOn ? (liveActivity || `talking to ${turnEngine || `${provider}/${displayModel(model)}`}`) : "bridge down — nothing running"}
                </span>
                <span className="work-sub">
                  {workSecs}s{liveShots[0] ? ` · seeing ${liveShots[0].label}` : ""}
                </span>
                {!!livePartial && (
                  <div className="work-partial">{livePartial.slice(-600)}</div>
                )}
              </div>
              {liveShots[0] && (
                <img
                  src={liveShots[0].src}
                  alt={liveShots[0].label}
                  className="bubble-img"
                  onClick={onOpenLens}
                />
              )}
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
                <i className="chip-dot" />
                <span><b className="kind-tag">{kindIcon(a.kind)}</b> {a.name} · {formatSize(a.size)}</span>
                <button className="chip-x" onClick={() => onRemoveAttachment(a.id)} aria-label="Remove"><XIcon /></button>
              </span>
            )
          ))}
        </div>
      )}
      {bridgeOn && providers && !providers.opencode && !providers.claude && (
        <div className="card" role="status" aria-label="Agent setup">
          <div className="card-title">No agent installed yet</div>
          <div className="card-detail">
            Steroids chats through your own CLI. One click installs opencode — free, no API key.
          </div>
          {installState === "error" ? (
            <div className="card-detail">
              Automatic install failed — run this in a terminal, then send again:<br />
              <span className="inline-code">curl -fsSL https://opencode.ai/install | bash</span>
            </div>
          ) : (
            <div className="btn-row">
              <PillButton onClick={onInstall} disabled={installState === "working"}>
                {installState === "working" ? "Installing…" : "Install opencode"}
              </PillButton>
            </div>
          )}
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
          <>
            <DropFrame />
            <div className="composer-drop-hint" aria-hidden>Drop to ask the agent 📎</div>
          </>
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
          <div ref={attachDismiss} className="attach-wrap">
            <button
              className="tool-btn"
              title="Attach or link — files, camera, more"
              onClick={() => setAttachOpen((o) => !o)}
            >
              <PlusIcon size={20} />
            </button>
            {attachOpen && (
              <div className="sheet attach-menu" role="menu" aria-label="Attach options">
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
          <span
            className="drop-wrap"
            onDragOver={(e) => {
              if (!e.dataTransfer?.types.includes("Files")) return;
              e.preventDefault();
              e.stopPropagation();
              setPhoneDrag(true);
            }}
            onDragLeave={() => setPhoneDrag(false)}
            onDrop={(e) => {
              const files = Array.from(e.dataTransfer?.files ?? []);
              if (!files.length) return;
              e.preventDefault();
              e.stopPropagation();
              setPhoneDrag(false);
              onDropFilesToPhone?.(files);
            }}
          >
            <button
              className={phoneDrag ? "effort-pill drop-btn dragover" : "effort-pill drop-btn"}
              title={phoneLinked ? "Send attached files via the paired phone pipe — or drop files here" : "No pair yet — queues, fires on reconnect — or drop files here"}
              aria-label={isPcSide ? "Drop to phone" : "Drop to PC"}
              onClick={() => onDropToPhone?.()}
              disabled={!attachments.length && !phoneDrag}
            >
              <DropIcon size={14} /> {isPcSide ? "Send to phone" : "Send to PC"}
            </button>
            {phoneDrag && <DropFrame rx={99} />}
            {phoneDrag && <span className="drop-hint-phone" aria-hidden>Release to send to phone 📲</span>}
          </span>
          <div className="picker-group">
            <ProviderPicker
              provider={provider}
              model={model}
              onProvider={pickProvider}
              onModel={setModel}
              open={openPicker === "provider"}
              onToggle={() => togglePicker("provider")}
              engines={engines}
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
            title={recording ? `Stop recording (${recSecs}s)` : "Record voice note — attaches audio, hit send after"}
            onClick={toggleRecording}
          >
            {recording ? <span className="rec-dot" /> : <MicIcon size={20} />}
          </button>
          <button className={canSend ? "send-btn ready" : "send-btn"} onClick={submit} aria-label="Send" disabled={!canSend}><ArrowUpIcon size={20} /></button>
        </div>
      </div>
      {(thinking || turnMs !== null) && (
        <div className="composer-status">
          <StatusLine thinking={thinking} turnMs={turnMs} linked={phoneLinked} />
        </div>
      )}
    </Card>
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

// Settings state — sound + volume, provider, active pills, auto-close,
// hover-open + dwell (Atoll: openNotchOnHover + minimumHoverDuration),
// hiddenViews (Atoll: enableXFeature gates tabs — off tabs never render).
export interface SettingsState {
  soundOn: boolean;
  volume: number;
  provider: string;
  activePills: string[];
  autoClose: number;
  autoSave: boolean;
  hoverOpen: boolean;
  hoverDelay: number;
  hiddenViews: IslandView[];
}

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
  onPaired,
  onApprove,
  onUnpair,
}: {
  linked: boolean;
  pending: LinkRequest[];
  onPaired: (endpoint: string, key: string) => void;
  onApprove: (token: string) => void;
  onUnpair: () => void;
}) {
  const [knocking, setKnocking] = useState(false);
  const [msg, setMsg] = useState("");
  // Broken-QR fallback: if the png doesn't decode the <img> would show raw alt
  // text ("Scan to get the app"). Swap it for the plain LAN URL instead.
  const [qrBroken, setQrBroken] = useState(false);
  const origin = window.location.origin;
  // scan-to-get-the-app QR (plain LAN URL — any camera app opens it).
  const [dlQr, setDlQr] = useState<{ png: string; url: string } | null>(null);
  useEffect(() => {
    fetch(`${origin}/relay/dl-qr`)
      .then((r) => r.json())
      .then((j) => {
        if (j.png_b64) setDlQr({ png: j.png_b64, url: j.url });
      })
      .catch(() => {});
  }, [origin]);
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
  // Grouped menu card (pin-board settings pattern): one header row with a
  // status badge, then one row per device/action with hairline dividers.
  // Rows, not button stacks — the old stack read as five separate CTAs.
  if (linked) {
    return (
      <div className="menu-card" aria-label="Phone link">
        <div className="menu-row menu-head">
          <PhoneIcon size={16} />
          <b>Phone link</b>
          <em className="badge on">Linked</em>
        </div>
        <div className="menu-row">
          <CheckIcon size={14} />
          <span>This phone follows the island</span>
          <button className="menu-act" onClick={onUnpair}>Unpair</button>
        </div>
      </div>
    );
  }
  return (
    <div className="menu-card" aria-label="Phone link">
      <div className="menu-row menu-head">
        <PhoneIcon size={16} />
        <b>Phone link</b>
        <em className="badge">Off</em>
      </div>
      {isPcSide ? (
        <>
          {dlQr && (
            <div className="menu-row col">
              <div className="menu-line">
                <DropIcon size={14} />
                <span>Scan to get the app</span>
              </div>
              {!qrBroken ? (
                <img
                  className="menu-qr"
                  src={`data:image/png;base64,${dlQr.png}`}
                  alt="Scan to get the app"
                  title={dlQr.url}
                  onError={() => setQrBroken(true)}
                />
              ) : (
                <span className="card-detail">open {dlQr.url} on the phone</span>
              )}
            </div>
          )}
          {pending.map((p) => (
            <div className="menu-row" key={p.token}>
              <PhoneIcon size={16} />
              <span>{p.label} wants to link</span>
              <button className="menu-act primary" onClick={() => onApprove(p.token)}>Allow</button>
            </div>
          ))}
        </>
      ) : (
        <button className="menu-row action" onClick={() => void knock()} disabled={knocking}>
          <PhoneIcon size={16} />
          <span>{knocking ? "Waiting for PC…" : "Link this phone"}</span>
          <span aria-hidden>›</span>
        </button>
      )}
      {!!msg && <div className="menu-note">{msg}</div>}
    </div>
  );
}
// Shelf (Atoll tray tab): staged files waiting to attach or beam. Session
// only — object URLs die on reload, so staged files do too. Rows, not a
// grid: attach / send-to-phone / remove per file.
export interface ShelfItem {
  file: File;
  url: string;
}

export function ShelfView({
  items,
  onStage,
  onAttach,
  onSendToPhone,
  onRemove,
}: {
  items: ShelfItem[];
  onStage: (files: File[]) => void;
  onAttach: (file: File) => void;
  onSendToPhone: (file: File) => void;
  onRemove: (url: string) => void;
}) {
  const pickRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="card shelf"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        // Stop here: the App root would otherwise file these into the
        // composer. Dropped on the shelf = staged, not attached.
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) onStage(files);
      }}
    >
      <div className="btn-row">
        <PillButton onClick={() => pickRef.current?.click()}>+ Stage files</PillButton>
        <input
          ref={pickRef}
          type="file"
          multiple
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files?.length) onStage(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>
      {!items.length ? (
        <div className="card-detail">
          Shelf is empty — stage error screenshots, logs, docs, or anything
          you&apos;ll attach or beam in a bit. Drop files here or stage them.
          Session only, clears on reload.
        </div>
      ) : (
        <div className="try-col">
          {items.map((it) => (
            <div key={it.url} className="shelf-row">
              {it.file.type.startsWith("image/") ? (
                <img src={it.url} alt="" className="shelf-thumb" />
              ) : (
                <i className="chip-dot" />
              )}
              <span className="shelf-name">
                <b className="kind-tag">{kindIcon(classifyAttachment(it.file.name, it.file.type))}</b>
                {it.file.name} · {formatSize(it.file.size)}
              </span>
              <button className="menu-act" title="Attach to composer" onClick={() => onAttach(it.file)}>
                Attach
              </button>
              <button className="menu-act" title="Send to phone" onClick={() => onSendToPhone(it.file)}>
                <DropIcon size={14} />
              </button>
              <button
                className="chip-x"
                aria-label={`Remove ${it.file.name}`}
                onClick={() => onRemove(it.url)}
              >
                <XIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type SettingsPage = "general" | "phone";

// Equalizer bars (Vorssaint NotchEqualizerBars, CSS edition): synthetic
// stepped motion while playing, frozen frame when paused. No audio tap.
export function EqBars({ playing }: { playing: boolean }) {
  return (
    <span className={playing ? "eq-bars" : "eq-bars paused"} aria-hidden>
      <i /><i /><i /><i />
    </span>
  );
}

export function SettingsView({
  settings,
  onChange,
  pair,
  extra,
  page = "general",
  onPage,
}: {
  settings: SettingsState;
  onChange: (s: SettingsState) => void;
  pair?: React.ReactNode;
  extra?: React.ReactNode;
  page?: SettingsPage;
  onPage?: (p: SettingsPage) => void;
}) {
  const tab = page;
  const set = (patch: Partial<SettingsState>) => onChange({ ...settings, ...patch });
  // Only the prefs worth touching: provider default, notifications,
  // auto-save. The rest (auto-close, hover, hidden tabs/pills) rides its
  // default from SettingsState — fewer knobs, nothing downstream breaks.
  const PROVIDERS = ENGINES.map((e) => e.id);
  const cycleProvider = () =>
    set({ provider: PROVIDERS[(PROVIDERS.indexOf(settings.provider) + 1) % PROVIDERS.length] });
  // Master-detail: nav lives on the left, page on the right — one tap
  // per hop, no dropdown round-trips. The avatar menu still deep-links
  // (same page state), the sidebar is the always-visible switcher.
  const NAV: Array<{ id: SettingsPage; label: string }> = [
    { id: "general", label: "General" },
    { id: "phone", label: "Phone link" },
  ];
  return (
    <div className="card settings">
      <div className="set-layout">
        <div className="menu-card set-nav" role="tablist" aria-label="Settings pages">
          {NAV.map((n) => (
            <button
              key={n.id}
              role="tab"
              aria-selected={tab === n.id}
              className="menu-row action"
              onClick={() => onPage?.(n.id)}
            >
              <span>{n.label}</span>
              {tab === n.id && <CheckIcon size={14} />}
            </button>
          ))}
        </div>
        <div className="set-page">
        {tab === "general" && (
        <>
        <div id="island-account">{extra}</div>
        <div className="set-head">Preferences</div>
      <div className="menu-card" aria-label="Preferences">
        <button className="menu-row action" onClick={cycleProvider} aria-label="Chat provider">
          <span>Chat provider</span>
          <em className="badge on">{settings.provider}</em>
        </button>
        <div className="menu-row">
          <span>Notification sounds</span>
          <button
            className={settings.soundOn ? "switch on" : "switch"}
            onClick={() => set({ soundOn: !settings.soundOn })}
            aria-label="Notification sounds"
          >
            <i />
          </button>
        </div>
        <div className="menu-row">
          <span>Auto-save incoming drops</span>
          <button
            className={settings.autoSave ? "switch on" : "switch"}
            onClick={() => set({ autoSave: !settings.autoSave })}
            aria-label="Auto-save incoming drops"
          >
            <i />
          </button>
        </div>
      </div>
        </>
        )}
        {tab === "phone" && pair}
        </div>
      </div>
    </div>
  );
}
