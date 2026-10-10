import { forwardRef, lazy, Suspense, useEffect, useRef, useState } from "react";
import Mascot, { type MascotHandle } from "./Mascot";
import { ApprovalCard, QuestionCard, ChatPanel, ExploreView, FeedView, SettingsView, type SettingsState, type SettingsPage } from "./Cards";
import { TeamGrid, useTeam, hueFor } from "./TeamGrid";
import Huddle from "./Huddle";
import { Header } from "./Header";
// ponytail: lens + daily ride separate chunks — default chat view stays lean,
// vite warns over 500KB and these views load on tab tap, never at boot.
const DailyView = lazy(() => import("./Daily").then((m) => ({ default: m.DailyView })));
const LensView = lazy(() => import("./LensView").then((m) => ({ default: m.LensView })));
import { HomeSkeleton } from "./HomeSkeleton";
import type { Shot } from "./LensView";
import type { AgentSession, Approval, Attachment, ChatMessage, ChatSession, ExploreFeed, FeedEvent, IslandView, Question, SkillHit } from "../store";
import type { IslandState } from "../fsm";

// Edge glow: one fixed strip. Volume/brightness wakes it with a single
// start→end sweep (~0.9s), then it sits as a steady full ring until idle.
// No settings, no variants — holding a key glides without restarting.
function EdgeGlow() {
  const [show, setShow] = useState<{ pct: number; tone: string; glow: string } | null>(null);
  const showRef = useRef(show);
  showRef.current = show;
  const seen = useRef<{ volume: number | null; brightness: number | null }>({ volume: null, brightness: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let alive = true;
    // QA hook: ?demo=edge pins the level ring (mirrors demo=approval).
    if (new URLSearchParams(window.location.search).get("demo") === "edge") {
      const t = setTimeout(() => setShow({ pct: 63, tone: "#fb923c", glow: "rgba(251,146,60,.45)" }), 0);
      return () => { alive = false; clearTimeout(t); };
    }
    const poll = () => {
      fetch(`${window.location.origin}/echo`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          const s = seen.current;
          let cur: { pct: number; tone: string; glow: string } | null = null;
          if (typeof j?.volume === "number" && j.volume !== s.volume) {
            s.volume = j.volume;
            if (!j.muted) cur = { pct: j.volume, tone: "#fb923c", glow: "rgba(251,146,60,.45)" };
          }
          if (typeof j?.brightness === "number" && j.brightness !== s.brightness) {
            s.brightness = j.brightness;
            cur = { pct: j.brightness, tone: "#7dd3fc", glow: "rgba(125,211,252,.45)" };
          }
          if (cur) {
            // holding volume: same tone, just move the var — no re-render,
            // so the sweep never restarts mid-hold. Hide 1.2s after release.
            const isl = document.getElementById("island") as HTMLElement | null;
            if (showRef.current?.tone === cur.tone && isl?.hasAttribute("data-edge")) {
              isl.style.setProperty("--fill", String(cur.pct));
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => { if (alive) setShow(null); }, 1200);
              return;
            }
            setShow(cur);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => { if (alive) setShow(null); }, 1200);
          }
        })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 200);
    return () => {
      alive = false;
      clearInterval(t);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    const isl = document.getElementById("island") as HTMLElement | null;
    if (!isl) return;
    if (!show) {
      isl.removeAttribute("data-edge");
      isl.removeAttribute("data-sweep");
      return;
    }
    const fresh = !isl.hasAttribute("data-edge");
    isl.setAttribute("data-edge", "level");
    isl.style.setProperty("--edge", show.tone);
    isl.style.setProperty("--edge-glow", show.glow);
    isl.style.setProperty("--fill", String(show.pct));
    if (fresh) {
      // one start→end run, then park on the seamless ring.
      isl.setAttribute("data-sweep", "");
      setTimeout(() => isl.removeAttribute("data-sweep"), 950);
    }
  }, [show]);
  return null;
}

