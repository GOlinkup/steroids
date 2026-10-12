import { forwardRef, useEffect, useRef, useState } from "react";
import Mascot, { type MascotHandle } from "./Mascot";
import { ApprovalCard, QuestionCard, type SettingsState, type SettingsPage } from "./Cards";
import { TeamMinis, useTeam } from "./TeamGrid";
import { fetchNowPlaying } from "../music";
import { Header } from "./Header";
import { MausViews, type MausNavView } from "../maus/MausViews";
// ponytail: lens + daily ride separate chunks — default chat view stays lean,
// vite warns over 500KB and these views load on tab tap, never at boot.
import type { AgentSession, Approval, Attachment, ChatMessage, ChatSession, ExploreFeed, FeedEvent, IslandView, Question, SkillHit } from "../store";
import type { GigListing } from "../money";
import type { IslandState } from "../fsm";

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
  /** Fixed-footprint name (mirrors main.js table) — drives per-view body caps. */
  foot?: string;
  mascotRef: React.Ref<MascotHandle>;
  routeHint: string;
  /** Copy/paste popup: transient "Copied/Pasted — …" preview in the navbar middle. Plain, no neon. */
  echo?: string | null;
  echoKind?: "copied" | "pasted";
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
  // hover is DOM-driven (Linux has no cursor click-through API, so the
  // poll model can't run here; the strip fits the pill, always hoverable).
  shots: Array<{ name: string; src: string; label: string; time: string }>;
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
  onBackToNicki?: () => void;
  onDeleteAgentSession: (sid: string) => void;
  onRefreshSessions?: () => void;
  exploreLive: boolean;
  providers?: { opencode: boolean; claude: boolean } | null;  installState?: "idle" | "working" | "error";
  onInstall?: () => void;
  exploreFeed: ExploreFeed | null;
  gigs?: GigListing[];
  gigNotice?: string | null;
  onPickGig?: (id: string) => void;
  feedEvents: FeedEvent[];
  onSearchSkills: (q: string) => Promise<SkillHit[]>;
  settings: SettingsState;
  provider: string;
  onProvider: (id: string) => void;
  settingsPage?: SettingsPage;  onSettingsPage?: (p: SettingsPage) => void;
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

// Island shell — steroids spotter bar. Ranked routes, plate snap.
const Island = forwardRef<HTMLDivElement, Props>(function Island(props, ref) {
  const {
    fsmState, view, foot = "", mascotRef, routeHint, echo = null, echoKind = "copied",
    approval, question,
    onMouseEnter, onMouseLeave, onMascotTap,
    onDecide, onAnswer,
    sessions, activeSessionId, onResumeSession, onDeleteSession, onNewChat,
    histHint = null,
    agentSessions, onResumeAgentSession, onDeleteAgentSession,
    settings, onSettings, onTab, unread,
    settingsPage = "general", onSettingsPage = () => {},
    accountEmail = null, accountAvatar = null, onSignOut = () => {}, onIslandClick,
  } = props;
  // glance light trace retired (see render below) — no path needed.

  // Avatar menu jumps: everything but Phone lands on the one General
  // page (account section on top); Profile scrolls straight to it.
  // Huddle: chat crew shares one team instance (tiles + huddle read the
  // same roster). Empty-state hero: visible on empty chat, gone the moment
  // the first message sends; new chat brings it back.
  // music-mode pill: while a track plays, the 4-mate grid steps aside
  // for nicki's wave (same 3s rhythm as the groove poll, one cheap fetch).
  const team = useTeam();
  const [musicLive, setMusicLive] = useState(false);
  useEffect(() => {
    let dead = false;
    const poll = () => {
      fetchNowPlaying(window.location.origin, fetch)
        .then((n) => { if (!dead) setMusicLive(n.playing); })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { dead = true; clearInterval(t); };
  }, []);
  // mini EQ loudness: while minimized + playing, ride --e off the same
  // /audio-energy tap the Daily dancer uses (150ms, silent when idle).
  const eqRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!musicLive || fsmState === "jacked") return;
    let dead = false;
    const tick = () => {
      fetch(`${window.location.origin}/audio-energy`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (dead) return;
          const e = typeof j?.energy === "number" ? Math.max(0, Math.min(1, j.energy)) : 0;
          eqRef.current?.style.setProperty("--e", e.toFixed(2));
        })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 150);
    return () => { dead = true; clearInterval(t); };
  }, [musicLive, fsmState]);
  // level pill number: glides to each new destination (volume keys land in
  // steps) instead of jumping. Runs at top level; hidden pills ignore it.
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
      <NickiGroove mascotRef={mascotRef} />
    <div
      ref={ref}
      id="island"
      data-state={fsmState}
      data-view={view}
      data-foot={foot || undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onIslandClick}
    >
      {fsmState !== "jacked" && <Mascot key={fsmState} ref={mascotRef} px={8} mood="wave" onTap={onMascotTap} />}
      {fsmState === "hidden" ? null : fsmState === "jacked" ? (
        <>
          {/* ponytail: one nav only — the Maus sidebar owns the top, our bar
              (history dates, bell, profile) rides BELOW the frame. */}
          <div className="jacked-body">
          {(view === "maus" || view === "bots" || view === "computer" || view === "routines") && (
            <MausViews view={view as MausNavView} onNavigate={onTab} />
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
        </div>
          <Header
            view={view}
            unread={unread}
            onTab={onTab}
            hiddenViews={settings.hiddenViews}
            middle={echo ? (
              <span className="nav-echo" role="status">✓ {echoKind === "pasted" ? "Pasted" : "Copied"} — {echo}</span>
            ) : undefined}
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
        </>
      ) : (
        <>
          {/* minimized pill: nicki + mates grid. Playing: one mascot
              only (human order — no double buddy), voice wave rides right. */}
          {musicLive ? (
            <span ref={eqRef} className="gemwave" title="now playing" aria-hidden>
              <i /><i /><i /><i /><i />
            </span>
          ) : (
          <TeamMinis members={team.members} title={routeHint} />
          )}
        </>
      )}
    </div>
    </>
  );
});

export default Island;
