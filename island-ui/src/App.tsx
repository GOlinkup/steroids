import { useCallback, useEffect, useRef, useState } from "react";
import Island from "./components/Island";
import type { MascotHandle } from "./components/Mascot";
import { IslandFSM, type IslandState } from "./fsm";
import {
  HARNESS_PILLS, ROUTE_SAMPLES, classifyAttachment, sessionTitle, sessionHandoff,
  tombstones, addTombstone,
  type AgentSession, type Approval, type Attachment, type ChatMessage, type ChatSession, type ExploreFeed, type FeedEvent, type IslandView, type Pill, type Question, type SkillHit,
} from "./store";
import type { Shot } from "./components/LensView";
import { PairPanel, ShelfView, isPcSide, type LinkRequest, type SettingsState, type ShelfItem } from "./components/Cards";
import { AccountPanel } from "./components/Account";
import type { SettingsPage } from "./components/Cards";
import type { CloudRow, DisplayName } from "./sync";
// ponytail: supabase rides a lazy chunk — the ONLY heavy dep left in the
// main bundle. Every cloud call below goes through loadSync(), so boot
// stays lean and the chunk loads on first login/sync tap, never at startup.
const loadSync = () => import("./sync");
import { Sound, setMuted, setPack, setVolume } from "./sound";
import { RelayClient } from "./relay";
import { OutboxStore } from "./outbox";
import "./index.css";

let msgId = 1;
let sessionId = 1;

// History survives reloads: archived chats live in localStorage (blob URLs
// stripped — bytes don't survive a restart, the transcript does).
const SESS_KEY = "island.sessions.v1";
function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESS_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const ok = arr.filter(
      (s): s is ChatSession =>
        typeof s === "object" && s !== null &&
        typeof (s as ChatSession).id === "number" &&
        Array.isArray((s as ChatSession).messages),
    ).slice(0, 20);
    for (const s of ok) if (s.id >= sessionId) sessionId = s.id + 1;
    return ok;
  } catch {
    return [];
  }
}

// Live draft survives reloads too (same blob-URL rule as the archive):
// the active transcript + its bridge session come back, online or off.
const LIVE_KEY = "island.draft.v1";
interface LiveDraft { messages: ChatMessage[]; session: string | null; prov: string | null }
function loadDraft(): LiveDraft | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    if (!raw) return null;
    const d: unknown = JSON.parse(raw);
    if (typeof d !== "object" || d === null) return null;
    const rec = d as Partial<LiveDraft>;
    if (!Array.isArray(rec.messages)) return null;
    const msgs = (rec.messages as ChatMessage[]).filter(
      (m) => typeof m === "object" && m !== null &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    );
    for (const m of msgs) if (m.id >= msgId) msgId = m.id + 1;
    // nothing worth resuming (no user turn, no session) reads as no draft.
    if (!msgs.some((m) => m.role === "user") && msgs.length <= 1 && !rec.session) return null;
    return {
      messages: msgs,
      session: typeof rec.session === "string" ? rec.session : null,
      prov: typeof rec.prov === "string" ? rec.prov : null,
    };
  } catch {
    return null;
  }
}



const BRIDGE =
  new URLSearchParams(window.location.search).get("bridge") ||
  window.location.origin;

// installed-app mode (?app=1): the island itself, not the QA preview
// harness — no wordmark, no dev buttons, no event log. Starts flexed.
const APP_MODE =
  new URLSearchParams(window.location.search).get("app") === "1";

// Session handoff — switching providers forks a fresh session (ids are
// provider-scoped), so the new agent would start cold mid-loop. This packs
// the old loop's tail (last turns, newest last, ≤1000 chars) as context the
// new session continues from. Old session stays in history, still resumable.
function buildHandoff(ms: ChatMessage[], from: string, sid: string): string {
  const tail = ms.filter((m) => m.content.trim()).slice(-6);
  if (!tail.length) return "";
  const lines = tail.map((m) => `${m.role === "user" ? "user" : "agent"}: ${m.content.slice(0, 350)}`);
  let body = lines.join("\n");
  if (body.length > 1000) body = `…${body.slice(-1000)}`;
  return `[session handoff — the ${from} session ${sid.slice(0, 8)}… was working this loop. Continue it seamlessly, don't restart:\n${body}\n— handoff ends; the user's new instruction follows.]`;
}