// Nicki groove: while any player runs, the island mascot bobs on the
// beat (hop edges kick, --e rides bounce height) — same contract as
// Daily's dancer. Silent when nothing plays (no parec otherwise).
function NickiGroove({ mascotRef }: { mascotRef: React.Ref<MascotHandle> }) {
  useEffect(() => {
    let alive = true;
    let energyTimer: ReturnType<typeof setInterval> | null = null;
    const handle = (): MascotHandle | null => {
      const r = mascotRef as { current?: MascotHandle | null } | null;
      return r && typeof r === "object" ? (r.current ?? null) : null;
    };
    const energyTick = () => {
      fetch(`${window.location.origin}/audio-energy`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          const h = handle();
          if (!h) return;
          const e = typeof j?.energy === "number" ? Math.max(0, Math.min(1, j.energy)) : 0;
          h.groove(true, e);
          if (j?.hop) h.hop();
        })
        .catch(() => {});
    };
    const slowTick = () => {
      fetch(`${window.location.origin}/nowplaying`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          if (j?.playing === true && !energyTimer) {
            energyTick();
            energyTimer = setInterval(energyTick, 150);
          } else if (j?.playing !== true && energyTimer) {
            clearInterval(energyTimer);
            energyTimer = null;
            handle()?.groove(false, 0);
          }
        })
        .catch(() => {});
    };
    slowTick();
    const slow = setInterval(slowTick, 3000);
    return () => {
      alive = false;
      clearInterval(slow);
      if (energyTimer) clearInterval(energyTimer);
      try { handle()?.groove(false, 0); } catch { /* unmounted */ }
    };
  }, [mascotRef]);
  return null;
}

