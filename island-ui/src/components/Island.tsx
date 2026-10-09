import { forwardRef, lazy, Suspense, useEffect, useRef, useState } from "react";
import Mascot, { type MascotHandle } from "./Mascot";
import { ApprovalCard, QuestionCard, ChatPanel, ExploreView, SettingsView, type SettingsState, type SettingsPage } from "./Cards";
import { TeamGrid, useTeam } from "./TeamGrid";
import Huddle from "./Huddle";
import { Header } from "./Header";
// ponytail: lens + daily ride separate chunks — default chat view stays lean,
// vite warns over 500KB and these views load on tab tap, never at boot.
const DailyView = lazy(() => import("./Daily").then((m) => ({ default: m.DailyView })));
const LensView = lazy(() => import("./LensView").then((m) => ({ default: m.LensView })));
import { HomeSkeleton } from "./HomeSkeleton";
import type { Shot } from "./LensView";
import type { AgentSession, Approval, Attachment, ChatMessage, ChatSession, ExploreFeed, IslandView, Question, SkillHit } from "../store";
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

interface Props {
  fsmState: IslandState;
  view: IslandView;
  mascotRef: React.Ref<MascotHandle>;
  routeHint: string;
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
  onIslandClick?: () => void;
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
  onSearchSkills: (q: string) => Promise<SkillHit[]>;
  settings: SettingsState;
  settingsPage?: SettingsPage;
  onSettingsPage?: (p: SettingsPage) => void;
  zoomShot: string | null;
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

// Island shell — steroids spotter bar. Ranked routes, plate snap.
const Island = forwardRef<HTMLDivElement, Props>(function Island(props, ref) {
  const {
    fsmState, view, mascotRef, routeHint,
    approval, question, messages, thinking, liveActivity, livePartial, turnEngine, attachments,
    onFiles, onRemoveAttachment, shots,
    onMouseEnter, onMouseLeave, onMascotTap,
    onDecide, onAnswer, onSend, onEditMessage, liveSession = null, lastThought = null, onStop,
    sessions, activeSessionId, onResumeSession, onDeleteSession, onNewChat,
    histHint = null,
    agentSessions, onResumeAgentSession, onDeleteAgentSession,
    exploreLive, exploreFeed, onSearchSkills,
    providers = null, installState = "idle", onInstall = () => {},
    settings, onSettings, onTab, unread, zoomShot,
    settingsPage = "general", onSettingsPage = () => {},
    onDropToPhone, onDropFilesToPhone, phoneLinked, pairNode, accountNode, shelfNode,
    staged = [], onAttachStaged,
    accountEmail = null, accountAvatar = null, onSignOut = () => {}, onIslandClick,
  } = props;

  // Avatar menu jumps: everything but Phone lands on the one General
  // page (account section on top); Profile scrolls straight to it.
  // Huddle: chat crew shares one team instance (tiles + huddle read the
  // same roster). Empty-state hero: visible on empty chat, gone the moment
  // the first message sends; new chat brings it back.
  const team = useTeam();
  const showHuddle = messages.length === 0;
  const huddleChip = (kind: "bridge" | "agent" | "phone") => {
    // red phone chip deep-links to pairing; bridge/agent are status only
    // (the chat setup card below owns the installer).
    if (kind === "phone") {
      onSettingsPage("phone");
      onTab("settings");
    }
  };
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
      <EdgeGlow />
    <div
      ref={ref}
      id="island"
      data-state={fsmState}
      data-view={view}
      data-glow={approval || question ? "urgent" : thinking ? "working" : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onIslandClick}
    >
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
          />
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
          {view === "approval" && approval && (
            <ApprovalCard approval={approval} onDecide={onDecide} />
          )}
          {view === "question" && question && (
            <QuestionCard question={question} onAnswer={onAnswer} />
          )}
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
                      chips={{
                        bridge: exploreLive,
                        agent: providers ? (providers.opencode || providers.claude) : exploreLive,
                        phone: !!phoneLinked,
                      }}
                      lite={false}
                      onChip={huddleChip}
                      onDone={() => {}}
                    />
                  )}
                  {/* crew rail: the huddle above is nicki's hello (crew ready),
                      the grid below is the mates — neither lists the other. */}
                  <TeamGrid team={team} sessions={agentSessions} onResume={onResumeAgentSession} detail="none" compact={messages.length > 0} />
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
        <div className="pill"><b>steroids</b> <span>{routeHint}</span></div>
      )}
    </div>
    </>
  );
});

export default Island;
