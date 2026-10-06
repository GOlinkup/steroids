import { forwardRef } from "react";
import Mascot, { type MascotHandle } from "./Mascot";
import { ApprovalCard, QuestionCard, ChatPanel, ExploreView, SettingsView, type SettingsState } from "./Cards";
import { Header } from "./Header";
import { DailyView } from "./Daily";
import { LensView, type Shot } from "./LensView";
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
  attachments: Attachment[];
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (id: number) => void;
  onOpenLens: () => void;
  shots: Shot[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onMascotTap: (taps: number) => void;
  onDecide: (d: string) => void;
  onAnswer: (a: string[]) => void;
  onSend: (t: string, provider?: string, opts?: { model: string; effort: string }) => void;
  sessions: ChatSession[];
  activeSessionId: number | null;
  onResumeSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
  onNewChat: () => void;
  agentSessions: AgentSession[];
  onResumeAgentSession: (sid: string, first: string) => void;
  exploreLive: boolean;
  exploreFeed: ExploreFeed | null;
  onSearchSkills: (q: string) => Promise<SkillHit[]>;
  settings: SettingsState;
  zoomShot: string | null;
  onSettings: (s: SettingsState) => void;
  onTab: (v: IslandView) => void;
  unread: number;
  onDropToPhone?: () => void;
  phoneLinked?: boolean;
  queuedDrops?: number;
  pairNode?: React.ReactNode;
}

// Island shell — steroids spotter bar. Ranked routes, plate snap.
const Island = forwardRef<HTMLDivElement, Props>(function Island(props, ref) {
  const {
    fsmState, view, mascotRef, routeHint,
    approval, question, messages, thinking, attachments,
    onFiles, onRemoveAttachment, onOpenLens, shots,
    onMouseEnter, onMouseLeave, onMascotTap,
    onDecide, onAnswer, onSend,
    sessions, activeSessionId, onResumeSession, onDeleteSession, onNewChat,
    agentSessions, onResumeAgentSession,
    exploreLive, exploreFeed, onSearchSkills,
    settings, onSettings, onTab, unread, zoomShot,
    onDropToPhone, phoneLinked, queuedDrops, pairNode,
  } = props;

  return (
    <div
      ref={ref}
      id="island"
      data-state={fsmState}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Mascot key={fsmState} ref={mascotRef} px={8} onTap={onMascotTap} />
      {fsmState === "hidden" ? null : fsmState === "jacked" ? (
        <div className="jacked-body">
          <Header
            view={view}
            unread={unread}
            onTab={onTab}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onResumeSession={onResumeSession}
            onDeleteSession={onDeleteSession}
            onNewChat={onNewChat}
          />
          {view === "settings" && (
            <SettingsView settings={settings} onChange={onSettings} pair={pairNode} />
          )}
          {view === "explore" && (
            <ExploreView
              live={exploreLive}
              feed={exploreFeed}
              onSearch={onSearchSkills}
              onPickSkill={(label) => onSend(`What can ${label} do?`)}
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
              onOpenLens={onOpenLens}
              onDropToPhone={onDropToPhone}
              phoneLinked={phoneLinked}
              queuedDrops={queuedDrops}
              liveShots={shots}
            />
          )}
          {view === "lens" && <LensView shots={shots} initialZoom={zoomShot} />}
          {view === "daily" && <DailyView />}
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
