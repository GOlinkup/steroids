import { forwardRef } from "react";
import Mascot, { type MascotHandle } from "./Mascot";
import type { SettingsState, SettingsPage } from "./Cards";
import { MausViews, type MausNavView } from "../maus/MausViews";
import type { AgentSession, Approval, Attachment, ChatMessage, ChatSession, ExploreFeed, FeedEvent, IslandView, Question, SkillHit } from "../store";
import type { GigListing } from "../money";
import type { IslandState } from "../fsm";

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

// Any non-Maus view lands on the Maus home (team). The sheet is Steroids,
// everything inside it is Maus — no Steroids content renders here.
function toMaus(view: IslandView): MausNavView {
  if (view === "bots" || view === "computer" || view === "routines" || view === "chat") return view;
  return "chat";
}

// Island shell — the sheet only. Pill states carry the mascot, the jacked
// sheet carries Maus. Nothing Steroids renders inside.
const Island = forwardRef<HTMLDivElement, Props>(function Island(props, ref) {
  const {
    fsmState, view, foot = "", mascotRef,
    onMouseEnter, onMouseLeave, onMascotTap,
    onTab, onIslandClick,
  } = props;

  return (
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
      {fsmState !== "jacked" ? (
        <Mascot key={fsmState} ref={mascotRef} px={8} mood="wave" onTap={onMascotTap} />
      ) : (
        <div className="jacked-body">
          <MausViews view={toMaus(view)} onNavigate={onTab} />
        </div>
      )}
    </div>
  );
});

export default Island;
