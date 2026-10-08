import { forwardRef, lazy, Suspense } from "react";
import Mascot, { type MascotHandle } from "./Mascot";
import { ApprovalCard, QuestionCard, ChatPanel, ExploreView, SettingsView, type SettingsState, type SettingsPage } from "./Cards";
import { Header } from "./Header";
// ponytail: lens + daily ride separate chunks — default chat view stays lean,
// vite warns over 500KB and these views load on tab tap, never at boot.
const DailyView = lazy(() => import("./Daily").then((m) => ({ default: m.DailyView })));
const LensView = lazy(() => import("./LensView").then((m) => ({ default: m.LensView })));
import type { Shot } from "./LensView";
import type { AgentSession, Approval, Attachment, ChatMessage, ChatSession, ExploreFeed, IslandView, Question, SkillHit } from "../store";
import type { IslandState } from "../fsm";

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
  attachments: Attachment[];
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (id: number) => void;
  onAdoptAttachments: (atts: Attachment[]) => void;
  onOpenLens: () => void;
  shots: Shot[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onIslandClick?: () => void;
  onMascotTap: (taps: number) => void;
  onDecide: (d: string) => void;
  onAnswer: (a: string[]) => void;
  onSend: (t: string, provider?: string, opts?: { model: string; effort: string }, filesOverride?: Attachment[] | null) => void;
  sessions: ChatSession[];
  activeSessionId: number | null;
  onResumeSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
  onNewChat: () => void;
  agentSessions: AgentSession[];
  onResumeAgentSession: (sid: string, first: string) => void;
  onDeleteAgentSession: (sid: string) => void;
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
    onFiles, onRemoveAttachment, onAdoptAttachments, onOpenLens, shots,
    onMouseEnter, onMouseLeave, onMascotTap,
    onDecide, onAnswer, onSend,
    sessions, activeSessionId, onResumeSession, onDeleteSession, onNewChat,
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
    <div
      ref={ref}
      id="island"
      data-state={fsmState}
      data-view={view}
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
          {view !== "daily" && (
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
              thinking={thinking}
              attachments={attachments}
              onFiles={onFiles}
              onRemoveAttachment={onRemoveAttachment}
              onAdoptAttachments={onAdoptAttachments}
              onOpenLens={onOpenLens}
              onDropToPhone={onDropToPhone}
              onDropFilesToPhone={onDropFilesToPhone}
              phoneLinked={phoneLinked}
              liveShots={shots}
              bridgeOn={exploreLive}
              liveActivity={liveActivity}
              livePartial={livePartial}
              turnEngine={turnEngine}
              providers={providers}
              installState={installState}
              onInstall={onInstall}
            />
          )}
          {view === "lens" && (
            <Suspense fallback={<div className="card"><div className="card-detail">Opening lens…</div></div>}>
              <LensView shots={shots} initialZoom={zoomShot} staged={staged} onAttachStaged={onAttachStaged} agentSessions={agentSessions} onResumeAgent={onResumeAgentSession} />
            </Suspense>
          )}
          {view === "daily" && (
            <Suspense fallback={<div className="card"><div className="card-detail">Opening daily…</div></div>}>
              <DailyView agentSessions={agentSessions} onResumeAgent={onResumeAgentSession} />
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
  );
});

export default Island;
