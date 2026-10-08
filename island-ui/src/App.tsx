import { useCallback, useEffect, useRef, useState } from "react";
import Island from "./components/Island";
import type { MascotHandle } from "./components/Mascot";
import { IslandFSM, type IslandState } from "./fsm";
import {
  HARNESS_PILLS, ROUTE_SAMPLES, classifyAttachment, sessionTitle,
  tombstones, addTombstone,
  type AgentSession, type Approval, type Attachment, type ChatMessage, type ChatSession, type ExploreFeed, type IslandView, type Pill, type Question, type SkillHit,
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
import { Sound, setMuted, setVolume } from "./sound";
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

const GREETING = "Ask anything…";

const BRIDGE =
  new URLSearchParams(window.location.search).get("bridge") ||
  window.location.origin;

// installed-app mode (?app=1): the island itself, not the QA preview
// harness — no wordmark, no dev buttons, no event log. Starts flexed.
const APP_MODE =
  new URLSearchParams(window.location.search).get("app") === "1";

export default function App() {
  const [fsmState, setFsmState] = useState<IslandState>("hidden");
  const [view, setView] = useState<IslandView>("chat");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("general");
  const [hint, setHint] = useState(ROUTE_SAMPLES[0]);
  const [, setPills] = useState<Pill[]>(HARNESS_PILLS);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [bridgeOn, setBridgeOn] = useState(false);
  const [liveTurn, setLiveTurn] = useState<{ activity: string; partial: string } | null>(null);
  const [turnEngine, setTurnEngine] = useState("");
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
  const [ocSession, setOcSession] = useState<string | null>(null);
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);
  const [exploreFeed, setExploreFeed] = useState<ExploreFeed | null>(null);
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
  const islandClicked = () => {
    if (fsm.state === "hidden" && !settingsRef.current.hoverOpen) {
      fsm.reveal();
      say("island opened on tap (hover-open off)");
    }
  };
  ocSessionRef.current = ocSession;
  // auto's choice sticks here: continuing a chat reuses its engine.
  const ocProvider = useRef<string | null>(null);
  const [linkReqs, setLinkReqs] = useState<LinkRequest[]>([]);
  const seenKnocks = useRef(new Set<string>());
  // cloud account (same Supabase login as GOlinkup) — history sync only,
  // everything still works logged out.
  const [account, setAccount] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<DisplayName | null>(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

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
    if (v === "explore" || v === "approval" || v === "question" || v === "chat" || v === "daily" || v === "lens" || v === "shelf" || v === "settings" || v === "finished") setView(v);
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
    return () => { dead = true; clearInterval(shotsTimer); clearInterval(sessionsTimer); };
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
    if (APP_MODE) {
      // floating over the phone: no page background at all, island floats.
      document.body.style.background = "transparent";
      // explicit ?state= wins (QA); otherwise the installed app starts flexed.
      if (!new URLSearchParams(window.location.search).get("state")) fsm.forceFlex();
    }
    return () => stopGreet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          s.ensureSyncKey();
          setHasKey(true);
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

  const mergeCloud = (rows: CloudRow[], skipped = 0) => {
    // Deleted chats stay deleted: tombstoned ids never merge back, even
    // when the row still exists server-side (older device re-pushed it).
    const dead = new Set(tombstones());
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
          }
        } else {
          out.push({
            id: sessionId++,
            title: r.title || "Cloud chat",
            messages: msgs,
            updatedAt: at,
            cloudId: r.chat_id,
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
        return loadSync().then((s) => {
          s.ensureSyncKey();
          setHasKey(true);
          return s.displayName().then((d) => ({ s, d }));
        });
      })
      .then(({ s, d }) => {
        if (d) {
          setDisplayName(d);
          say(`welcome back, ${d.first}`);
        }
        return s.pullChats();
      })
      .then(({ rows, skipped }) => mergeCloud(rows, skipped))
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
            say("phone pipe: this PC joined its hub");
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
    return () => { offStatus(); offMsg(); clearInterval(pendingTimer); relay.disconnect(); };
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

  // Nicki types hello herself: thinking dots, then the greeting is sent.
  // Never pre-written — chat starts empty and she pokes you to begin.
  const scheduleGreet = () => {
    if (greetTimer.current) clearTimeout(greetTimer.current);
    greetOn.current = true;
    setThinking(true);
    greetTimer.current = setTimeout(() => {
      if (!greetOn.current) return;
      greetOn.current = false;
      setMessages((m) =>
        m.length ? m : [...m, { id: msgId++, role: "assistant", content: GREETING }],
      );
      setThinking(false);
    }, 1100);
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
        setSessions((s) => [
          { id: sessionId++, title: sessionTitle(cur), messages: cur, updatedAt: Date.now() },
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
        setSessions((s) =>
          activeSessionId === null
            ? [{ id: sessionId++, title: sessionTitle(cur), messages: cur, updatedAt: Date.now() }, ...s].slice(0, 20)
            : s.map((x) => (x.id === activeSessionId ? { ...x, messages: cur, updatedAt: Date.now() } : x)),
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
  };

  const sendChat = (text: string, provider = "opencode", opts?: { model: string; effort: string }, filesOverride?: Attachment[] | null) => {
    Sound.send();
    stopGreet();
    setUnread(0);
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
    let sid = ocSession;
    if (provider !== "auto" && ocProvider.current && provider !== ocProvider.current && ocSessionRef.current) {
      sid = null;
      setOcSession(null);
      ocSessionRef.current = null;
      say(`switched ${ocProvider.current} → ${provider} · fresh session (providers can't share one)`);
    }
    // files alone are a complete turn: caption them so the bridge (which
    // refuses empty messages) and the agent both get something to chew on.
    const caption = text.trim() || (files.length ? "Look at the attached files and tell me what you see." : "");
    if (!caption) return;
    setMessages((m) => [...m, { id: msgId++, role: "user", content: caption, attachments: files }]);
    relayChat("user", caption, files);
    mascotRef.current?.celebrate();
    setThinking(true);
    void sendWithFiles(caption, files, eng, opts, handles, sid);
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
    postChat(msg, provider, opts, sid);
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
    setLiveTurn({ activity: "starting…", partial: "" });
    const timer = setTimeout(() => ctl.abort(), 160000);
    let poll: ReturnType<typeof setInterval> | null = null;
    let finished = false;
    const finish = () => {
      finished = true;
      if (poll) clearInterval(poll);
      clearTimeout(timer);
      setLiveTurn(null);
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
        poll = setInterval(() => {
          fetch(`${BRIDGE}/turn?id=${id}`, { signal: ctl.signal })
            .then((r) => r.json())
            .then((s) => {
              if (s.session) setOcSession(s.session);
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
              if (view !== "chat") setUnread((u) => u + 1);
              say(`opencode turn done${s.session ? ` · ${String(s.session).slice(0, 12)}…` : ""}`);
              announceBot(s.text);
            })
            .catch(() => {
              // aborted (160s) or dead poll: stop the turn, say so honestly.
              if (ctl.signal.aborted && !finished) {
                finish();
                fetch(`${BRIDGE}/turn?id=${id}`, { method: "DELETE" }).catch(() => {});
                pushBot(`Turn stopped after 160s (${provider}) — send again, it continues the same session.`);
                say("chat aborted: 160s timeout");
              }
              // transient poll blip: keep waiting for the next tick.
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
    setOcSession(sid);
    // terminal chats keep their engine when continued here.
    ocProvider.current =
      agentSessions.find((s) => s.session === sid)?.agent === "claude"
        ? "claude"
        : "opencode";
    setUnread(0);
    setView("chat");
    fsm.forceJacked();
    setMessages((m) => [
      ...m,
      { id: msgId++, role: "assistant", content: `Resumed “${first}” — Nicki has the full context. Ask away.` },
    ]);
    say(`resumed agent session ${sid.slice(0, 12)}…`);
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

  // history chips back into the composer (edit flow): fresh ids so React
  // keys never collide, same object URLs so previews + uploads still work.
  const adoptAttachments = (atts: Attachment[]) => {
    if (!atts.length) return;
    const fresh = atts.map((a) => ({ ...a, id: attachId.current++ }));
    setAttachments((cur) => [...cur, ...fresh].slice(-5));
    say(`restored ${fresh.length} attachment${fresh.length === 1 ? "" : "s"} to composer`);
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
      className={APP_MODE ? "stage app" : "stage"}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) addFiles(files);
        else openChat();
      }}
    >
      <header className="wordmark">
        <b>STEROIDS</b><span>island · v0.1.1</span>
        <em className="live-dot" />
      </header>
      <Island
        ref={islandRef}
        fsmState={fsmState}
        view={view}
        mascotRef={mascotRef}
        routeHint={hint}
        approval={approval}
        question={question}
        messages={messages}
        thinking={thinking}
        liveActivity={liveTurn?.activity ?? null}
        livePartial={liveTurn?.partial ?? null}
        turnEngine={turnEngine}
        attachments={attachments}
        onFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        onAdoptAttachments={adoptAttachments}
        onOpenLens={openLens}
        shots={shots}
        zoomShot={zoomShot}
        onMouseEnter={hoverEntered}
        onMouseLeave={hoverLeft}
        onIslandClick={islandClicked}
        onMascotTap={handleTap}
        onDecide={(d) => {
          if (d === "Deny") Sound.deny(); else Sound.approve();
          say(`approval: ${d}`);
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
        sessions={historySessions}
        activeSessionId={activeSessionId}
        onResumeSession={resumeSession}
        onDeleteSession={deleteSession}
        onNewChat={newChat}
        exploreLive={bridgeOn}
        exploreFeed={exploreFeed}
        onSearchSkills={searchSkills}
        providers={bridgeOn ? caps : null}
        installState={installState}
        onInstall={handleInstall}
        agentSessions={agentSessions}
        onResumeAgentSession={resumeAgentSession}
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
    </div>
  );
}