interface Props {
  fsmState: IslandState;
  view: IslandView;
  mascotRef: React.Ref<MascotHandle>;
  routeHint: string;
  /** Command Echo: transient "Copied — …" preview; pill swells, melts back. */
  echo?: string | null;
  approval: Approval | null;
  question: Question | null;
  messages: ChatMessage[];
  thinking: boolean;
  liveActivity?: string | null;
  livePartial?: string | null;
  turnEngine?: string;
  lastThought?: { secs: number; label: string } | null;
  onStop?: () => void;
  liveSession?: string | null;
  attachments: Attachment[];
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (id: number) => void;
  shots: Shot[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onIslandClick?: (e: React.MouseEvent) => void;
  onMascotTap: (taps: number) => void;
  onDecide: (d: string) => void;
  onAnswer: (a: string[]) => void;
  onSend: (t: string, provider?: string, opts?: { model: string; effort: string }, filesOverride?: Attachment[] | null) => void;
  onEditMessage?: (id: number) => void;
  sessions: ChatSession[];
  histHint?: string | null;
  activeSessionId: number | null;
  onResumeSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
  onNewChat: () => void;
  agentSessions: AgentSession[];
  onResumeAgentSession: (sid: string, first: string) => void;
  onDeleteAgentSession: (sid: string) => void;
  onRefreshSessions?: () => void;
  exploreLive: boolean;
  providers?: { opencode: boolean; claude: boolean } | null;
  installState?: "idle" | "working" | "error";
  onInstall?: () => void;
  exploreFeed: ExploreFeed | null;
  feedEvents: FeedEvent[];
  onSearchSkills: (q: string) => Promise<SkillHit[]>;
  settings: SettingsState;
  settingsPage?: SettingsPage;
  onSettingsPage?: (p: SettingsPage) => void;
  zoomShot: string | null;
  // stepped-glow frame (PC strip only): measured px box + notch half-width.
  // Renders the glance amber outline tracing the steps — CSS can't do it.
  frame?: { w: number; h: number; n: number } | null;
  onSettings: (s: SettingsState) => void;
  onTab: (v: IslandView) => void;
  unread: number;
  onDropToPhone?: () => void;
  onDropFilesToPhone?: (files: File[]) => void;
  phoneLinked?: boolean;
  pairNode?: React.ReactNode;
  accountNode?: React.ReactNode;
  shelfNode?: React.ReactNode;
  staged?: Array<{ file: File; url: string }>;
  onAttachStaged?: (file: File) => void;
  accountEmail?: string | null;
  accountAvatar?: string | null;
  onSignOut?: () => void;
}

// ponytail: neon on — glance light studies (glow trace, halos, level ring).
// One flag restores the edge ring; off = plain border, no polling, no sweep.
const NEON_ON = true;

// Island shell — steroids spotter bar. Ranked routes, plate snap.
const Island = forwardRef<HTMLDivElement, Props>(function Island(props, ref) {
  const {
    fsmState, view, mascotRef, routeHint, echo = null,
    approval, question, messages, thinking, liveActivity, livePartial, turnEngine, attachments,
    onFiles, onRemoveAttachment, shots,
    onMouseEnter, onMouseLeave, onMascotTap,
    onDecide, onAnswer, onSend, onEditMessage, liveSession = null, lastThought = null, onStop,
    sessions, activeSessionId, onResumeSession, onDeleteSession, onNewChat,
    histHint = null,
    agentSessions, onResumeAgentSession, onDeleteAgentSession,
    exploreLive, exploreFeed, feedEvents, onSearchSkills,
    providers = null, installState = "idle", onInstall = () => {},
    settings, onSettings, onTab, unread, zoomShot,
    settingsPage = "general", onSettingsPage = () => {},
    onDropToPhone, onDropFilesToPhone, phoneLinked, pairNode, accountNode, shelfNode,
    staged = [], onAttachStaged,
    accountEmail = null, accountAvatar = null, onSignOut = () => {}, onIslandClick,
    frame = null,
  } = props;
  // glance light trace: one thin amber line hugging the closed pill's
  // bottom OUTSIDE edge (inside the black card it drowns; only halo spilled).
  // Inset past the pill's corner radius so it never pokes past the curves.
  // Overflow paints past the svg box — that spill IS the look.
  const glowD = frame
    ? `M18 ${frame.h + 1} H${Math.max(20, frame.w - 18)}`
    : "";

  // Avatar menu jumps: everything but Phone lands on the one General
  // page (account section on top); Profile scrolls straight to it.
  // Huddle: chat crew shares one team instance (tiles + huddle read the
  // same roster). Empty-state hero: visible on empty chat, gone the moment
  // the first message sends; new chat brings it back.
  const team = useTeam();
  const showHuddle = messages.length === 0;
  const avatarNav = (page: "profile" | "explore" | "settings" | "account" | "phone") => {
    if (page === "explore") {
      onTab("explore");
      return;
    }
    onSettingsPage(page === "phone" ? "phone" : "general");
    onTab("settings");
    if (page === "profile" || page === "account") {
      setTimeout(() => {
        document.querySelector("#island-account")?.scrollIntoView({ block: "start" });
      }, 60);
    }
  };

  return (
    <>
      {NEON_ON && <EdgeGlow />}
      <NickiGroove mascotRef={mascotRef} />
    <div
      ref={ref}
      id="island"
      data-state={fsmState}
      data-view={view}
      data-glow={NEON_ON ? (approval || question ? "urgent" : thinking ? "working" : undefined) : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onIslandClick}
    >
      {NEON_ON && frame && fsmState !== "jacked" && (
        <svg className="notch-frame" viewBox={`0 0 ${frame.w} ${frame.h}`} aria-hidden>
          <defs>
            <filter id="notchGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path d={glowD} fill="none" stroke="rgba(251,146,60,.16)" strokeWidth="4" strokeLinejoin="round" />
          <path d={glowD} fill="none" stroke="#ffe9b8" strokeWidth="1.4" strokeLinejoin="round" filter="url(#notchGlow)" />
        </svg>
      )}
      {fsmState !== "jacked" && <Mascot key={fsmState} ref={mascotRef} px={8} onTap={onMascotTap} />}
      {fsmState === "hidden" ? null : fsmState === "jacked" ? (
        <div className="jacked-body">
          <Header
            view={view}
            unread={unread}
            onTab={onTab}
            hiddenViews={settings.hiddenViews}
            sessions={sessions}
            histHint={histHint}
            activeSessionId={activeSessionId}
            onResumeSession={onResumeSession}
            onDeleteSession={onDeleteSession}
            onNewChat={onNewChat}
            agentSessions={agentSessions}
            onResumeAgent={onResumeAgentSession}
            onDeleteAgent={onDeleteAgentSession}
            email={accountEmail}
            avatarUrl={accountAvatar}
            onAvatarNav={avatarNav}
            settingsPage={settingsPage}
            approval={approval}
            question={question}
            onSignOut={onSignOut}
            soundOn={settings.soundOn}
            onToggleSound={() => onSettings({ ...settings, soundOn: !settings.soundOn })}
          />
          {/* Command Echo: open panel uses this space for the copy preview. */}
          {echo ? (
            <div className="echo-banner" role="status">📋 Copied — {echo}</div>
          ) : null}
          {view !== "daily" && view !== "chat" && (
            <div className="mascot-top">
              <Mascot key={fsmState} ref={mascotRef} px={8} onTap={onMascotTap} />
            </div>
          )}
          {view === "settings" && (
            <SettingsView settings={settings} onChange={onSettings} pair={pairNode} extra={accountNode} page={settingsPage} onPage={onSettingsPage} />
          )}
          {view === "explore" && (
            <ExploreView
              live={exploreLive}
              feed={exploreFeed}
              onSearch={onSearchSkills}
              onPickSkill={(label) => onSend(`What can ${label} do?`, undefined, undefined, [])}
              agentSessions={agentSessions}
              onResumeAgent={onResumeAgentSession}
            />
          )}
          {view === "feed" && (
            <FeedView events={feedEvents} />
          )}
          {view === "approval" && (approval ? (
            <ApprovalCard approval={approval} onDecide={onDecide} />
          ) : (
            <div className="card">
              <div className="card-title">Nothing waiting</div>
              <div className="card-detail">The request cleared somewhere else.</div>
              <div className="btn-row">
                <button className="primary" onClick={() => onTab("chat")}>Back to chat</button>
              </div>
            </div>
          ))}
          {view === "question" && (question ? (
            <QuestionCard question={question} onAnswer={onAnswer} />
          ) : (
            <div className="card">
              <div className="card-title">Nothing waiting</div>
              <div className="card-detail">The question cleared somewhere else.</div>
              <div className="btn-row">
                <button className="primary" onClick={() => onTab("chat")}>Back to chat</button>
              </div>
            </div>
          ))}
          {view === "chat" && (
            <ChatPanel
              messages={messages}
              onSend={onSend}
              onEditMessage={onEditMessage}
              threadKey={activeSessionId ?? "live"}
              thinking={thinking}
              attachments={attachments}
              onFiles={onFiles}
              onRemoveAttachment={onRemoveAttachment}
              onDropToPhone={onDropToPhone}
              onDropFilesToPhone={onDropFilesToPhone}
              phoneLinked={phoneLinked}
              bridgeOn={exploreLive}
              liveActivity={liveActivity}
              livePartial={livePartial}
              turnEngine={turnEngine}
              lastThought={lastThought}
              onStop={onStop}
              liveSession={liveSession}
              providers={providers}
              installState={installState}
              onInstall={onInstall}
              teamNode={
                <div className="team-mini">
                  {showHuddle && (
                    <Huddle
                      lite={false}
                    />
                  )}
                  {/* crew rail: the huddle above is nicki's hello (crew ready),
                      the grid below leads with nicki, then the mates. */}
                  <TeamGrid team={team} sessions={agentSessions} onResume={onResumeAgentSession} onPick={onResumeAgentSession} detail="none" compact={messages.length > 0} />
                </div>
              }
            />
          )}
          {view === "lens" && (
            <Suspense fallback={<div className="card"><div className="card-detail">Opening lens…</div></div>}>
              <LensView shots={shots} initialZoom={zoomShot} staged={staged} onAttachStaged={onAttachStaged} agentSessions={agentSessions} onResumeAgent={onResumeAgentSession} />
            </Suspense>
          )}
          {view === "daily" && (
            <Suspense fallback={<HomeSkeleton />}>
              <DailyView agentSessions={agentSessions} onResumeAgent={onResumeAgentSession} onGoChat={() => onTab("chat")} />
            </Suspense>
          )}
          {view === "shelf" && shelfNode}
          {view === "finished" && (
            <div className="card finished">
              <div className="card-title">Route complete ✓</div>
              <div className="stat-row">
                <span><b>0.4s</b> latency</span>
                <span><b>local</b> only</span>
                <span><b>0</b> cloud calls</span>
              </div>
              <div className="card-detail">Spotter logged it.</div>
              <div className="btn-row">
                <button className="primary" onClick={() => onTab("explore")}>Back to Explore</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* minimized pill: echo preview swells it, else nicki + mates grid. */}
          {echo ? (
            <span className="pill-echo" role="status" aria-live="polite">📋 {echo}</span>
          ) : (
          <span className="pill-team mini-grid" title={routeHint} aria-hidden>
            {team.members.slice(0, 4).map((m) => (
              <span key={m.id} className="pill-face" title={m.name} style={{ filter: `hue-rotate(${hueFor(m.color)}deg)` }}>
                <Mascot mood="neutral" />
              </span>
            ))}
          </span>
          )}
        </>
      )}
    </div>
    </>
  );
});

export default Island;