export default function App() {
  const [fsmState, setFsmState] = useState<IslandState>("hidden");
  const [view, setView] = useState<IslandView>("chat");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("general");
  const [hint, setHint] = useState(ROUTE_SAMPLES[0]);
  // Command Echo (glance): transient "Copied — …" preview from the shell.
  const [echo, setEcho] = useState<string | null>(null);
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setPills] = useState<Pill[]>(HARNESS_PILLS);
  const [initialDraft] = useState(loadDraft);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialDraft?.messages ?? []);
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [bridgeOn, setBridgeOn] = useState(false);
  const [appVer, setAppVer] = useState("v0.1.1"); // fallback until /version answers
  const [liveTurn, setLiveTurn] = useState<{ activity: string; partial: string } | null>(null);
  const [turnEngine, setTurnEngine] = useState("");
  // Thought-for-Ns receipt + turn stop: t0 stamps elapsed, liveTurnCtl
  // holds the running turn (server id + poll abort) for the stop morph.
  const [lastThought, setLastThought] = useState<{ secs: number; label: string } | null>(null);
  const turnT0 = useRef(0);
  const liveTurnCtl = useRef<{ id: string; abort: () => void } | null>(null);
  const [caps, setCaps] = useState({ opencode: true, claude: true });
  // One-click agent install: POST /install, then poll /health until the
  // CLI appears (detection is per-call, no bridge restart). 3min cap,
  // then the card falls back to the manual command.
  const [installState, setInstallState] = useState<"idle" | "working" | "error">("idle");
  const handleInstall = () => {
    setInstallState("working");
    void fetch(`${BRIDGE}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "opencode" }),
    }).catch(() => setInstallState("error"));
    const t0 = Date.now();
    const timer = setInterval(() => {
      fetch(`${BRIDGE}/health`)
        .then((r) => r.json())
        .then((j) => {
          const c = { opencode: !!j.opencode, claude: !!j.claude };
          setCaps(c);
          if (c.opencode || c.claude) {
            clearInterval(timer);
            setInstallState("idle");
            say("agent installed ✓");
          } else if (Date.now() - t0 > 180000) {
            clearInterval(timer);
            setInstallState("error");
          }
        })
        .catch(() => {
          if (Date.now() - t0 > 180000) {
            clearInterval(timer);
            setInstallState("error");
          }
        });
    }, 2000);
  };
  const [ocSession, setOcSession] = useState<string | null>(() => initialDraft?.session ?? null);
  // driving a mate's own CLI: which session the composer talks to (null =
  // nicki's live draft). The draft is stashed on the way in and restored
  // on the way back, so each of the 5 keeps its own turns.
  const [drivingSid, setDrivingSid] = useState<string | null>(null);
  const drivingRef = useRef<string | null>(null);
  drivingRef.current = drivingSid;
  const stashRef = useRef<{ messages: ChatMessage[]; sid: string | null } | null>(null);
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);
  const [exploreFeed, setExploreFeed] = useState<ExploreFeed | null>(null);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [zoomShot] = useState<string | null>(() => new URLSearchParams(window.location.search).get("zoom"));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [unread, setUnread] = useState(0);
  const [phoneLinked, setPhoneLinked] = useState(false);
  const relayRef = useRef<RelayClient | null>(null);
  const outboxRef = useRef<OutboxStore | null>(null);
  if (!outboxRef.current) outboxRef.current = new OutboxStore();
  if (!relayRef.current) {
    relayRef.current = new RelayClient({
      urlOf: () => {
        const ep = localStorage.getItem("relay_endpoint") ?? BRIDGE;
        return ep.replace(/^http/, "ws") + "/relay/ws";
      },
    });
  }
  const attachId = useRef(1);
  const fileHandles = useRef(new Map<number, File>());
  interface Incoming {
    name: string; size: number; kind: Attachment["kind"];
    session: string | null; n: number;
    parts: Uint8Array<ArrayBuffer>[]; got: number; ts: number;
  }
  const incomingRef = useRef(new Map<string, Incoming>());
  // Settings persist: toggles/provider/pills survive reload. Unknown keys are
  // ignored so a stale cache can never break a newer SettingsState shape.
  const SETTINGS_KEY = "island_settings";
  const [settings, setSettingsState] = useState<SettingsState>(() => {
    const fresh: SettingsState = {
      soundOn: true,
      volume: 0.5,
      provider: "opencode",
      activePills: ["steroids", "opencode", "claude"],
      autoClose: 15,
      autoSave: true,
      hoverOpen: true,
      hoverDelay: 0.3,
      hiddenViews: [],
      edgeStrip: true,
      edgeBlur: 32,
      edgeAlways: false,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...fresh, ...(JSON.parse(raw) as Partial<SettingsState>) };
    } catch {
      /* corrupt cache — fresh defaults */
    }
    return fresh;
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Atoll hover rule: hover opens only when hoverOpen is on, after the
  // hoverDelay dwell; click-only mode opens on tap instead (same reveal).
  const ocSessionRef = useRef<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverEntered = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (!settingsRef.current.hoverOpen) return;
    hoverTimer.current = setTimeout(
      () => fsm.mouseEntered(),
      Math.max(0, settingsRef.current.hoverDelay) * 1000,
    );
  };
  const hoverLeft = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    fsm.mouseLeft();
  };
  // Tap toggles: closed notch → pill → open panel → pill. Taps on
  // panel controls/text never collapse (only chrome does); anything
  // else collapses (stage backdrop + window blur below).
  const islandClicked = (e?: React.MouseEvent) => {
    if (fsm.state === "jacked" && !fsm.pinned) {
      const t = e?.target as HTMLElement | undefined;
      if (t && t.closest("button, a, input, textarea, select, [contenteditable], .chat-log, .hist-panel, .avatar-menu, .attach-menu, .effort-sheet, .reply, .bubble")) return;
      fsm.forceFlex();
      say("island closed on tap");
      return;
    }
    if (fsm.state === "hidden") {
      fsm.reveal();
      say("island opened on tap");
    } else if (fsm.state === "flex") {
      fsm.click();
      say("island opened on tap");
    }
  };
  ocSessionRef.current = ocSession;
  // thread mirror: turns finish into the chat that sent them, even when
  // the user moved on mid-turn (same render-mirror idiom as above).
  const activeRef = useRef<number | null>(null);
  activeRef.current = activeSessionId;
  // auto's choice sticks here: continuing a chat reuses its engine.
  const ocProvider = useRef<string | null>(null);
  const [linkReqs, setLinkReqs] = useState<LinkRequest[]>([]);
  const seenKnocks = useRef(new Set<string>());
  const hookRows = useRef<Array<{ key: string; tool?: string; text?: string; session?: string; kind?: string }>>([]);
  // cloud account (same Supabase login as GOlinkup) — history sync only,
  // everything still works logged out.
  const [account, setAccount] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<DisplayName | null>(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  // cloud rows we hold but can't read yet — the history panel says so
  // instead of looking deleted.
  const [skippedSync, setSkippedSync] = useState(0);

  const applySettings = (s: SettingsState) => {
    setSettingsState(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* private mode / quota — settings just won't survive reload */
    }
    setMuted(!s.soundOn);
    setVolume(s.volume);
    fsm.setAutoClose(s.autoClose);
    setPills((p) =>
      HARNESS_PILLS.filter((h) => s.activePills.includes(h.id)).map((h) => {
        const old = p.find((x) => x.id === h.id);
        return old ?? h;
      }),
    );
    say(`settings: sound ${s.soundOn ? "on" : "off"} · ${s.provider} · close ${s.autoClose}s`);
  };

  const handleTab = (v: IslandView) => {
    Sound.pop();
    if (v === "chat") setUnread(0);
    setView(v);
    // Atoll shelf rule: auto-close suppressed while the shelf is open.
    fsm.setPinned(v === "shelf");
    fsm.forceJacked();
  };
  const [log, setLog] = useState<string[]>(["island preview ready — state: hidden"]);

  const fsmRef = useRef<IslandFSM | null>(null);
  const mascotRef = useRef<MascotHandle>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const sampleIdx = useRef(0);
  const hintTimer = useRef(0);
  if (!fsmRef.current) {
    const fsm = new IslandFSM();
    fsm.onTransition = (from, to) => {
      setFsmState(to);
      say(`${from} → ${to}`);
    };
    fsmRef.current = fsm;
  }
  const fsm = fsmRef.current;

  function say(m: string) {
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 30));
  }

  useEffect(() => {
    // QA hook: ?view=chat&state=jacked&demo=approval seeds views for screenshots
    const q = new URLSearchParams(window.location.search);
    const v = q.get("view");
    const s = q.get("state");
    if (v === "explore" || v === "approval" || v === "question" || v === "chat" || v === "daily" || v === "lens" || v === "shelf" || v === "settings" || v === "finished" || v === "feed") setView(v);
    if (s === "jacked") fsm.forceJacked();
    else if (s === "flex") fsm.forceFlex();
    else if (s === "hidden") fsm.forceHidden();
    const d = q.get("demo");
    if (d === "approval") {
      setApproval({
        requestId: "qa",
        title: "Teach this close call?",
        detail: "“deploi preview” → vercel-deploy (0.71, below 0.80 bar)",
        options: ["Allow", "Always", "Deny"],
      });
    }
    if (d === "question") {
      setQuestion({
        title: "Which skill should own “preview”?",
        choices: ["vercel-deploy", "demo-serve", "docs-preview", "abstain"],
        multi: false,
      });
    }
    if (d === "attach") {
      setAttachments([
        { id: 9001, name: "chart-accuracy.png", size: 148616, kind: "image", url: "shots/chart-accuracy.png" },
        { id: 9002, name: "router.py", size: 4210, kind: "code" },
      ]);
    }
    if (d === "chathistory") {
      setMessages((m) => [
        ...m,
        { id: msgId++, role: "user", content: "route my flutter build" },
        { id: msgId++, role: "assistant", content: "Routed → dart-flutter-patterns in 0.4s. No cloud touched." },
      ]);
    }
  }, [fsm]);

  useEffect(() => {
    // Nicki bridge: if it's up, chat goes to real local opencode, else mock.
    let dead = false;
    fetch(`${BRIDGE}/health`)
      .then((r) => r.json())
      .then((j) => {
        if (dead) return;
        setCaps({ opencode: !!j.opencode, claude: !!j.claude });
        // Bridge alive = bridge on, even with zero CLIs — that's exactly
        // when the chat setup card (one-click install) must appear.
        setBridgeOn(true);
        say(j.opencode || j.claude
          ? "nicki bridge live — real opencode chat"
          : "nicki bridge live — no agent installed");
      })
      .catch(() => {});
    fetch(`${BRIDGE}/sessions`)
      .then((r) => r.json())
      .then((j) => {
        if (!dead && Array.isArray(j.sessions)) setAgentSessions(j.sessions);
      })
      .catch(() => {});
    fetch(`${BRIDGE}/version`)
      .then((r) => r.json())
      .then((j) => {
        if (!dead && typeof j?.version === "string" && j.version !== "?") setAppVer("v" + j.version);
      })
      .catch(() => {});
    // sound-pack mode: first installed openpeon pack feeds Sound.playFile;
    // empty map (no packs) keeps synth. One fetch per boot, silent either way.
    fetch(`${BRIDGE}/soundpack/map`)
      .then((r) => r.json())
      .then((j) => {
        if (dead || !j || typeof j.map !== "object") return;
        const pack: Record<string, string[]> = {};
        for (const [ev, url] of Object.entries(j.map)) {
          if (typeof url === "string" && url) pack[ev] = [`${BRIDGE}${url}`];
        }
        if (Object.keys(pack).length) setPack(pack);
      })
      .catch(() => {});
    // profile photo for the avatar button (GOlinkup rule: photo when live,
    // initial the moment it dies — the button itself owns the fallback).
    fetch(`${BRIDGE}/profile`)
      .then((r) => r.json())
      .then((j) => {
        if (!dead && typeof j?.profile?.avatar_url === "string") setAvatarUrl(j.profile.avatar_url);
      })
      .catch(() => {});
    const pullSessions = () => {
      fetch(`${BRIDGE}/sessions`)
        .then((r) => r.json())
        .then((j) => {
          if (!dead && Array.isArray(j.sessions)) setAgentSessions(j.sessions);
        })
        .catch(() => {});
    };
    const sessionsTimer = setInterval(pullSessions, 15000);
    fetch(`${BRIDGE}/trending`)
      .then((r) => r.json())
      .then((j) => {
        if (!dead && Array.isArray(j.trending)) {
          setExploreFeed({ trending: j.trending, recent: j.recent ?? [] });
        }
      })
      .catch(() => {});
    // live lens feed: real shots or honest empty (never stale demo).
    const pullShots = () => {
      fetch(`${BRIDGE}/shots`)
        .then((r) => r.json())
        .then((j) => {
          if (dead || !Array.isArray(j.shots)) return;
          setShots(
            j.shots.map((s: { name: string; label: string; time: string; url: string }) => ({
              name: s.name,
              src: `${BRIDGE}${s.url}`,
              label: s.label,
              time: s.time,
            })),
          );
        })
        .catch(() => {});
    };
    pullShots();
    const shotsTimer = setInterval(pullShots, 3000);
    // crew feed: live opencode/claude ledger for nicki + the team.
    const pullFeed = () => {
      fetch(`${BRIDGE}/events?n=60`)
        .then((r) => r.json())
        .then((j) => {
          if (!dead && Array.isArray(j.events)) setFeedEvents(j.events);
        })
        .catch(() => {});
    };
    pullFeed();
    const feedTimer = setInterval(pullFeed, 5000);
    return () => { dead = true; clearInterval(shotsTimer); clearInterval(sessionsTimer); clearInterval(feedTimer); };
  }, []);

  const searchSkills = useCallback(async (q: string): Promise<SkillHit[]> => {
    try {
      const r = await fetch(`${BRIDGE}/skills?q=${encodeURIComponent(q)}&n=8`);
      const j = await r.json();
      return Array.isArray(j.hits) ? j.hits : [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    scheduleGreet();
    if (initialDraft) {
      if (initialDraft.prov) ocProvider.current = initialDraft.prov;
      say(initialDraft.session ? "draft restored — same session continues" : "draft restored");
    }
    if (APP_MODE) {
      const q = new URLSearchParams(window.location.search);
      // Electron island: transparent window, only the pill paints (Glance
      // notch idiom). ?bg=black is legacy brave --app fallback (opaque).
      const opaque = q.get("bg") === "black";
      const bg = opaque ? "#000" : "transparent";
      document.documentElement.style.background = bg;
      document.body.style.background = bg;
      // distinct title so the window manager can pin the app window
      // (top-center, frameless) without touching browser tabs.
      document.title = "Steroids Island";
      // explicit ?state= wins (QA); otherwise the installed app starts flexed.
      if (!q.get("state")) fsm.forceFlex();
      // coucou status first (left work card + right 2x2 crew grid), chat
      // one tap away. Explicit ?view= wins (QA).
      if (!q.get("view")) setView("daily");
    }
    return () => stopGreet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PC strip glow frame: measured box driving the SVG step-outline.
  const [frame, setFrame] = useState<{ w: number; h: number; n: number } | null>(null);
  // Electron shell wiring (no-op in plain browsers): the window
  // shrink-wraps the pill after every state change, and losing focus
  // drops an open panel back to the notch — tap-outside closes.
  // The PC strip measures even without a shell (glow frame rendering).
  const pcShell = APP_MODE && isPcSide;
  useEffect(() => {
    if (!pcShell) return;
    // Screen-based open-panel cap (not dvh): dvh reads the shrink-wrapped
    // window itself, deadlocking content height at ~0px (black empty bar).
    document.documentElement.style.setProperty(
      "--jacked-cap", `${Math.max(300, window.screen.height - 150)}px`);
    // Page never scrolls in the island window: streamed text outgrowing the
    // window for a frame flashed a page scrollbar (viewport gutter shifts
    // layout -> resize loop -> animation jank). Only inner views
    // (chat-log etc.) scroll.
    document.body.style.overflow = "hidden";
    const shell = (window as unknown as {
      island?: { resize?: (w: number, h: number) => void; onBlur?: (fn: () => void) => void; onEcho?: (fn: (text: string) => void) => void };
    }).island;
    shell?.onBlur?.(() => {
      if (fsm.state === "jacked" && !fsm.pinned) {
        fsm.forceFlex();
        say("tap-outside → notch");
      }
    });
    // Command Echo: system copy → pill swells with the preview + mascot
    // yay, melts back fast (1.4s — it borrows nav space, never lingers).
    // ResizeObserver grows the window to fit.
    // (Wayland gates the system clipboard to the focused app, so copies
    // made inside the island echo via the copy event below; the shell poll
    // in main.js covers copies made while the island is focused.)
    const showEcho = (t: string) => {
      const s = t.trim().replace(/\s+/g, " ").slice(0, 48);
      if (!s) return;
      setEcho(s);
      mascotRef.current?.celebrate();
      if (echoTimer.current) clearTimeout(echoTimer.current);
      echoTimer.current = window.setTimeout(() => setEcho(null), 1400);
    };
    shell?.onEcho?.(showEcho);
    const onCopy = () => {
      try {
        showEcho(window.getSelection()?.toString() ?? "");
      } catch { /* selection unreadable */ }
    };
    document.addEventListener("copy", onCopy);
    // paste mirrors copy: whatever lands in the island echoes the same way.
    // Pastes made outside the island are unobservable (paste never touches
    // the clipboard, the OS tells us nothing) — copies everywhere are
    // covered by the main-process poll instead.
    const onPaste = (e: Event) => {
      try {
        showEcho((e as ClipboardEvent).clipboardData?.getData("text") ?? "");
      } catch { /* nothing pasted */ }
    };
    document.addEventListener("paste", onPaste);
    // In-app programmatic copies (message copy button, pairing code) fire
    // no DOM copy event — they announce themselves with the copy text.
    const onEchoEvent = (e: Event) => {
      try {
        showEcho((e as CustomEvent<string>).detail ?? "");
      } catch { /* bad detail */ }
    };
    document.addEventListener("steroids:copied", onEchoEvent);
    let last = "";
    // PC (Glance notch): the window shrink-wraps the pill — small and
    // centered, never window.screen.width (the full-width strip read as
    // a giant bar in the middle of the screen on 4k). Phone: widths
    // are CSS-fixed per state — pin them (measuring 94vw while the window
    // is still pill-sized would feedback-loop). Height is measured.
    const W_BY_STATE: Record<string, number> = { hidden: 184, flex: 248, pump: 248, jacked: 960 };
    const report = () => {
      const el = islandRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // island + stage chrome (gutters, 10px top pad, breathing room).
      // hidden = small centered tab (never a full-width fill); strip and
      // panel states span the screen.
      const hiddenTab = isPcSide && fsm.state === "hidden";
      // Fixed footprints on PC: the open card keeps ONE size across tabs
      // (views scroll inside) so the window never leaps; the pill
      // shrink-wraps its fixed CSS width. Never window.screen.width.
      // Closed states fit content with a floor (never smaller than the
      // hidden tab). Cap reads window.screen, NOT window.innerWidth:
      // innerWidth tracks the current window and ratchets it down to
      // minimal on every report.
      const w = !isPcSide
        ? (W_BY_STATE[fsm.state] ?? 300) + 56
        : hiddenTab ? 232
        : fsm.state === "jacked" ? Math.min(1020, window.screen.width - 16)
        : Math.min(1020, window.screen.width - 16, Math.max(232, Math.ceil(r.width) + 36));
      const h = isPcSide && fsm.state === "jacked"
        ? Math.min(window.screen.height - 120, Math.ceil(r.top + r.height) + 16)
        : Math.ceil(r.top + r.height) + 16;
      // step-glow geometry mirrors the CSS clip (--notch:min(520px,44%)).
      const iw = Math.ceil(r.width);
      const ih = Math.ceil(r.height);
      const n = Math.round(Math.min(520, r.width * 0.44));
      const key = `${fsm.state}x${w}x${h}x${iw}x${ih}x${n}`;
      if (key !== last) {
        last = key;
        shell?.resize?.(w, h);
        setFrame(hiddenTab ? null : { w: iw, h: ih, n });
      }
    };
    report();
    // native window follows the settled size, never animation frames:
    // resizing per frame while the spring runs is what leaps on 4k.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const queueReport = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(report, 120);
    };
    const ro = new ResizeObserver(queueReport);
    if (islandRef.current) ro.observe(islandRef.current);
    return () => {
      ro.disconnect();
      if (pending) clearTimeout(pending);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("steroids:copied", onEchoEvent);
      if (echoTimer.current) clearTimeout(echoTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsmState]);

  // Archive persists: every sessions change is stamped to localStorage so
  // the history panel survives restarts (attachment blob URLs excluded).
  useEffect(() => {
    try {
      localStorage.setItem(SESS_KEY, JSON.stringify(sessions, (k, v) => (k === "url" ? undefined : v)));
    } catch { /* quota/private mode: memory only */ }
  }, [sessions]);

  // Cloud mirror: logged in → sessions also land in your private
  // steroid_chats rows (debounced). Login on the phone pulls them there.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!account) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void loadSync()
        .then((s) => s.pushChats(sessions))
        .then((n) => setSyncMsg(n > 0 ? `Last synced ${n} chat${n === 1 ? "" : "s"}` : "Nothing to sync yet"))
        .catch((e) => setSyncMsg(e instanceof Error ? e.message : e));
    }, 2500);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, account]);

  // Restore a previous login silently (supabase persists its own session).
  // Avatar order = Flutter (account_drawer): profiles table, then session
  // metadata, then the initial disc. Mirror photo (bridge effect) wins over
  // both when a social account is linked.
  useEffect(() => {
    void loadSync()
      .then((s) => s.accountEmail())
      .then((e) => loadSync().then((s) => ({ s, e })))
      .then(({ s, e }) => {
        if (e) {
          setAccount(e);
          say(`signed in as ${e}`);
          // Pull before any key decision (OAuth returns here too — this
          // path never pulled, so Google logins stranded history).
          return afterLoginPull(s)
            .then(() => s.profileIdentity())
            .then((id) => ({ s, id }));
        }
        return s.profileIdentity().then((id) => ({ s, id }));
      })
      .then(({ s, id }) => {
        if (id.avatar) setAvatarUrl((prev) => prev ?? id.avatar);
        if (id.avatar) return null;
        return s.sessionAvatar().then((m) => {
          if (m) setAvatarUrl((prev) => prev ?? m);
          return null;
        });
      })
      .then(() => loadSync().then((s) => s.displayName()))
      .then((d) => {
        if (d) {
          setDisplayName(d);
          say(`welcome back, ${d.first}`);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Post-login pull: cloud first, key decision last. Minting before the
  // pull orphans the real key on second devices — sealed rows pile up as
  // "skipped" with the paste box hidden, and history looks deleted.
  // Never rejects (offline keeps local history); key state falls back to
  // whatever this device already holds.
  const afterLoginPull = (s: Awaited<ReturnType<typeof loadSync>>) =>
    s.pullChats().then(
      ({ rows, skipped }) => {
        mergeCloud(rows, skipped);
        const has = !!s.getSyncKey();
        if (s.shouldMintSyncKey(has, skipped)) {
          s.ensureSyncKey();
          setHasKey(true);
        } else {
          // skipped > 0 with a stored key = wrong key: reveal the paste
          // box so the real code can replace it.
          setHasKey(has && skipped === 0);
        }
      },
      () => setHasKey(!!s.getSyncKey()),
    );

  const mergeCloud = (rows: CloudRow[], skipped = 0) => {
    // Deleted chats stay deleted: tombstoned ids never merge back, even
    // when the row still exists server-side (older device re-pushed it).
    const dead = new Set(tombstones());
    setSkippedSync(skipped);
    const live = rows.filter((r) => !dead.has(r.chat_id));
    const locked = skipped > 0 ? ` · ${skipped} need the sync code` : "";
    if (!live.length) {
      setSyncMsg(skipped > 0 ? `Nothing readable yet — ${skipped} need the sync code` : "Nothing to sync yet");
      return;
    }
    setSessions((cur) => {
      const out = [...cur];
      for (const r of live) {
        const msgs = Array.isArray(r.messages) ? r.messages : [];
        const at = Date.parse(r.updated_at) || Date.now();
        const hit = out.find(
          (x) => x.cloudId === r.chat_id || (!x.cloudId && x.title === r.title),
        );
        if (hit) {
          if (at > hit.updatedAt) {
            hit.messages = msgs;
            hit.updatedAt = at;
            hit.title = r.title;
            hit.cloudId = r.chat_id;
            if (r.handoff) hit.handoff = r.handoff;
          }
        } else {
          out.push({
            id: sessionId++,
            title: r.title || "Cloud chat",
            messages: msgs,
            updatedAt: at,
            cloudId: r.chat_id,
            ...(r.handoff ? { handoff: r.handoff } : {}),
          });
        }
      }
      return out.slice(0, 20);
    });
    setSyncMsg(`Last synced ${live.length} chat${live.length === 1 ? "" : "s"}${locked}`);
  };

  const handleGoogle = () => {
    setSyncBusy(true);
    setSyncMsg("");
    // OAuth leaves to Google and returns here — the restore effect picks up
    // the session. Needs this origin in the Supabase dashboard URL config.
    void loadSync()
      .then((s) => s.signInGoogle())
      .catch((e) => {
        setSyncMsg(e instanceof Error ? e.message : String(e));
        setSyncBusy(false);
      });
  };
  const handleSendCode = (email: string) => {
    setSyncBusy(true);
    setSyncMsg("");
    void loadSync()
      .then((s) => s.sendCode(email))
      .then(() => setSyncMsg(`code sent to ${email} — check inbox`))
      .catch((e) => setSyncMsg(e instanceof Error ? e.message : String(e)))
      .finally(() => setSyncBusy(false));
  };
  const handleVerify = (email: string, code: string) => {
    setSyncBusy(true);
    setSyncMsg("");
    void loadSync()
      .then((s) => s.verifyCode(email, code))
      .then((e) => {
        setAccount(e);
        say(`signed in as ${e}`);
        return loadSync();
      })
      .then((s) =>
        afterLoginPull(s)
          .then(() => s.displayName())
          .then((d) => ({ s, d })),
      )
      .then(({ d }) => {
        if (d) {
          setDisplayName(d);
          say(`welcome back, ${d.first}`);
        }
      })
      .catch((e) => setSyncMsg(e instanceof Error ? e.message : String(e)))
      .finally(() => setSyncBusy(false));
  };
  const handleSaveName = (first: string, last: string) => {
    setSyncBusy(true);
    setSyncMsg("");
    void loadSync()
      .then((s) => s.saveDisplayName(first, last))
      .then((d) => {
        setDisplayName(d);
        setSyncMsg(`welcome, ${d.first} ✓`);
      })
      .catch((e) => setSyncMsg(e instanceof Error ? e.message : String(e)))
      .finally(() => setSyncBusy(false));
  };
  const handleSignOut = () => {
    void loadSync()
      .then((s) => s.signOut())
      .finally(() => {
        setAccount(null);
        setAvatarUrl(null);
        setDisplayName(null);
        setSyncMsg("");
        say("signed out");
      });
  };
  // Sync key: minted on login, pasted on the second device. The card
  // owns the UI (show/enter); here owns the state. Key stays on-device
  // through sign-out — it's the device's secret, not the session's.
  const [hasKey, setHasKey] = useState(false);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const handleRevealCode = () => {
    void loadSync().then((s) => setShownCode(s.ensureSyncKey()));
  };
  const handleSaveCode = (code: string) => {
    setSyncBusy(true);
    setSyncMsg("");
    void loadSync()
      .then((s) => {
        s.setSyncKey(code);
        setHasKey(true);
        setShownCode(null);
        return s.pullChats();
      })
      .then(({ rows, skipped }) => mergeCloud(rows, skipped))
      .catch((e) => setSyncMsg(e instanceof Error ? e.message : String(e)))
      .finally(() => setSyncBusy(false));
  };

  // Phone↔PC pipe: same bot session both ends. Phone frames land in this
  // chat; drops ride relay live or outbox offline (never lost).
  useEffect(() => {
    const relay = relayRef.current!;
    const outbox = outboxRef.current!;
    const offStatus = relay.onStatus((s) => {
      setPhoneLinked(s === "connected");
      if (s === "connected") {
        say("phone pipe: this PC joined its hub");
        void outbox.flush(async (frame) => {
          // big inline files ride the socket only (POST caps at 64KB).
          if (JSON.stringify(frame).length > 48 * 1024) {
            return relay.send(String(frame.type ?? "file"), frame);
          }
          const res = await fetch(`${BRIDGE}/relay/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: localStorage.getItem("relay_key") ?? "", frame }),
          }).catch(() => null);
          return !!res?.ok || relay.send(String(frame.type ?? "file"), frame);
        });
      }
    });
    const offMsg = relay.onMessage((f) => {
      // Phone→PC: camera snap or file lands in the SAME chat + same session,
      // so the bot continues what you were doing on the phone.
      if (f.type === "chat" && typeof f.text === "string") {
        // shared transcript, display-only: the bot turn already ran on the
        // sending side, so this never triggers a second turn here.
        if (typeof f.session === "string" && f.session) setOcSession(f.session);
        const role = f.role === "assistant" ? "assistant" : "user";
        setMessages((m) => [...m, { id: msgId++, role, content: f.text as string }]);
        setView("chat");
        say("shared line from the other screen");
      } else if (f.type === "file-start" && typeof f.id === "string" && typeof f.n === "number") {
        // big file incoming: collect chunks, assemble on file-end. Partials
        // survive across attempts (stable id), so a retry resumes by telling
        // the sender exactly which chunks are missing.
        if (typeof f.session === "string" && f.session) setOcSession(f.session);
        setView("chat");
        const id = f.id as string;
        const n = f.n as number;
        const kept = incomingRef.current.get(id);
        if (kept && kept.n === n) {
          kept.ts = Date.now();
          const have: number[] = [];
          for (let i = 0; i < kept.n; i++) if (kept.parts[i]) have.push(i);
          relayRef.current?.send("file-got", { id, have });
          say(`resuming ${kept.name} — holding ${have.length}/${kept.n} chunks…`);
        } else {
          incomingRef.current.set(id, {
            name: String(f.name ?? "file"), size: Number(f.size ?? 0),
            kind: validKind(f.kind),
            session: typeof f.session === "string" ? (f.session as string) : null,
            n, parts: new Array(n), got: 0, ts: Date.now(),
          });
          say(`receiving ${String(f.name ?? "file")} (${fmtSize(Number(f.size ?? 0))}) in ${n} chunks…`);
          const sweep = () => {
            const inc = incomingRef.current.get(id);
            if (!inc || inc.got >= inc.n) return;
            if (Date.now() - inc.ts > 10 * 60 * 1000) {
              incomingRef.current.delete(id);
              pushBot(`${inc.name} stalled — drop it again to resume where it stopped.`);
            } else {
              setTimeout(sweep, 60 * 1000);
            }
          };
          setTimeout(sweep, 10 * 60 * 1000);
        }
      } else if (f.type === "file-chunk" && typeof f.id === "string" && typeof f.i === "number") {
        const inc = incomingRef.current.get(f.id as string);
        if (inc && typeof f.data === "string" && !inc.parts[f.i as number]) {
          try {
            inc.parts[f.i as number] = b64ToBytes(f.data as string);
            inc.got++;
            inc.ts = Date.now();
            const pc = Math.floor((inc.got / inc.n) * 100);
            if (pc === 25 || pc === 50 || pc === 75) say(`receiving ${inc.name} ${pc}%…`);
          } catch { /* corrupt chunk: file-end reports the gap */ }
        }
      } else if (f.type === "file-end" && typeof f.id === "string") {
        const inc = incomingRef.current.get(f.id as string);
        if (inc) {
          if (typeof inc.session === "string" && inc.session) setOcSession(inc.session);
          setView("chat");
          if (inc.got < inc.n) {
            // keep partials: the next drop of the same file resumes them.
            pushBot(`${inc.name} interrupted (${inc.got}/${inc.n} chunks held) — drop it again to resume.`);
          } else {
            incomingRef.current.delete(f.id as string);
            landFile(inc.name, new Blob(inc.parts, { type: "application/octet-stream" }));
          }
        }
      } else if (f.type === "file" && typeof f.name === "string") {
        if (typeof f.session === "string" && f.session) setOcSession(f.session);
        setView("chat");
        const from = isPcSide ? "Phone" : "PC";
        // small file, bytes inline as a data URL.
        if (typeof f.data === "string" && (f.data as string).startsWith("data:")) {
          void fetch(f.data as string)
            .then((r) => r.blob())
            .then((blob) => landFile(String(f.name), blob))
            .catch(() => {
              pushBot(`${from} dropped ${String(f.name)} — ask me about it, same session continues here.`);
            });
        } else {
          pushBot(`${from} dropped ${String(f.name)} (name card — bytes need a live link).`);
          say(`file card ${String(f.name)}`);
        }
      }
    });
    // zero-tap start: this PC (or USB-forwarded phone) always resolves a
    // fresh hub key — bridge restarts invalidate keys, so never trust a
    // stored one here. LAN phones keep their approved key and reconnect.
    if (isPcSide) {
      fetch(`${BRIDGE}/relay/local-key`)
        .then((r) => r.json())
        .then((j) => {
          if (j.key) {
            relay.pair(BRIDGE, j.key);
            relay.connect();
            say("phone pipe: joining its hub…");
          }
        })
        .catch(() => {});
    } else if (relay.endpoint) {
      relay.connect();
    }
    // knock watch: a linking phone pops up here, one Allow in Settings.
    const pollPending = () => {
      fetch(`${BRIDGE}/relay/pending`)
        .then((r) => r.json())
        .then((j) => {
          const reqs: LinkRequest[] = Array.isArray(j.pending) ? j.pending : [];
          setLinkReqs(reqs);
          for (const q of reqs) {
            // one notice per device: retries refresh the Allow row silently.
            if (!seenKnocks.current.has(q.label)) {
              seenKnocks.current.add(q.label);
              setView("chat");
              pushBot(`📲 ${q.label} wants to link — tap Allow in Settings → Phone link.`);
              say(`link knock from ${q.label}`);
            }
          }
        })
        .catch(() => {});
    };
    pollPending();
    const pendingTimer = setInterval(pollPending, 8000);
    // hook approvals: PermissionRequest rows waiting on the island. First
    // unanswered row becomes the approval card; taps POST /decide.
    const pollHookApprovals = () => {
      fetch(`${BRIDGE}/pending`)
        .then((r) => r.json())
        .then((j) => {
          const rows = Array.isArray(j.pending) ? j.pending : [];
          hookRows.current = rows;
          setApproval((cur) => {
            if (cur || !rows.length) return cur;
            const r0 = rows[0];
            // exact payload + scope on the card (Muse/Dots language): what
            // it wants to do, which tool, which session it belongs to.
            const sid8 = String(r0.session || "").slice(0, 8);
            const scope = [r0.tool ? `tool: ${r0.tool}` : "", sid8 ? `session ${sid8}…` : ""].filter(Boolean).join(" · ");
            return {
              requestId: r0.key,
              title: `Allow ${r0.tool || "this action"}?`,
              detail: [r0.text || `Session ${r0.session} is asking.`, scope].filter(Boolean).join("\n"),
              options: ["Allow", "Always", "Deny"],
            };
          });
          if (rows.length) {
            setView((v) => (v === "chat" ? "approval" : v));
            fsm.forceJacked();
          }
        })
        .catch(() => {});
    };
    pollHookApprovals();
    const hookTimer = setInterval(pollHookApprovals, 5000);
    return () => { offStatus(); offMsg(); clearInterval(pendingTimer); clearInterval(hookTimer); relay.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pupils follow cursor
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onMove = (e: PointerEvent) => {
      if (reduce || !islandRef.current) return;
      const r = islandRef.current.getBoundingClientRect();
      mascotRef.current?.setLook(
        Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 200)),
        Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 200)),
      );
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fsm.forceFlex();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fsm]);

  const nextRoute = () => {
    sampleIdx.current = (sampleIdx.current + 1) % ROUTE_SAMPLES.length;
    const h = ROUTE_SAMPLES[sampleIdx.current];
    setHint(h);
    setPills((p) => p.map((x) => (x.id === "router" ? { ...x, badge: "routed" } : x)));
    // ponytail: let the tap face read for a beat before the wave lands.
    window.setTimeout(() => mascotRef.current?.celebrate(), 900);
    say(`route: ${h}`);
  };

  const handleTap = (taps: number) => {
    fsm.click();
    if (taps < 3) nextRoute();
    say(taps === 3 ? "mascot: dizzy 1300ms" : taps === 2 ? "mascot: annoyed 800ms" : "mascot: squish 140ms");
  };

  const askTeach = () => {
    setApproval({
      requestId: `t${Date.now()}`,
      title: "Teach this close call?",
      detail: "“deploi preview” → vercel-deploy (0.71, below 0.80 bar)",
      options: ["Allow", "Always", "Deny"],
    });
    setView("approval");
    fsm.forceJacked();
    say("approval requested: teach close call");
  };

  const askQuestion = () => {
    setQuestion({
      title: "Which skill should own “preview”?",
      choices: ["vercel-deploy", "demo-serve", "docs-preview", "abstain"],
      multi: false,
    });
    setView("question");
    fsm.forceJacked();
    say("question asked: skill owner");
  };

  const openChat = () => {
    setView("chat");
    fsm.forceJacked();
    say("chat opened");
  };

  const openLens = () => {
    setView("lens");
    fsm.forceJacked();
    say(`lens opened: ${shots.length} shots`);
  };

  const isDirtyChat = (msgs: ChatMessage[]) => msgs.some((m) => m.role === "user");

  const greetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greetOn = useRef(false);
  // handoff note filed by the archiver (newChat) for the greet below.
  const pendingHandoff = useRef<string | null>(null);
  const greetedMount = useRef(false);

  // Continuity greet (Nicki voice, never a fake hello): the just-filed
  // handoff note wins (fresh page after an archive); otherwise, once per
  // mount, the latest archived handoff — a cold open with memory. An
  // empty start stays empty when there is nothing to continue.
  const scheduleGreet = () => {
    if (greetTimer.current) clearTimeout(greetTimer.current);
    greetOn.current = false;
    setThinking(false);
    const filed = pendingHandoff.current;
    pendingHandoff.current = null;
    if (filed) {
      pushBot(`Filed away: ${filed}. Fresh page — what's first?`);
      return;
    }
    if (greetedMount.current || initialDraft) return;
    greetedMount.current = true;
    const last = sessions.find((s) => s.handoff);
    if (last?.handoff) pushBot(`Last time — ${last.handoff}. Continue or new orders?`);
  };

  const stopGreet = () => {
    greetOn.current = false;
    if (greetTimer.current) clearTimeout(greetTimer.current);
  };

  // reset archives: anything beyond the lone greeting is history, even an
  // agent-only exchange (user never typed but turns happened).
  const worthKeeping = (msgs: ChatMessage[]) =>
    isDirtyChat(msgs) || msgs.length > 1;

  // History shows the live chat too — otherwise the dropdown reads
  // "No previous chats" while you're mid-conversation. id 0 is the
  // unsaved live draft (sessionId starts at 1, never collides).
  const LIVE_ID = 0;
  // Live draft persists on every turn: reload resumes the transcript +
  // session instead of wiping it. Cleared the moment a fresh chat starts.
  useEffect(() => {
    try {
      const dirty = messages.some((m) => m.role === "user") || messages.length > 1;
      if (!dirty && !ocSession) {
        localStorage.removeItem(LIVE_KEY);
        return;
      }
      localStorage.setItem(LIVE_KEY, JSON.stringify(
        { messages, session: ocSession, prov: ocProvider.current, at: Date.now() },
        (k, v) => (k === "url" ? undefined : v),
      ));
    } catch { /* quota/private mode: memory only */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, ocSession]);
  const liveWorth = worthKeeping(messages);
  const historySessions: ChatSession[] = liveWorth
    ? activeSessionId === null
      ? [{ id: LIVE_ID, title: sessionTitle(messages), messages, updatedAt: Date.now() }, ...sessions].slice(0, 20)
      : sessions.map((x) =>
          x.id === activeSessionId
            ? { ...x, messages, title: sessionTitle(messages), updatedAt: Date.now() }
            : x,
        )
    : sessions;

  const newChat = () => {
    Sound.pop();
    stopGreet();
    setMessages((cur) => {
      if (worthKeeping(cur)) {
        // archive files its own self-text note (goal → result) for the
        // continuity greet below — the Munder-Difflin habit, scribed local.
        const note = sessionHandoff(cur);
        if (note) pendingHandoff.current = note;
        setSessions((s) => [
          { id: sessionId++, title: sessionTitle(cur), messages: cur, updatedAt: Date.now(), ...(note ? { handoff: note } : {}) },
          ...s,
        ].slice(0, 20));
      }
      return [];
    });
    setActiveSessionId(null);
    setOcSession(null);
    ocProvider.current = null;
    setAttachments([]);
    setThinking(false);
    setUnread(0);
    setView("chat");
    fsm.forceJacked();
    say("new chat started");
    scheduleGreet();
  };
  const resumeSession = (id: number) => {
    if (id === LIVE_ID && activeSessionId === null) return; // already viewing live draft
    Sound.pop();
    stopGreet();
    const target = (id === LIVE_ID ? undefined : sessions.find((s) => s.id === id))
      ?? historySessions.find((s) => s.id === id);
    if (!target) return;
    setMessages((cur) => {
      if (activeSessionId !== id && worthKeeping(cur)) {
        // resume archives too (no greet — the resumed transcript speaks).
        const note = sessionHandoff(cur);
        setSessions((s) =>
          activeSessionId === null
            ? [{ id: sessionId++, title: sessionTitle(cur), messages: cur, updatedAt: Date.now(), ...(note ? { handoff: note } : {}) }, ...s].slice(0, 20)
            : s.map((x) => (x.id === activeSessionId ? { ...x, messages: cur, updatedAt: Date.now(), handoff: note ?? x.handoff } : x)),
        );
      }
      return target.messages;
    });
    // live row means "back to the draft", not a stored session.
    setActiveSessionId(id === LIVE_ID ? null : id);
    setAttachments([]);
    setThinking(false);
    setUnread(0);
    setView("chat");
    fsm.forceJacked();
    say(`resumed chat: ${target.title}`);
  };

  const deleteSession = (id: number) => {
    Sound.pop();
    const dead = sessions.find((x) => x.id === id);
    setSessions((s) => s.filter((x) => x.id !== id));
    // Tombstone the cloud row too, or the next pull resurrects it: sync is
    // an additive upsert, so a local-only delete never sticks.
    if (dead?.cloudId) {
      const cloudId = dead.cloudId;
      addTombstone(cloudId);
      void loadSync()
        .then((s) => s.deleteCloudChat(cloudId))
        .catch((e) =>
          say(`cloud delete failed: ${e instanceof Error ? e.message : e}`));
    }
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setOcSession(null);
      setMessages([]);
      setView("chat");
      scheduleGreet();
    }
    say("chat deleted");
  };

  // Terminal (opencode/claude) rows: hide on the bridge so the 15s poll
  // never re-lists them. The provider's own history is untouched.
  const deleteAgentSession = (sid: string) => {
    Sound.pop();
    setAgentSessions((list) => list.filter((s) => s.session !== sid));
    fetch(`${BRIDGE}/agent-sessions?session=${encodeURIComponent(sid)}`, { method: "DELETE" })
      .catch(() => say("hide failed — bridge offline"));
    say("session hidden");
  };

  const finishRoute = () => {
    Sound.approve();
    setView("finished");
    fsm.forceJacked();
    mascotRef.current?.celebrate();
    setPills((p) => p.map((x) => ({ ...x, badge: null })));
    say("route finished ✓");
  };

  const pushBot = (content: string) => {
    setThinking(false);
    setMessages((m) => [...m, { id: msgId++, role: "assistant", content }]);
  };

  // one shared conversation across both screens: every turn is announced
  // over the relay (display-only there — the bot turn runs once, here).
  // The hub skips the sender, so our own lines never echo back.
  const relayChat = (role: "user" | "assistant", text: string, files?: Attachment[]) => {
    const relay = relayRef.current;
    if (!relay || !text) return;
    const body = files?.length ? `${text}\n[${files.length} attachment${files.length === 1 ? "" : "s"}: ${files.map((f) => f.name).join(", ")}]` : text;
    relay.send("chat", { role, text: body, session: ocSessionRef.current });
  };

  const announceBot = (content: string) => {
    pushBot(content);
    relayChat("assistant", content);
    // completion ping, UI-open scope only: the open tab already shows the
    // reply; a hidden tab gets a real Notification + sound instead.
    try {
      if (document.hidden && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification("Steroids — agent finished", { body: content.slice(0, 120) });
        } else if (Notification.permission === "default") {
          void Notification.requestPermission();
        }
        Sound.approve();
      }
    } catch {
      // notifications are best-effort decoration, never break the reply
    }
  };

  // Replies belong to the thread that sent them: leaving mid-turn files
  // the reply in its own chat (badged) instead of crashing the new one.
  const deliverBot = (content: string, myThread: number | null) => {
    // every finished turn files its receipt (elapsed + engine).
    if (turnT0.current) {
      setLastThought({
        secs: Math.max(1, Math.round((Date.now() - turnT0.current) / 1000)),
        label: turnEngine || "nicki",
      });
      turnT0.current = 0;
    }
    if (activeRef.current === myThread) {
      announceBot(content);
      return;
    }
    setThinking(false);
    relayChat("assistant", content);
    const bot: ChatMessage = { id: msgId++, role: "assistant", content };
    if (myThread === null) {
      // was the live draft, since archived by new-chat: join that row.
      setSessions((prev) => prev.length
        ? [{ ...prev[0], messages: [...prev[0].messages, bot], updatedAt: Date.now() }, ...prev.slice(1)]
        : prev);
    } else {
      setSessions((prev) => prev.map((x) => x.id === myThread
        ? { ...x, messages: [...x.messages, bot], updatedAt: Date.now() } : x));
    }
    setUnread((u) => u + 1);
    Sound.approve();
    say("turn finished after you moved on — reply filed in its chat");
  };

  const sendChat = (text: string, provider = "opencode", opts?: { model: string; effort: string }, filesOverride?: Attachment[] | null) => {
    Sound.send();
    stopGreet();
    setUnread(0);
    turnT0.current = Date.now();
    if (view !== "chat") {
      setView("chat");
      fsm.forceJacked();
    }
    if (opts) say(`engine: ${provider}/${opts.model} · ${opts.effort} effort`);
    // explicit set (skill tap [], regen history) or the composer's chips.
    // Override turns never touch pending chips — tapping around while
    // files are staged must not fire them off with an unrelated question.
    const files = filesOverride ?? attachments;
    if (!filesOverride) setAttachments([]);
    // snapshot live handles for the upload, then forget them (no leak).
    // History-adopted attachments carry no handle — they resolve via url.
    const handles = new Map<number, File>();
    for (const a of files) {
      const h = fileHandles.current.get(a.id);
      if (h) handles.set(a.id, h);
      fileHandles.current.delete(a.id);
    }
    // auto chooses: stay on the current chat's engine, else first live one.
    let eng = provider;
    if (provider === "auto") {
      eng = (ocSessionRef.current && ocProvider.current) ||
        (caps.opencode ? "opencode" : "claude");
      say(`auto → ${eng}`);
    }
    // mid-task provider switch: session ids are provider-scoped (opencode
    // --session vs claude --resume), so switching forks a fresh session and
    // keeps the old one in history instead of erroring on a foreign id.
    // The old loop's tail rides along as handoff context — the new agent
    // continues, nothing restarts, nothing is killed.
    let sid = ocSession;
    let handoff = "";
    if (provider !== "auto" && ocProvider.current && provider !== ocProvider.current && ocSessionRef.current) {
      handoff = buildHandoff(messages, ocProvider.current, ocSessionRef.current);
      sid = null;
      setOcSession(null);
      ocSessionRef.current = null;
      say(handoff
        ? `switched ${ocProvider.current} → ${provider} · fresh session, loop handed off`
        : `switched ${ocProvider.current} → ${provider} · fresh session (providers can't share one)`);
    }
    // files alone are a complete turn: caption them so the bridge (which
    // refuses empty messages) and the agent both get something to chew on.
    const caption = text.trim() || (files.length ? "Look at the attached files and tell me what you see." : "");
    if (!caption) return;
    // "with the team": fan out to the crew — each mate runs their own
    // session (tiles track them live), results merge back here + shelf.
    if (/with the team/i.test(caption) && !files.length) {
      const goal = caption.replace(/with the team/i, "").trim() || caption;
      setMessages((m) => [...m, { id: msgId++, role: "user", content: caption, attachments: files }]);
      relayChat("user", caption, files);
      setThinking(true);
      say("crew run: fanning out to mates…");
      // crew runs minutes server-side: one honest line so running loops are
      // visible from chat (watch/stop in Shelf). Direct append — pushBot
      // would kill the thinking flag mid-run.
      setMessages((m) => [...m, { id: msgId++, role: "assistant", content: "Crew running — mates report here as they finish. Watch/stop it in the Shelf tab." }]);
      const crewThread = activeRef.current;
      const crewSay = (t: string) => {
        // moved on mid-run: mate news stays in the log, out of the new chat.
        if (activeRef.current === crewThread) pushBot(t);
        else say(t);
      };
      void (async () => {
        try {
          const started = await fetch(`${BRIDGE}/loop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: goal, provider: eng, crew: true }),
          }).then((r) => r.json());
          if (!started.id) throw new Error(started.error || "crew failed to start");
          const announced = new Set<string>();
          for (;;) {
            await new Promise((res) => setTimeout(res, 3000));
            const s = await fetch(`${BRIDGE}/loop?id=${started.id}`).then((r) => r.json());
            if (s.error) throw new Error(s.error);
            // progressive mate news: each finished step announced once.
            for (const st of (Array.isArray(s.steps) ? s.steps : []) as Array<{ name?: unknown; status?: unknown }>) {
              const key = `${st.name}:${st.status}`;
              if ((st.status === "done" || st.status === "recovered" || st.status === "failed") && !announced.has(key)) {
                announced.add(key);
                const mark = st.status === "failed" ? "✗" : "✓";
                crewSay(`${mark} ${st.name}`);
                say(`crew: ${st.name} ${st.status}`);
              }
            }
            if (!s.done) {
              say(`crew: ${s.activity || "working…"}`);
              continue;
            }
            const crew = (s.loop?.crew ?? []) as Array<{ role: string; session: string; skill: string; verdict: string }>;
            const line = crew.length
              ? crew.map((c) => `${c.role} (${c.skill}): ${c.verdict}`).join(" · ")
              : (s.loop?.detail ?? "crew finished");
            deliverBot(`Crew ${s.loop?.verdict ?? "done"} in ${s.elapsed ?? "?"}s — ${line}`, crewThread);
            say(`crew ${s.loop?.verdict ?? "done"}: ${crew.length} mates`);
            break;
          }
        } catch (e) {
          deliverBot(`Crew run failed: ${e instanceof Error ? e.message : e}`, crewThread);
        } finally {
          setThinking(false);
        }
      })();
      return;
    }
    setMessages((m) => [...m, { id: msgId++, role: "user", content: caption, attachments: files }]);
    relayChat("user", caption, files);
    mascotRef.current?.celebrate();
    setThinking(true);
    void sendWithFiles(caption, files, eng, opts, handles, sid, handoff);
  };

  // Stop morph: kill the agent server-side, abort polling, keep partials.
  const stopTurn = () => {
    const t = liveTurnCtl.current;
    liveTurnCtl.current = null;
    if (!t) return;
    try { t.abort(); } catch { /* already settled */ }
    fetch(`${BRIDGE}/turn?id=${encodeURIComponent(t.id)}`, { method: "DELETE" }).catch(() => {});
    setThinking(false);
    setLiveTurn(null);
    pushBot("Stopped — keeping what's above. Send to steer again.");
  };

  // inline bubble edit: drop the edited message + every stale reply below
  // it — the panel re-sends the new text as a fresh turn right after.
  const editMessage = (id: number) => {
    if (thinking) return;
    setMessages((m) => {
      const i = m.findIndex((x) => x.id === id);
      return i < 0 ? m : m.slice(0, i);
    });
  };

  // uploads attachments so the agent can actually open them: @paths ride
  // the message (opencode reads them), bare names when upload fails.
  const sendWithFiles = async (
    caption: string,
    files: Attachment[],
    provider: string,
    opts: { model: string; effort: string } | undefined,
    handles: Map<number, File>,
    sid: string | null = ocSession,
    handoff = "",
  ) => {
    let msg = caption;
    const failed: string[] = [];
    if (files.length) {
      const paths: string[] = [];
      for (const a of files) {
        // adopted history chips have no File handle — rebuild from the
        // still-live object URL (same session only; reloads lose it).
        let handle = handles.get(a.id);
        if (!handle && a.url) {
          try {
            const blob = await fetch(a.url).then((r) => r.blob());
            if (blob.size) handle = new File([blob], a.name, { type: blob.type || "application/octet-stream" });
          } catch { /* falls through to bare name */ }
        }
        if (!handle) {
          paths.push(a.name);
          failed.push(a.name);
          continue;
        }
        try {
          const dataUrl = await readDataUrl(handle);
          const r = await fetch(`${BRIDGE}/upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: a.name, data: dataUrl }),
          });
          const j = await r.json();
          paths.push(j.ok && j.path ? `@${j.path}` : a.name);
        } catch {
          paths.push(a.name);
        }
      }
      if (paths.length) msg += `\n\n[attached files: ${paths.join(", ")}]`;
      // vision honesty: neither provider receives pixels (plain-text CLI
      // turns), so forbid the model from pretending it saw the image.
      if (files.some((a) => a.kind === "image")) {
        msg += `\n\n(note: attached images arrive as filenames only — if you cannot see pixels, say so instead of describing them)`;
      }
      // bridge caps messages at 4000 chars: shrink the caption, never cut
      // an @path in half (a clipped path reads as a missing file).
      if (caption && msg.length > 3900 && paths.length) {
        const over = msg.length - 3900;
        const cutCaption = caption.slice(0, Math.max(0, caption.length - over)) + "…[truncated]";
        msg = msg.replace(caption, cutCaption);
      }
    }
    if (failed.length) {
      // plain append, NOT pushBot — the turn is still in flight and
      // pushBot would kill the thinking spinner mid-poll.
      const warn = `${failed.join(", ")} couldn't upload — sent names only, the agent can't open them. Try again or paste the content as text.`;
      setMessages((m) => [...m, { id: msgId++, role: "assistant", content: warn }]);
    }
    // handoff rides the wire only — the bubble shows the user's caption.
    postChat(handoff ? `${handoff}\n\n${msg}` : msg, provider, opts, sid);
  };

  const postChat = (
    text: string,
    provider = "opencode",
    opts?: { model: string; effort: string },
    sid: string | null = ocSession,
  ) => {
    const ctl = new AbortController();
    const label = `${provider}${opts?.model && opts.model !== "router-pick" ? `/${opts.model}` : ""}`;
    setTurnEngine(label);
    // blank activity falls back to the specific line (engine/model in the
    // work-cap), never a bare "starting…".
    setLiveTurn({ activity: "", partial: "" });
    const myThread = activeRef.current;
    // No client timeout: the turn runs server-side as long as it takes
    // (loops already poll forever). We never DELETE a live turn — killing
    // the agent mid-work is what the old 160s abort did.
    let poll: ReturnType<typeof setInterval> | null = null;
    let finished = false;
    const finish = () => {
      finished = true;
      if (poll) clearInterval(poll);
      setLiveTurn(null);
      liveTurnCtl.current = null;
    };
    fetch(`${BRIDGE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: sid, provider, model: opts?.model, effort: opts?.effort }),
      signal: ctl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        // bridge answered but refused: show its reason, not "unreachable".
        // Keep the session — a retry continues it instead of orphaning it.
        if (!j.ok || !j.turn) {
          finish();
          if (j.session) setOcSession(j.session);
          pushBot(`Agent couldn't run: ${j.error || "bridge failed"}`);
          say(`chat refused: ${j.error || "bridge failed"}`);
          return;
        }
        const id = j.turn as string;
        const boot = j.boot as string | undefined;
        liveTurnCtl.current = { id, abort: () => ctl.abort() };
        poll = setInterval(() => {
          fetch(`${BRIDGE}/turn?id=${id}`, { signal: ctl.signal })
            .then((r) => r.json())
            .then((s) => {
              if (s.session) setOcSession(s.session);
              // Bridge swept/restarted the turn (no `done` field, has error):
              // exit honestly instead of spinning on a dead job forever.
              if (!s.done && s.error) {
                finish();
                // boot changed = the bridge restarted mid-turn (turns live
                // in memory only): that run was cut off, say so honestly.
                const restarted = typeof boot === "string" &&
                  typeof s.boot === "string" && s.boot !== boot;
                pushBot(restarted
                  ? "Bridge restarted mid-turn — that run was cut off. Send again, it continues the same session."
                  : `Turn lost (${s.error}) — send again, it continues the same session.`);
                say(`chat lost: ${s.error}`);
                return;
              }
              if (!s.done) {
                setLiveTurn({ activity: s.activity || "working…", partial: s.partial || "" });
                return;
              }
              finish();
              if (!s.ok) {
                pushBot(`Agent couldn't run: ${s.error || "bridge failed"}`);
                say(`chat refused: ${s.error || "bridge failed"}`);
                return;
              }
              ocProvider.current = provider;
              if (view !== "chat" && activeRef.current === myThread) setUnread((u) => u + 1);
              say(`opencode turn done${s.session ? ` · ${String(s.session).slice(0, 12)}…` : ""}`);
              deliverBot(s.text, myThread);
            })
            .catch(() => {
              // transient poll blip (bridge hiccup, laptop sleep): the turn
              // is server-side and still running — keep waiting for the
              // next tick, never kill it from here.
            });
        }, 1000);
      })
      .catch(() => {
        if (finished) return;
        finish();
        pushBot("Bridge unreachable — start it (`python3 island/bridge.py --serve`) and send again. Nothing was answered.");
        say("chat failed: bridge unreachable");
      });
  };

  const resumeAgentSession = (sid: string, first: string) => {
    Sound.pop();
    stopGreet();
    // stash nicki's live draft once (mate→mate keeps the same stash).
    setMessages((cur) => {
      if (!drivingRef.current) stashRef.current = { messages: cur, sid: ocSessionRef.current };
      return cur;
    });
    setDrivingSid(sid);
    setOcSession(sid);
    // terminal chats keep their engine when continued here.
    const agent =
      agentSessions.find((s) => s.session === sid)?.agent === "claude"
        ? "claude"
        : "opencode";
    ocProvider.current = agent;
    setUnread(0);
    setView("chat");
    fsm.forceJacked();
    // each mate opens its OWN turns (bridge /transcript from the hook
    // ledger). Empty ledger = hook-free session: honest receipt instead.
    const receipt = () => {
      setMessages((m) => {
        const label = `Driving “${first.slice(0, 40)}” — ask away.`;
        const last = m[m.length - 1];
        if (last && last.role === "assistant" && last.content.startsWith("Driving “")) {
          return [...m.slice(0, -1), { ...last, content: label }];
        }
        return [...m, { id: msgId++, role: "assistant", content: label }];
      });
    };
    fetch(`${BRIDGE}/transcript?session=${encodeURIComponent(sid)}`)
      .then((r) => r.json())
      .then((j) => {
        const items = Array.isArray(j?.transcript) ? j.transcript : [];
        if (!items.length) { receipt(); return; }
        setMessages(items.map((t: { role?: unknown; text?: unknown }) => ({
          id: msgId++,
          role: t.role === "user" ? "user" as const : "assistant" as const,
          content: String(t.text ?? ""),
        })));
      })
      .catch(() => receipt());
    say(`driving agent session ${sid.slice(0, 12)}…`);
  };

  const backToNicki = () => {
    Sound.pop();
    const stash = stashRef.current;
    stashRef.current = null;
    setDrivingSid(null);
    if (stash) {
      setMessages(stash.messages);
      setOcSession(stash.sid);
    }
    setUnread(0);
    setView("chat");
    fsm.forceJacked();
    say("back to nicki");
  };

  // PC→phone: bytes ride the paired pipe. Small files go inline in one
  // frame; big ones stream in 512KB chunks (memory-safe both ends, the hub
  // just routes small frames). Offline: small files queue, big ones queue
  // as name-cards — bytes need a live link. Files stay in the composer too,
  // so you can ask the same bot about them.
  const INLINE_MAX = 8 * 1024 * 1024;
  const CHUNK = 1024 * 1024; // 1MB frames: hub-friendly, atob-fast
  const fmtSize = (b: number): string => {
    if (b < 1024) return `${Math.max(0, Math.floor(b))}B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
    if (b < 1073741824) return `${(b / 1048576).toFixed(1)}MB`;
    return `${(b / 1073741824).toFixed(2)}GB`;
  };
  const fmtEta = (s: number): string => {
    s = Math.max(0, Math.round(s));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const readDataUrl = (f: File) =>
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("read failed"));
      r.readAsDataURL(f);
    });
  const readSliceB64 = (f: File, start: number, end: number) =>
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] ?? "");
      r.onerror = () => rej(new Error("slice read failed"));
      r.readAsDataURL(f.slice(start, end, f.type));
    });
  const b64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const validKind = (k: unknown): Attachment["kind"] =>
    k === "image" || k === "code" || k === "doc" || k === "audio" ? k : "other";
  // a landed file, either direction: into the composer like a local attach
  // (ready to ask the bot about) + auto-saved per the once-asked preference.
  const landFile = (name: string, blob: Blob) => {
    const from = isPcSide ? "Phone" : "PC";
    addFiles([new File([blob], name, { type: blob.type || "application/octet-stream" })]);
    if (settingsRef.current.autoSave) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      pushBot(`${from} sent ${name} — saved ✓, same session continues here.`);
    } else {
      pushBot(`${from} sent ${name} — it's in the composer, ask me about it.`);
    }
    say(`${from.toLowerCase()} → ${isPcSide ? "pc" : "phone"}: file ${name} (bytes landed)`);
  };
  // big files stream in 1MB chunks with resume: the transfer id is stable
  // per file, so a retry only fetches the chunks the far side is missing.
  const dropBigFile = async (
    relay: RelayClient,
    a: Attachment,
    handle: File,
    session: string | null,
  ): Promise<"sent" | "offline" | "failed"> => {
    const id = `${handle.name}-${handle.size}-${handle.lastModified}`;
    const n = Math.ceil(handle.size / CHUNK);
    const have = new Set<number>();
    const off = relay.onMessage((f) => {
      if (f.type === "file-got" && f.id === id && Array.isArray(f.have)) {
        for (const i of f.have as unknown[]) {
          if (typeof i === "number") have.add(i);
        }
      }
    });
    const announced = relay.send("file-start", {
      id, name: a.name, size: a.size, kind: a.kind, session, n,
    });
    if (!announced) {
      off();
      return "offline";
    }
    await new Promise((w) => setTimeout(w, 800)); // far side's inventory
    off();
    const missing: number[] = [];
    for (let i = 0; i < n; i++) if (!have.has(i)) missing.push(i);
    if (!missing.length) {
      relay.send("file-end", { id }); // they already hold it all
      return "sent";
    }
    say(have.size
      ? `resuming ${a.name} at ${have.size}/${n} chunks…`
      : `sending ${a.name} (${fmtSize(a.size)}) in ${n} chunks…`);
    const t0 = performance.now();
    let doneBytes = have.size * CHUNK;
    let lastPc = -1;
    for (const i of missing) {
      let b64: string;
      try {
        b64 = await readSliceB64(handle, i * CHUNK, Math.min(handle.size, (i + 1) * CHUNK));
      } catch {
        return "failed";
      }
      if (!relay.send("file-chunk", { id, i, data: b64 })) return "failed";
      doneBytes += Math.min(CHUNK, handle.size - i * CHUNK);
      const pc = Math.floor((doneBytes / handle.size) * 100);
      if (pc >= lastPc + 10) {
        lastPc = pc - (pc % 10);
        const el = (performance.now() - t0) / 1000;
        const rate = doneBytes / Math.max(el, 0.1);
        say(`${a.name} ${pc}% · ${fmtSize(rate)}/s · ~${fmtEta((handle.size - doneBytes) / Math.max(rate, 1))} left`);
      }
      if (i % 20 === 19) await new Promise((w) => setTimeout(w, 0));
    }
    relay.send("file-end", { id });
    const el = (performance.now() - t0) / 1000;
    say(`${a.name} sent in ${fmtEta(el)} (${fmtSize(handle.size / Math.max(el, 0.1))}/s)`);
    return "sent";
  };
  const dropToPhone = async (list?: Attachment[]) => {
    const files = list ?? attachments;
    if (!files.length) return;
    const relay = relayRef.current!;
    const outbox = outboxRef.current!;
    let sent = 0, queued = 0, cards = 0;
    for (const a of files) {
      const frame: Record<string, unknown> = {
        name: a.name, size: a.size, kind: a.kind, session: ocSession,
      };
      const handle = fileHandles.current.get(a.id);
      if (handle && handle.size > INLINE_MAX) {
        // big file: chunked live (resumable); offline it rides as a name-card.
        const r = await dropBigFile(relay, a, handle, ocSession);
        if (r === "sent") {
          pushBot(`Sent ${a.name} (${fmtSize(a.size)}) ✓ — same session continues on the phone.`);
          sent++;
          continue;
        }
        if (r === "failed") pushBot(`${a.name} interrupted — drop it again to resume where it stopped.`);
        cards++;
      } else if (handle) {
        try {
          frame.data = await readDataUrl(handle);
        } catch {
          cards++;
        }
      }
      if (frame.data !== undefined) {
        if (relay.send("file", frame)) {
          sent++;
          continue;
        }
        try {
          outbox.enqueue("file", frame); // small bytes survive offline
          queued++;
          continue;
        } catch {
          delete frame.data; // storage full: card only, said once below
          cards++;
        }
      } else if (handle && handle.size > INLINE_MAX) {
        cards++; // chunked send failed above: bytes need a live link
      }
      try {
        outbox.enqueue("file", frame);
        queued++;
      } catch {
        continue;
      }
    }
    const s = (n: number) => (n === 1 ? "" : "s");
    if (sent && !queued) pushBot(`Sent ${sent} file${s(sent)} to phone ✓ — same session continues there.`);
    else if (queued && !sent) pushBot(`${queued} file${s(queued)} queued — pair the phone in Settings and they fire on link.`);
    else if (queued) pushBot(`Sent ${sent}, queued ${queued} — pairing fires the rest.`);
    if (cards) pushBot(`Note: ${cards} file${s(cards)} travelled as name card${s(cards)} (offline or unreadable) — bytes need a live link.`);
    // The buddy says it once as a pill-hint suggestion, then it fades —
    // no card, no nag. Outbox still auto-fires on link either way.
    if (queued > 0 && !phoneLinked) {
      mascotRef.current?.celebrate();
      setHint(queued === 1
        ? "1 file waiting — pair your phone, it sends on link"
        : `${queued} files waiting — pair your phone, they send on link`);
      window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHint(ROUTE_SAMPLES[sampleIdx.current]), 6000);
    }
    say(`drop → phone: ${sent} live, ${queued} queued`);
  };

  const buildAttachments = (files: File[], room: number): Attachment[] => {
    const accepted = files.slice(0, Math.max(0, room));
    const fresh: Attachment[] = [];
    for (const f of accepted) {
      // no size cap: big files stream chunked (resumable); small go inline.
      const kind = classifyAttachment(f.name, f.type);
      const id = attachId.current++;
      fileHandles.current.set(id, f);
      fresh.push({
        id,
        name: f.name,
        size: f.size,
        kind,
        url: kind === "image" || kind === "audio" ? URL.createObjectURL(f) : undefined,
      });
    }
    if (files.length > accepted.length) say(`attachment cap: 5 files max`);
    return fresh;
  };

  const addFiles = (files: File[]) => {
    const fresh = buildAttachments(files, 5 - attachments.length);
    if (!fresh.length) return;
    setAttachments((cur) => [...cur, ...fresh]);
    mascotRef.current?.poke();
    say(`attached: ${fresh.map((f) => f.name).join(", ")}`);
    if (fsm.state !== "jacked" || view !== "chat") {
      setView("chat");
      fsm.forceJacked();
    }
  };

  // files dropped on the phone zone go straight to the phone and LEAVE the
  // composer — they were sent, keeping them staged double-fires them into
  // the next agent turn. Re-attach via + if you also want to ask about them.
  const dropFilesToPhone = (files: File[]) => {
    const fresh = buildAttachments(files, 5 - attachments.length);
    if (!fresh.length) return;
    say(`dropped: ${fresh.map((f) => f.name).join(", ")} → phone`);
    if (fsm.state !== "jacked" || view !== "chat") {
      setView("chat");
      fsm.forceJacked();
    }
    void dropToPhone(fresh);
    setAttachments((cur) => cur.filter((x) => !fresh.some((f) => f.id === x.id)));
  };

  const removeAttachment = (id: number) => {
    fileHandles.current.delete(id);
    setAttachments((a) => a.filter((x) => x.id !== id));
  };

  // Shelf (Atoll tray tab): staged files waiting to attach or beam.
  // Session-only — object URLs die on reload, so staged files do too.
  const [shelf, setShelf] = useState<ShelfItem[]>([]);
  const stageFiles = (files: File[]) => {
    const room = Math.max(0, 10 - shelf.length);
    const fresh = files.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }));
    if (!fresh.length) {
      say("shelf full (10) — attach or remove first");
      return;
    }
    setShelf((cur) => [...cur, ...fresh].slice(-10));
    say(`staged: ${fresh.map((f) => f.file.name).join(", ")}`);
  };
  const removeShelf = (url: string) => {
    setShelf((cur) => {
      const dead = cur.find((x) => x.url === url);
      if (dead) URL.revokeObjectURL(dead.url);
      return cur.filter((x) => x.url !== url);
    });
  };

  const handlePaired = (endpoint: string, key: string) => {
    const relay = relayRef.current!;
    relay.pair(endpoint, key);
    relay.connect();
    say("phone paired — relay connecting");
  };

  const handleUnpair = () => {
    relayRef.current!.disconnect();
    localStorage.removeItem("relay_endpoint");
    localStorage.removeItem("relay_key");
    setPhoneLinked(false);
    say("phone unpaired");
  };

  // one tap: grant this knock our hub key so the phone joins the SAME room.
  const handleApprove = async (token: string) => {
    try {
      const r = await fetch(`${BRIDGE}/relay/link-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          key: localStorage.getItem("relay_key") || null,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "stale");
      // approved but this PC holds no key (fresh boot race): adopt it.
      const relay = relayRef.current!;
      if (!localStorage.getItem("relay_key") && j.key) {
        relay.pair(BRIDGE, j.key);
        relay.connect();
      }
      setLinkReqs((q) => q.filter((x) => x.token !== token));
      say("phone allowed — linked");
    } catch {
      say("approve failed — knock again");
    }
  };

  return (
    <div
      className={APP_MODE ? `stage app${isPcSide ? " pc" : ""}` : "stage"}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) addFiles(files);
        else openChat();
      }}
      onClick={(e) => {
        // tap on the empty surround (not the island) collapses the panel.
        if (e.target === e.currentTarget && fsm.state === "jacked" && !fsm.pinned) {
          fsm.forceFlex();
          say("tap-outside → notch");
        }
      }}
    >
      {!APP_MODE && (
        <header className="wordmark">
          <b>STEROIDS</b><span>island · {appVer}</span>
          <em className="live-dot" />
        </header>
      )}
      <Island
        ref={islandRef}
        fsmState={fsmState}
        view={view}
        mascotRef={mascotRef}
        routeHint={hint}
        echo={echo}
        approval={approval}
        question={question}
        messages={messages}
        thinking={thinking}
        liveActivity={liveTurn?.activity ?? null}
        livePartial={liveTurn?.partial ?? null}
        turnEngine={turnEngine}
        lastThought={lastThought}
        onStop={stopTurn}
        liveSession={ocSession}
        attachments={attachments}
        onFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        shots={shots}
        zoomShot={zoomShot}
        frame={frame}
        onMouseEnter={hoverEntered}
        onMouseLeave={hoverLeft}
        onIslandClick={islandClicked}
        onMascotTap={handleTap}
        onDecide={(d) => {
          if (d === "Deny") Sound.deny(); else Sound.approve();
          say(`approval: ${d}`);
          // hook rows resolve server-side so the waiting agent proceeds.
          const row = hookRows.current.find((r) => r.key === approval?.requestId);
          if (row) {
            void fetch(`${BRIDGE}/decide`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key: row.key, verdict: d, tool: row.tool || "" }),
            }).catch(() => {});
            hookRows.current = hookRows.current.filter((r) => r.key !== row.key);
          }
          setApproval(null);
          setView("explore");
          if (d !== "Deny") mascotRef.current?.celebrate();
        }}
        onAnswer={(a) => {
          say(`answered: ${a.join(", ")}`);
          setQuestion(null);
          setView("explore");
          mascotRef.current?.celebrate();
        }}
        onSend={sendChat}
        onEditMessage={editMessage}
        sessions={historySessions}
        histHint={
          skippedSync > 0
            ? `${skippedSync} cloud chat${skippedSync === 1 ? "" : "s"} need the sync code — Settings → Account`
            : !historySessions.length && account && !hasKey
              ? "Signed in on a new device — open Settings → Account and paste your sync code"
              : null
        }
        activeSessionId={activeSessionId}
        onResumeSession={resumeSession}
        onDeleteSession={deleteSession}
        onNewChat={newChat}
        exploreLive={bridgeOn}
        exploreFeed={exploreFeed}
        feedEvents={feedEvents}
        onSearchSkills={searchSkills}
        providers={bridgeOn ? caps : null}
        installState={installState}
        onInstall={handleInstall}
        agentSessions={agentSessions}
        onResumeAgentSession={resumeAgentSession}
        onBackToNicki={drivingSid ? backToNicki : undefined}
        onDeleteAgentSession={deleteAgentSession}
        settings={settings}
        onSettings={applySettings}
        settingsPage={settingsPage}
        onSettingsPage={setSettingsPage}
        onTab={handleTab}
        unread={unread}
        onDropToPhone={() => void dropToPhone()}
        onDropFilesToPhone={dropFilesToPhone}
        phoneLinked={phoneLinked}
        pairNode={
          <PairPanel
            linked={phoneLinked}
            pending={linkReqs}
            onPaired={handlePaired}
            onApprove={(t) => void handleApprove(t)}
            onUnpair={handleUnpair}
          />
        }
        shelfNode={
          <ShelfView
            items={shelf}
            onStage={stageFiles}
            onAttach={(f) => addFiles([f])}
            onSendToPhone={(f) => dropFilesToPhone([f])}
            onRemove={removeShelf}
          />
        }
        staged={shelf}
        onAttachStaged={(f) => addFiles([f])}
        accountEmail={account}
        accountAvatar={avatarUrl}
        onSignOut={handleSignOut}
        accountNode={
          <AccountPanel
            email={account}
            avatarUrl={avatarUrl}
            displayName={displayName?.full ?? null}
            firstName={displayName?.first ?? null}
            lastName={displayName?.last ?? null}
            msg={syncMsg}
            busy={syncBusy}
            onGoogle={handleGoogle}
            onSendCode={handleSendCode}
            onSaveName={handleSaveName}
            onVerify={handleVerify}
            hasKey={hasKey}
            shownCode={shownCode}
            onRevealCode={handleRevealCode}
            onHideCode={() => setShownCode(null)}
            onSaveCode={handleSaveCode}
          />
        }
      />
      {!APP_MODE && (
        <>
          <p className="hint">hover = flex · click mascot = jacked · Esc = flex · drop a file anywhere to attach</p>
      <div className="row">
        <button onClick={() => { fsm.launch(); setTimeout(() => fsm.greetComplete(), 400); }}>launch (greet)</button>
        <button onClick={() => fsm.reveal()}>reveal (work)</button>
        <button onClick={nextRoute}>route event</button>
        <button onClick={openChat}>chat</button>
        <button onClick={openLens}>lens</button>
        <button onClick={newChat}>new chat</button>
        <button onClick={askTeach}>teach approval</button>
        <button onClick={askQuestion}>ask question</button>
        <button onClick={finishRoute}>finish ✓</button>
        <button onClick={() => { fsm.forceJacked(); setView("explore"); }}>explore</button>
        <button onClick={() => fsm.forceHidden()}>hide</button>
      </div>
      <div className="log" aria-live="polite">
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      {/* home parity (index.html .live-hud): bottom-right LIVE pill */}
      <div className="live-hud" title="Live island status">
        <span className="dot" aria-hidden="true" /><span>LIVE</span>
        <b>island · {appVer}</b>
      </div>
        </>
      )}
    </div>
  );
}
