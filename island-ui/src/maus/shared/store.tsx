// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// Server-backed store. The React app holds no transports of its own:
// it dispatches typed commands over HTTP and folds the one SSE event
// stream from the harness server into local state. The reducer stays
// pure; everything async lives in the wrapped dispatch + SSE fold.
//
// NOTE (Steroids island): hard trim of state/store.tsx (4438 lines) to what
// the Bots / Routines / Computers screens use. KEPT with identical behavior:
// types, api()/ApiError, reducer cases + HTTP side effects for the actions
// the screens dispatch, the SSE fold for bot/group/routine/webhook/config/
// computer frames, bot-patch queueing, task patching, thread switching.
// DROPPED (ChatView/Sidebar/Settings/Call/Data surfaces, not ported):
// message transcript folding (messageAdded/messagePatched/scrollback),
// send/edit/cards/queue/project/newBot/deleteBot-interactive flows, live
// calls, TTS auto-speak, desktop notifications, data sheets, focus-message,
// model-variant sessions, queue tombstones, background-thread replay,
// instance refresh probes. Dropped SSE kinds are ignored, never crash.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { BotVisibility, CardAnswerer, CloudBackend, ConnectorToolGrant, EffortLevel, GroupThreadUsage, InstalledPackageMetadata, LiveSettings, ServerFrame } from "./wire/wire";
import type { TurnDigest } from "./wire/digest";
import type { ToolScope } from "./wire/tool-scope";
import type { BotAvatarCrop } from "./wire/bot-avatar";
import { approvalModeFor, type ApprovalMode } from "./wire/approval-mode";
import type { MascotBodyId } from "./wire/mascot-bodies";
import type { QuestionRequestCardData } from "./wire/ask-question";
import type { ProfileRequestCardData } from "./wire/profile-request";
import type { ModelRequestCardData } from "./wire/model-request";
import type { RoutineRequestCardData } from "./wire/routine-request";
import type { SkillRequestCardData } from "./wire/skill-request";
import type { RoutineRunCardData } from "./wire/routine-run";
import type { GroupGoalRunCardData } from "./wire/group-goal-run";
import type { PlaceRow } from "./wire/place-view";
import type { Routine, RoutineInput, RoutineRun, RoutineRunStatusFilter } from "./routines";
import type { WebhookAttempt, WebhookIngressStatus, WebhookTrigger } from "./wire/webhooks";
import { botShowsUnread } from "./bot-unread";
import { firstUnreadMessageId, threadOpensUnread, threadReadCursor } from "./unread-divider";
import type { ComputerStart } from "./computer-start";
import { readLastConversation, rememberConversation } from "./last-conversation";
import { readLastBotSection, rememberBotSection } from "./last-bot-section";
import { useShowThreads } from "./thread-preferences";
import { createBotPatchQueue, type BotUpdatePatch } from "./bot-patch-queue";
import { useChatErrorClear } from "./chat-error";
import type { OnboardingStatus } from "./onboarding-status";
import { openLiveEvents, publishLiveFrame, publishMissedFrames } from "./live-events";

const MAX_ROUTINE_RUNS = 2_000;
const ACTIVE_ROUTINE_RUN_STATUSES = new Set<RoutineRun["status"]>(["queued", "running", "waiting"]);

function trimRoutineRuns(runs: readonly RoutineRun[]): RoutineRun[] {
  const sorted = [...runs].sort((a, b) => b.scheduledFor - a.scheduledFor);
  if (sorted.length <= MAX_ROUTINE_RUNS) return sorted;
  const activeCount = sorted.reduce(
    (count, run) => count + (ACTIVE_ROUTINE_RUN_STATUSES.has(run.status) ? 1 : 0),
    0,
  );
  let terminalSlots = Math.max(0, MAX_ROUTINE_RUNS - activeCount);
  return sorted.filter((run) => {
    if (ACTIVE_ROUTINE_RUN_STATUSES.has(run.status)) return true;
    if (terminalSlots === 0) return false;
    terminalSlots -= 1;
    return true;
  });
}

export type { MausColor } from "./mascot";
export type { RoutineRunCardData } from "./wire/routine-run";

export interface OptionCardData {
  title: string;
  subtitle: string;
  options: string[];
  /** Distinguishes a provider question from an approval after its live run ends. */
  requestType?: "permission" | "question";
  /** what each option means, keyed by its label — a question that came with
   * explanations (AskUserQuestion) shows them under the buttons. Kept beside
   * `options` rather than inside it so every existing reader of the plain
   * label list keeps working untouched. */
  optionHints?: Record<string, string>;
  /** the question takes more than one option; `answered` is then the chosen
   * labels joined with ", ", which is the format the asking tool expects */
  multiSelect?: boolean;
  answered?: string;
  /** The words an answered question card was answered with — `answered`
   * only holds the behavior once the server settles a live ask. */
  answeredText?: string;
  /** Who settled the card; `via: "call"` when it was decided by voice on a Live call. */
  answeredBy?: CardAnswerer;
  dismissed?: boolean;
  /** Present when this card is a live provider ask (approval/question). */
  requestId?: string;
  /** permission asks: the tool being requested (drives the approval box) */
  tool?: string;
  /** why auto mode stopped to ask anyway */
  held?: string;
  /** Terminal: this proposal went stale while open (revision mismatch or
   * a superseding request). Nothing can answer it; a fresh proposal is
   * needed, and clients must not offer its options. */
  expired?: boolean;
  /** catalog key for `held` when it is a fixed note, so it reads in the
   * viewer's language; absent for free-text errors and older cards */
  heldCode?: string;
  /** the narrow grant "always allow" remembers, e.g. "Bash:git" */
  allowKey?: string;
  allowSession?: boolean;
  /** Exact provider command eligible for a durable, folder-scoped allow. */
  commandAllowlist?: { command: string; cwd: string; providerInstanceId: string };
  approvalScope?: "local-computer";
  /** The bot's change applied without a person (a change to itself, or Full
   * access): shown as one line with Undo instead of the approval box. */
  autoApplied?: boolean;
  /** A person undid that change. */
  undone?: boolean;
  /** Persisted proposal used by the server when the user confirms it. */
  routineRequest?: RoutineRequestCardData;
  /** Staged learned-skill change; applied only after the user confirms this card. */
  skillRequest?: SkillRequestCardData;
  /** calls: one per outbound call the card covers, in subtitle order. Absent
   * on cards from older computers. */
  outboundRequest?: { tool: string; app: string | null; calls?: Array<{ app: string | null; label: string }> };
  teamMemoryRequest?: { section: string; entryId: string; kind: string };
  /** Persisted profile proposal used by the server when the user confirms it. */
  profileRequest?: ProfileRequestCardData;
  /** Persisted default-model proposal used by the server when the user confirms it. */
  modelRequest?: ModelRequestCardData;
  teamSetupRequest?: import("./wire/team-setup").TeamSetupRequest;
  /** The model's own questions and options (Claude's AskUserQuestion), so
   * the card offers choices instead of an unanswerable Allow/Deny. */
  questionRequest?: QuestionRequestCardData;
}

export interface ConnectorCardData {
  slug: string;
  label: string;
  description: string;
  status: "required" | "authorizing" | "connected" | "failed";
  resumeKey: string;
  alias?: string;
  error?: string;
  dismissed?: boolean;
  resumed?: boolean;
}

export interface SecretRequestCardData {
  target: import("./wire/credential-request").CredentialTargetId;
  label: string;
  description: string;
  placeholder: string;
  helpUrl: string;
  requestKey: string;
  provided?: boolean;
  dismissed?: boolean;
  /** A newer request for the same credential replaced this card; it no
   * longer offers entry and cannot be provided or dismissed. */
  superseded?: boolean;
  resumed?: boolean;
  error?: string;
}

export interface Message {
  id: string;
  role: "bot" | "user";
  kind: "text" | "options" | "activity" | "screen" | "connector" | "secret" | "routine.run" | "goal.run" | "digest" | "compaction";
  text?: string;
  /** digest messages: what the turn did, rendered in `text` and structured here. */
  digest?: TurnDigest;
  compaction?: import("./wire/wire").WireMessage["compaction"];
  /** Files attached to this assistant response: provider-generated images, and
   * voice notes, documents, audio and video a bot attached with attach_file. */
  attachments?: import("./wire/wire").WireMessage["attachments"];
  card?: OptionCardData;
  connector?: ConnectorCardData;
  secret?: SecretRequestCardData;
  /** Lifecycle mirror for a routine whose real work lives in a fresh task. */
  routineRun?: RoutineRunCardData;
  /** Durable lifecycle receipt for a goal-driven channel run. */
  goalRun?: GroupGoalRunCardData;
  /** How a channel user message should be handled. Absent means ordinary chat. */
  channelMode?: "chat" | "goal";
  /** activity messages: tool name + outcome. `spoken` is the server's
   * narration of the same chip ("reading a file"), used by call mode. */
  /** `setup` marks an error fixed by installing something, not by retrying.
   * `summary` is the call's input on one redacted line (the shell command). */
  tool?: { name: string; ok?: boolean; spoken?: string; setup?: boolean; claudeUpdate?: boolean; place?: PlaceRow; summary?: string; input?: string; output?: string; itemId?: string; outputPath?: string; fullResult?: boolean };
  /** user messages sent into a running turn — the model saw it mid-turn */
  steered?: boolean;
  /** a user message that did not come from typing here: through the
   * server's API, or spoken during a Live call. */
  via?: "api" | "call";
  /** Provider turn that produced this message. */
  turnId?: string;
  /** Last assistant text item from a settled provider turn. */
  turnTerminal?: boolean;
  /** screen messages: the server holds a frame of the bot's computer,
   * served by `/api/threads/:threadId/messages/:id/image`. */
  hasImage?: boolean;
  /** screen messages in the full (unpaged) shape: the same frame, inline as
   * base64. Shown through the image route all the same. */
  png?: string;
  mime?: string;
  at: number;
  /** the message this one follows; null = thread root. Edited messages
   * share a parentId with the version they replace — that's a fork. */
  parentId?: string | null;
  /** Flat reply reference for an inline quote; unrelated to branch ancestry. */
  replyToId?: string;
  /** Stable client identity for at-most-once chat POST retries. */
  sendId?: string;
  /** rooms: which member said this (sender attribution). */
  from?: { botId: string; name: string; color: import("./mascot").MausColor };
  /** a user-role line another bot delivered into this conversation
   * (ask_bot, delegate_bot, start_thread): the words are that bot's, not
   * the person's. Rendered as the peer speaking. */
  peerAsk?: { botId: string; name: string; unattended?: boolean };
  /** coordinate_bots delivery identity, as stored: the request a teammate
   * sent into this thread, or the result it reported back. */
  roomRequest?: { id: string; phase: "request" | "result" };
  /** emoji reactions; by = "user" or a member botId. */
  reactions?: Array<{ emoji: string; by: string }>;
  /** comm chips: "Messaged @X" linking to the bot⇄bot channel. */
  comm?: { groupId: string; threadId?: string; withBotId: string; withName: string; withColor: import("./mascot").MausColor };
  /** thread chips: "Opened thread #Title on Bot" linking to that thread */
  threadRef?: { botId: string; threadId: string; title: string };
  dataResult?: import("./wire/wire").WireMessage["dataResult"];
  /** sent while the bot was mid-turn; auto-sends when the turn settles.
   * Rendered only while the bot is busy, so a flag stranded by a server
   * restart never shows a promise nothing will keep. */
  queued?: boolean;
  /** steer-queue entry this drained user line came from. Pending chips
   * match on this id, not on equal text. Absent on ordinary sends. */
  queueId?: string;
  /** Auto rooms: the decision model picked this reply's speaker. */
  routedBy?: import("./wire/wire").WireMessage["routedBy"];
}

export type GroupDefaultResponder = import("./wire/wire").GroupDefaultResponder;

/** A room: several bots + you in one shared thread. */
export interface Group {
  usage?: GroupThreadUsage | null;
  id: string;
  threadId: string;
  name: string;
  memberIds: string[];
  defaultResponder: GroupDefaultResponder;
  bulletin: string;
  unread: boolean;
  /** The newest message on screen the last time the person read this
   * conversation. The New divider goes after it. */
  lastReadMessageId?: string;
  createdAt: number;
  /** auto-created bot⇄bot channel (ask_bot exchanges mirror here) */
  dm?: boolean;
  busyBotId?: string | null;
  /** when the busy member's turn started — the group-side twin of a task's
   * turnStartedAt; stamped by the server when the speaker claims the turn */
  turnStartedAt?: number | null;
  /** True for the whole orchestrated run, including hand-offs between members. */
  working?: boolean;
  /** the room's shared desk — where member turns run their shell tools,
   * overriding each member's own folder; absent = each member's own */
  cwd?: string;
  /** folder the room's turns actually run in, pinned on the first turn;
   * null = each member's own default; absent = not pinned yet */
  pinnedCwd?: string | null;
  /** the one message pinned to the top of this room's transcript */
  pinnedMessageId?: string;
  /** sidebar section heading this room is filed under (shared with bots) */
  section?: string;
  /** New user-created rooms remain in setup until Save or Skip. */
  setupCompletedAt?: number | null;
  setupSkippedAt?: number | null;
  /** A direct-message conversation's turn ceiling. Null or absent uses the
   * global group limit. Channel conversations store theirs on each task. */
  turnTimeoutMinutes?: number | null;
  /** Separate conversations in this channel. DMs deliberately stay on one
   * thread and omit this collection. */
  tasks?: GroupTask[];
  messages: Message[];
  /** The server answered a bounded page and older messages remain in storage.
   * Absent on an unpaged response, which always carries the whole thread. */
  hasMore?: boolean;
}

/** One of a channel's independent conversations. The channel's threadId
 * points at the active one; folder and pin state belong to the task. */
export interface GroupTask {
  threadId: string;
  title: string;
  createdAt: number;
  pinnedCwd?: string | null;
  pinnedMessageId?: string;
  /** The person pinned this channel thread. Only true is a pin. */
  pinned?: boolean;
  /** Newest message time, or createdAt. Server-derived. */
  updatedAt?: number;
  /** This conversation's turn ceiling, in whole minutes. Absent uses the
   * global group limit. */
  turnTimeoutMinutes?: number;
  /** Whether a turn is actively running in this thread. */
  working?: boolean;
  /** The member bot currently speaking or generating in this thread, if any. */
  busyBotId?: string | null;
}

export interface ModelSelection {
  instanceId: string;
  model: string;
  effort?: EffortLevel;
  variant?: string;
}

/** One of a bot's separate contexts: its own thread, transcript and
 * provider session. The bot's threadId points at the active one. */
export interface Task {
  waitingForTeammates?: boolean;
  threadId: string;
  /** Internal routine execution; reachable through its run receipt, not history menus. */
  routineRunId?: string;
  projectId?: string;
  title: string;
  createdAt: number;
  /** The person pinned this thread above the update-ordered list. */
  pinned?: boolean;
  link?: string;
  /** Newest message time, or createdAt. Server-derived; local bumps use max. */
  updatedAt?: number;
  /** what this task has spent, banked once per settled turn */
  usage?: TaskUsage;
  /** folder this task's turns run in, pinned on its first turn; null =
   * legacy home-folder session; absent = not pinned yet */
  cwd?: string | null;
  /** The model this thread runs on: its own when a person picked one here,
   * else its bot's (followsBotModel). */
  modelSelection?: ModelSelection;
  /** true: runs on its bot's model and moves with it; false: a model a person
   * picked in this thread. Absent from servers older than the field. */
  followsBotModel?: boolean;
  approvalMode?: ApprovalMode;
  autoApprove?: boolean;
  alwaysAllow?: string[];
  activity?: Bot["activity"];
  busy?: boolean;
  /** Epoch ms when this task's current turn became busy; the chat's elapsed
   * readout anchors here so it survives thread switches. Absent while idle. */
  turnStartedAt?: number;
  unread?: boolean;
  /** The newest message on screen the last time the person read this
   * conversation. The New divider goes after it. */
  lastReadMessageId?: string;
  pinnedMessageId?: string;
  /** where this conversation works, when pinned: by the person from the
   * composer, or by its first Auto turn to the place it reached. Wins over
   * the bot's Works on (except Off); absent = follows the bot. */
  surface?: "cloud" | "vm" | "local" | "browser";
  /** true when that pin is the machine's own record (an Auto turn's landing
   * place or the bot's select_computer choice), which the next Works on
   * change moves; absent on a person's pin or one older than the server's
   * record of who set it. Server-derived. */
  surfaceAuto?: true;
  /** set when a bot (not the person) started this thread — its own or a
   * teammate's; the sidebar shows a quiet "opened by <name>" under the title */
  openedBy?: ThreadOpener;
  /** set when a bot closed this thread with close_thread; the sidebar folds
   * it out of the default list (still under "show all", never deleted) and
   * the server clears it when a new turn starts there */
  closedBy?: ThreadCloser;
  /** when the person archived this thread: out of the default list, still
   * under show-all and search, and back the moment it needs them again;
   * absent = never archived. Syncs like every other task field. */
  archivedAt?: number;
  /** when the person snoozed this thread: 0 = until new activity (the
   * server clears it on the first wake), a future epoch ms = until then
   * (the server drops it from reads once past); absent = awake */
  snoozedUntil?: number;
}

/** The bot that opened a thread on itself or a teammate. */
export interface ThreadOpener {
  botId: string;
  name: string;
  delegationId?: string;
  at: number;
}

/** The bot that closed a thread it opened (or one of its own). */
export interface ThreadCloser {
  botId: string;
  name: string;
  at: number;
}

export interface TaskUsage {
  input: number;
  output: number;
  /** cached share of `input` (context the model re-read); absent on records
   * from builds before it was tracked */
  cachedInput?: number;
  /** null until any turn reported a cost — most engines never do; records
   * from builds before cost existed lack the field entirely */
  costUsd: number | null;
  turns: number;
  /** the most recent settled turn on its own */
  lastTurn?: { input: number; output: number; cachedInput?: number; costUsd: number | null };
  /** what filled the model's window on the last model call, and the window's size when known */
  context?: { tokens: number; window?: number };
}

export interface Bot {
  /** Owner selection, independent of engine approval mode. */
  toolScope?: ToolScope;
  waitingForTeammates?: boolean;
  id: string;
  threadId: string;
  /** The bot's main thread, worked out by the server (WireBot.mainThreadId). */
  mainThreadId?: string;
  /** every context this bot has, newest first */
  tasks?: Task[];
  projects?: BotProject[];
  name: string;
  title: string;
  description: string;
  /** Standing instructions (SOUL.md). Canonical on the server; the file is a mirror. */
  soul?: string;
  /** The SOUL.md mirror on disk differs from the record; the Soul editor offers apply/discard. */
  soulDrift?: boolean;
  notifications: boolean;
  color: import("./mascot").MausColor;
  mascotExpression?: string | null;
  /** Which body the bot wears. Unknown/absent values fall back to the cursor. */
  mascotBody?: MascotBodyId | null;
  /** App-owned image attachment used for this bot's profile. */
  avatarUrl?: string | null;
  /** Mascot, or the crop applied to avatarUrl. */
  avatarCrop?: BotAvatarCrop;
  /** Zoom of a custom image. Absent means 1. */
  avatarZoom?: number;
  /** Horizontal point of the image kept in the crop, 0–1. Absent means center. */
  avatarFocusX?: number;
  /** Vertical point of the image kept in the crop, 0–1. Absent means center. */
  avatarFocusY?: number;
  unread: boolean;
  busy?: boolean;
  /** what the bot is doing, as the harness sees it; busy is derived from it */
  activity?: "working" | "waiting-on-you" | "idle" | "no-signal" | "dead" | "parked.computer";
  /** The selected thread's turn-start anchor (epoch ms) while busy, else null;
   * fed to the Thinking timer so elapsed time survives thread switches. */
  turnStartedAt?: number | null;
  modelSelection: ModelSelection;
  /** Where this bot works: a computer, only the built-in browser tab, or
   * nowhere; unset = auto (cloud boat if one exists, else local). */
  computer?: "cloud" | "vm" | "local" | "browser" | "off";
  /** Which cloud computer backs `computer: "cloud"`; absent means Boat. */
  cloudBackend?: CloudBackend;
  /** Allow Auto to prepare/start the managed VPS container. Off by default. */
  autoStartVps?: boolean;
  /** where new tasks run their shell tools; absent = the private bot workspace */
  cwd?: string;
  /** auto mode: the bot approves its own tool permissions */
  autoApprove?: boolean;
  /** Explicit approval level; absent records use the legacy autoApprove bit. */
  approvalMode?: ApprovalMode;
  /** tools this bot may always use without asking */
  alwaysAllow?: string[];
  /** speak this bot's replies aloud as they settle */
  speakReplies?: boolean;
  /** this bot's own voice id (falls back to the app-wide one) */
  voice?: string;
  /** whether this bot may send voice notes (on unless switched off) */
  voiceNotes?: boolean;
  /** whether this bot uses native memory (on unless switched off) */
  memoryEnabled?: boolean;
  pinned?: boolean;
  hidden?: boolean;
  /** Sidebar section this bot renders under; absent = unsectioned. */
  section?: string;
  /** the one message pinned to the top of this bot's active thread */
  pinnedMessageId?: string;
  /** This sidebar section's primary coordinator. */
  chiefOfStaff?: boolean;
  /** Additional teams the owner explicitly lets this Chief work with. */
  managedSections?: string[];
  /** When this bot wants to talk to another bot (ask_bot/delegate_bot),
   * pause and ask the user first. Off by default. */
  approvePeerComms?: boolean;
  /** Explicit peer allow-list (bot ids); absent = every bot in its section,
   * `[]` = none. Read-only on the web today; here so the settings dialog can
   * refetch the overview when the server changes it. */
  peers?: string[];
  /** Whether this bot may use the workspace's connected apps. Unset means
   * allowed for existing bots; imported bots start with this disabled. */
  composio?: boolean;
  /** Which connected-app tools this bot may call, by service slug. Absent
   * defers to the composio boolean (unset/true = every tool, false = none);
   * an explicit {} grants no tools. Edited from bot settings → Access. */
  connectorTools?: Record<string, ConnectorToolGrant>;
  connectorScopes?: { apps: Record<string, "read" | "write"> };
  outbound?: { policy: "ask" | "allow"; dailyCap: number };
  fallback?: Array<{ instanceId: string; model: string }>;
  /** Whether this bot gets the app's built-in browser (Browser tab). On unless switched off. */
  browser?: boolean;
  /** Memory upkeep (Bot settings → Memory): background capture and the
   * nightly tidy-up. On unless explicitly false. */
  memoryUpkeep?: boolean;
  /** Which app-wide MCP servers (Plugins → MCP servers) this bot mounts, by
   * name. Absent = every enabled server; [] = none (null clears over PATCH). */
  mcpServers?: string[] | null;
  /** Named browser profile id (config.browserProfiles); absent/null = the
   * bot's own session (null is how a clear travels over PATCH). */
  browserProfile?: string | null;
  /** Who may see this bot on a shared workspace; only admins receive it. */
  visibility?: BotVisibility;
  /** Where a shared or organization package put this bot (its provenance line). */
  installedPackage?: InstalledPackageMetadata;
  messages: Message[];
  /** The server answered a bounded page and older messages remain in storage.
   * Absent on an unpaged response, which always carries the whole thread. */
  hasMore?: boolean;
  /** Renderer-only: a deleted selection moved to a thread whose full
   * transcript has not arrived yet. Never carry the deleted chat into it. */
  awaitingThreadSnapshot?: boolean;
  /** Renderer-only: the thread a switch in this window is opening, until its
   * snapshot lands (taskSwitched). The server announces the switch before it
   * answers it, so meanwhile this is the thread on screen, never threadId:
   * the one left behind is not read by being left (the "bot" frame). */
  switchingTo?: string;
  /** leaf of the visible conversation branch (see visibleMessages) */
  activeLeafId?: string | null;
}

export interface BotProject {
  id: string;
  name: string;
  emoji?: string;
}

export type ProjectUpdatePatch = { name?: string; emoji?: string | null };

/** A conversation uses its own execution settings; the sidebar keeps the
 * original bot's aggregate presence and profile defaults. */
export function currentTaskBot(bot: Bot, threadId = bot.threadId): Bot {
  const task = bot.tasks?.find((candidate) => candidate.threadId === threadId);
  if (!task) return bot;
  return {
    ...bot,
    threadId,
    modelSelection: task.modelSelection ?? bot.modelSelection,
    approvalMode: task.approvalMode ?? (task.autoApprove === undefined ? bot.approvalMode : undefined),
    autoApprove: task.autoApprove ?? bot.autoApprove,
    alwaysAllow: task.alwaysAllow ?? bot.alwaysAllow,
    activity: task.activity ?? bot.activity,
    busy: task.busy ?? (task.activity ? task.activity === "working" || task.activity === "waiting-on-you" : bot.busy),
    unread: task.unread ?? bot.unread,
    pinnedMessageId: task.pinnedMessageId,
    turnStartedAt: task.turnStartedAt ?? null,
    waitingForTeammates: task.waitingForTeammates ?? false,
  };
}

export type TaskUpdatePatch = Partial<Pick<Task, "modelSelection" | "approvalMode" | "autoApprove" | "pinnedMessageId">> & {
  confirmFullAccess?: boolean;
  acknowledgeLocalAuto?: boolean;
  updateBotDefault?: boolean;
  resetApprovalToAsk?: boolean;
  projectId?: string | null;
  archivedAt?: number | null;
  snoozedUntil?: number | null;
  /** null = follow the bot's Works on again */
  surface?: Task["surface"] | null;
  /** false clears the pin */
  pinned?: boolean;
  link?: string | null;
};

function taskPatchFields(patch: TaskUpdatePatch): Partial<Task> {
  const { confirmFullAccess: _fullConsent, acknowledgeLocalAuto: _localAck, updateBotDefault: _modelDefault, resetApprovalToAsk, projectId, archivedAt, snoozedUntil, surface, pinned, link, ...fields } = patch;
  return {
    ...fields, ...(resetApprovalToAsk ? { approvalMode: "ask", autoApprove: false, alwaysAllow: [] } : {}),
    ...(projectId === undefined ? {} : { projectId: projectId ?? undefined }),
    ...(archivedAt === undefined ? {} : { archivedAt: archivedAt ?? undefined }),
    ...(snoozedUntil === undefined ? {} : { snoozedUntil: snoozedUntil ?? undefined }),
    // A person's pin or unpin is never the machine's record.
    ...(surface === undefined ? {} : { surface: surface ?? undefined, surfaceAuto: undefined }),
    ...(pinned === undefined ? {} : { pinned: pinned ? true : undefined }),
    ...(link === undefined ? {} : { link: link ?? undefined })
  };
}

/** A snapshot must not move a thread backwards in the list. Local bumps can
 * race an older bot frame that was built before the message landed. */
function mergeTaskStamps<T extends { threadId: string; updatedAt?: number }>(previous: T[] | undefined, incoming: T[] | undefined): T[] | undefined {
  if (!incoming) return previous;
  const prior = new Map((previous ?? []).map((task) => [task.threadId, task.updatedAt]));
  return incoming.map((task) => {
    const local = prior.get(task.threadId);
    if (typeof local !== "number") return task;
    const remote = task.updatedAt;
    const updatedAt = typeof remote === "number" ? Math.max(local, remote) : local;
    return updatedAt === task.updatedAt ? task : { ...task, updatedAt };
  });
}

/** The New divider for a conversation being opened. One that opens unread
 * gets a fresh one; opening the same conversation again keeps its divider,
 * and any other conversation has none. */
function openedUnreadDivider(state: AppState, threadId: string, unread: boolean, messages: readonly Message[], lastReadMessageId?: string): AppState["unreadDivider"] {
  if (!unread) return state.unreadDivider?.threadId === threadId ? state.unreadDivider : null;
  const messageId = firstUnreadMessageId(messages, lastReadMessageId);
  return messageId ? { threadId, messageId } : null;
}

/** The visible conversation: walk parentId links from the active leaf back
 * to the root. Falls back to the flat list for pre-branching payloads. */
export function visibleMessages(bot: Pick<Bot, "messages" | "activeLeafId">): Message[] {
  const leafId = bot.activeLeafId;
  if (!leafId) return bot.messages;
  const byId = new Map(bot.messages.map((m) => [m.id, m]));
  if (!byId.has(leafId)) return bot.messages;
  const path: Message[] = [];
  let cur = byId.get(leafId);
  while (cur) {
    path.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path.reverse();
}

/** GET /api/config — configured flags only; secrets are never echoed. */
export interface ConfigStatus {
  xai?: { configured: boolean };
  mistral?: { configured: boolean };
  cerebras?: { configured: boolean };
  groq?: { configured: boolean };
  /** `everyClaudeBot`: the key runs every Claude bot, not only "Claude (API key)". */
  anthropic?: { configured: boolean; everyClaudeBot?: boolean };
  openai?: { configured: boolean };
  openrouter?: { configured: boolean };
  openaiCompat?: { configured: boolean; url?: string };
  /** what this server is entitled to; Settings shows only what works here.
   * `license` reaches admins only, and only while the key is inside its
   * warning window or grace period. */
  edition?: {
    edition: "oss" | "enterprise";
    features: string[];
    license?: { expiresAt: string; expiresInDays: number; graceEndsAt?: string };
  };
  /** a fleet agent exists on this server (Settings → Workspaces) */
  fleet?: { available: boolean };
  budgets?: { monthlyUsd?: number; warnAtPercent?: number };
  billing?: { currency?: string; prices?: Record<string, { inputPerMillion: number; outputPerMillion: number; cachedInputPerMillion?: number }> };
  composio: { configured: boolean; mode?: "managed" | "self-hosted" | "unavailable" };
  /** `included`: cloud computers come with Cloud Pro, no key is saved. */
  box: { configured: boolean; included?: boolean };
  vps: { configured: boolean; sshAlias: string };
  rooms: { turnTimeoutMinutes: number };
  /** Per-call ceiling (minutes) for a bot's MCP tools. Absent from servers
   * older than the setting; read it with mcpCallTimeoutMinutes(). */
  mcp?: { callTimeoutMinutes: number };
  /** Workspace defaults for new bots; absent effort = no level is sent. */
  newBots?: { effort?: EffortLevel };
  threads?: { maxConcurrentPerBot: number; eventLogMaxBytes?: number; eventLogRetentionDays?: number };
  automaticRecovery?: { enabled: boolean; backup?: ModelSelection };
  localVm: { mode: "shared" | "per-bot" | "pool"; maxInstances: number; idleTimeoutMinutes?: number };
  /** `providerKeys`: names of the keys saved for OpenCode's other
   * providers, never the keys. */
  opencodeGo?: { configured: boolean; providerKeys?: string[] };
  /** Voice. `configured` = the engine has what it needs (an ElevenLabs or
   * Fish Audio key, or a Chatterbox server address); `ready` = that AND a voice, which is
   * what it takes to actually speak. The key itself never comes back;
   * `baseUrl`/`model` are Chatterbox settings, not credentials. */
  tts?: {
    configured: boolean;
    ready: boolean;
    voice: string;
    provider?: "elevenlabs" | "fish" | "system" | "chatterbox" | "xai";
    baseUrl?: string;
    model?: string;
    /** Fish Audio speech model; present only while Fish is the provider. */
    fishModel?: "s2.1-pro" | "s2.1-pro-free";
    /** ElevenLabs voice comes with Cloud Pro; no key is saved. */
    included?: boolean;
  };
  /** The decision model: switches and whether a key is on file. The key
   * itself never comes back. `enabled` is the switch as it takes effect
   * (off while no key is saved). `included`: Cloud Pro's decisions, no key
   * saved. */
  decider?: {
    provider: "jev";
    configured: boolean;
    included?: boolean;
    enabled: boolean;
    jobs: { roomRouting: boolean };
  };
  /** Live calls (OpenAI GPT-Live): configured-or-not, never the key. */
  live?: LiveSettings;
  /** Shared write-only credential for on-demand GPT Image avatars. */
  imageGen?: {
    configured: boolean;
    provider?: "openai" | "xai" | "custom";
    model?: string;
    customUrl?: string;
    customModel?: string;
    openaiConfigured?: boolean;
    xaiConfigured?: boolean;
    customKeyConfigured?: boolean;
  };
  /** who's using the app — collected in onboarding, shown in the sidebar */
  profile?: { name: string; email: string; aboutMe?: string };
  /** UI language override; "" (or absent) follows the system language. */
  language?: string;
  /** Opt-in flags. Absent means off. */
  features?: { skillAuthoring: boolean; showToolCalls?: boolean; browser?: boolean; sharedComputers?: boolean; claudeUserMcp?: boolean; llmThreadTitles?: boolean; skillsLibrary?: boolean };
  /** First-run progress: whether the welcome tour was finished and which
   * one-time hints were dismissed. Server-owned so it follows the workspace. */
  onboarding?: OnboardingStatus;
  /** Which browser this server can give bots: the desktop app's surface, the
   * agent-browser engine, or nothing yet (with the reason). */
  browserEngine?: BrowserEngineSummary;
  /** Named browser sessions any bot can be pointed at. */
  browserProfiles?: BrowserProfile[];
  /** The enrolled organisation's read-only desktop policy; null when this
   * desktop is not enrolled or its Admin sends no policy. */
  managedPolicy?: ManagedPolicySummary | null;
  /** This server is an OMB Cloud home: it offers no "this computer" and no
   * Local VM (server/cloud-home.ts). Absent everywhere else. */
  cloudHome?: boolean;
}

export interface ManagedPolicySummary {
  organizationName: string;
  version: number;
  companyModelsOnly: boolean;
  allowedEngines: "all" | string[];
  mcp: { allowCustom: boolean; allowlist: string[] };
  computers: { thisComputer: boolean; localVm: boolean; box: boolean; vps: boolean };
  remoteAccess: boolean;
}

export interface BrowserEngineSummary {
  kind: "engine" | "unavailable";
  reason?: string;
  installable?: boolean;
  version?: string;
  installing?: boolean;
  installError?: string;
}

export interface BrowserProfile {
  id: string;
  name: string;
  /** Read-only durable Electron routing inherited from legacy profiles.
   * Config PATCH payloads must omit it. */
  partitionId?: string;
}

// Every section the server's config frame carries. A section left out here
// is wiped from state.config whenever a live frame lands, so whichever of a
// save's own response and its broadcast frame arrives last decides what
// Settings shows (a saved key's Test button used to vanish that way).
export type ConfigStatusFrame = Pick<
  ConfigStatus,
  "xai" | "mistral" | "cerebras" | "groq" | "anthropic" | "openai" | "openrouter" | "openaiCompat" | "fleet" | "composio" | "box" | "vps" | "rooms" | "mcp" | "threads" | "automaticRecovery" | "localVm" | "opencodeGo" | "tts" | "decider" | "imageGen" | "live" | "profile" | "language" | "features" | "onboarding" | "browserEngine" | "browserProfiles" | "edition" | "budgets" | "billing" | "managedPolicy" | "cloudHome"
>;

export function configStatusFromFrame(frame: ConfigStatusFrame): ConfigStatus {
  return {
    xai: frame.xai,
    mistral: frame.mistral,
    cerebras: frame.cerebras,
    groq: frame.groq,
    anthropic: frame.anthropic,
    openai: frame.openai,
    openrouter: frame.openrouter,
    openaiCompat: frame.openaiCompat,
    fleet: frame.fleet,
    composio: frame.composio,
    box: frame.box,
    vps: frame.vps,
    rooms: frame.rooms,
    mcp: frame.mcp,
    threads: frame.threads,
    automaticRecovery: frame.automaticRecovery,
    localVm: frame.localVm,
    opencodeGo: frame.opencodeGo,
    tts: frame.tts,
    decider: frame.decider,
    imageGen: frame.imageGen,
    live: frame.live,
    profile: frame.profile,
    language: frame.language,
    features: frame.features,
    onboarding: frame.onboarding,
    browserEngine: frame.browserEngine,
    browserProfiles: frame.browserProfiles,
    edition: frame.edition,
    budgets: frame.budgets,
    billing: frame.billing,
    managedPolicy: frame.managedPolicy,
    ...(frame.cloudHome ? { cloudHome: true } : {}),
  };
}

/** How an engine gets installed — declared by its driver. Absent for
 * engines that need no local binary. */
export interface EngineInstall {
  /** The server's platform, not the browser device's operating system. */
  platform?: "darwin" | "win32" | "linux";
  command?: Partial<Record<"darwin" | "win32" | "linux", string>>;
  docsUrl?: string;
  signInCommand?: string;
  needsNode?: boolean;
  managed?: { label: string; downloadBytes: number };
  /** the server can install or update this engine itself, no terminal */
  server?: { package: string };
  /** configured with a key in Settings → API keys, not in a terminal */
  settings?: "connections";
}

/** One row of GET /api/instances — the model picker's data. */
export interface InstanceInfo {
  instanceId: string;
  driverKind: string;
  displayName: string;
  /** Optional presentation override belonging to this instance, independent
   * of the driver that runs it. */
  icon?: import("./wire/provider-icon").ProviderIcon;
  /** Company instances are owned by the desktop parent, never editable here. */
  readOnly?: boolean;
  /** An OpenMausBot Cloud home's trial Claude credit (read-only): whether it
   * can still run, or is used up or gone. The person's own engine always wins over it. */
  trialCredit?: "active" | "used_up" | "ended";
  managed?: { organizationId: string; organizationName: string };
  /** The enrolled organisation's desktop policy does not allow bots to run on
   * this instance: shown, but disabled, with the server's reason. */
  policy?: { organizationName: string; reason: string };
  snapshot: {
    state: "available" | "unavailable";
    reason?: string;
    authenticated?: boolean;
    chatgptPlan?: boolean;
    authenticationUnavailableReason?: string;
    account?: { email?: string; organization?: string; method?: "login" | "api-key" };
    version?: string | null;
    /** A newer provider version unlocks capabilities, but this installed
     * version and its current models remain usable. */
    update?: {
      title: string;
      message: string;
      command: string;
    };
    /** a reported cost on a subscription is notional; the UI says so */
    billing?: "metered" | "subscription";
    /** a standing condition worth a look, with nothing to run */
    warning?: {
      title: string;
      message: string;
    };
  };
  models: { default: string; options: Array<{ id: string; label: string; custom?: boolean; loaded?: boolean; provider?: string; variants?: import("./wire/runtime-events").ModelVariantOption[] }> };
  capabilities?: {
    computerMcp?: boolean;
    agentsMcp?: boolean;
    composioMcp?: boolean;
    browserMcp?: boolean;
    images?: boolean;
    effortLevels?: readonly EffortLevel[];
    modelVariants?: boolean;
    /** the engine keeps a live session and takes a message mid-turn */
    queueing?: boolean;
    localComputerMcp?: boolean;
    /** This engine can answer a bounded review prompt without changing the
     * bot's active conversation. */
    approvalReview?: boolean;
  };
  /** `custom` agents sit below the rail divider — no subscription catalog. */
  access?: "subscription" | "custom" | "api";
  /** `signOut`: the browser may remove the stored sign-in to switch accounts. */
  authentication?: { method: "device-code" | "paste-code" | "browser" | "browser-pkce"; signOut?: boolean };
  install?: EngineInstall;
  /** Configured CLI path override — set ONLY when the user overrode it;
   * absent means the driver default is in effect. */
  cli?: string;
  /** Driver's default binary name (e.g. "claude"). */
  cliDefault?: string;
  /** Absolute paths of every default binary found on PATH, PATH order. */
  cliCandidates?: string[];
  /** Server-owned Claude profile; a saved directory does not prove sign-in. */
  claudeAccount?: { configDir: string; signInCommand: string; signInShell: "powershell" | "sh"; isDefault: boolean };
  /** This engine can leave large temporary files behind on this server
   * (Antigravity on Windows); Settings offers to clear them. */
  freeUpSpace?: boolean;
}

export type AppSettingsSection =
  | "general"
  | "desktopWorkspaces"
  | "organization"
  | "cloudAccount"
  | "appearance"
  | "experimental"
  | "connections"
  | "decisionModel"
  | "engines"
  | "companion"
  | "remote"
  | "computer"
  | "usage"
  | "people"
  | "activity"
  | "backups"
  | "workspaces"
  | "skills";

export type BotSettingsSection =
  | "overview"
  | "identity"
  | "slack"
  | "soul"
  | "skills"
  | "memory"
  | "routines"
  | "access"
  | "model"
  | "permissions"
  | "voice"
  | "visibility"
  | "history"
  | "usage";

export interface AppState {
  bots: Bot[];
  groups: Group[];
  /** Persisted named teams; older servers omit this, so clients also derive labels. */
  sections?: string[];
  instances: InstanceInfo[];
  config: ConfigStatus | null;
  /** selected chat — a bot id OR a group id */
  selectedId: string;
  activeView: "chat" | "team-map" | "routines";
  routines: Routine[];
  routineRuns: RoutineRun[];
  routinesLoadState: "loading" | "ready" | "error";
  routinesFocus: { section?: "schedule" | "logs"; view?: "calendar" | "list"; botId?: string; routineId?: string; runStatus?: RoutineRunStatusFilter; nonce: number };
  webhooks: WebhookTrigger[];
  webhookAttempts: WebhookAttempt[];
  webhookIngress: WebhookIngressStatus | null;
  settingsOpen: boolean;
  /** The "New bot" role picker. */
  newBotOpen: boolean;
  /** Creation continues even when the role picker is dismissed. */
  botCreationPending: boolean;
  computerOpen: boolean;
  appSettingsOpen: boolean;
  appSettingsSection: AppSettingsSection;
  /** Non-zero while Settings → OMB Cloud is open because of the Cloud page's
   * openmausbot://cloud link. Any other toggleAppSettings sets 0. */
  appSettingsCloudLink: number;
  /** Counts up each time Settings opens on the phone pairing. Any other
   * toggleAppSettings sets 0. */
  appSettingsPhonePairing: number;
  botSettingsSection: BotSettingsSection;
  /** True only when the open action named a section — accordion expands that row. */
  botSettingsExpandAccordion: boolean;
  /** True when this device has a section choice to restore (lib/last-bot-section). */
  botSettingsSectionStored: boolean;
  /** True only on an opening that expanded the remembered section; a deep
   * link is never it, so it can never force the Simple panel's full view. */
  botSettingsExpandRemembered: boolean;
  /** bots whose computer is starting for a turn (computer-start.ts) */
  computerStarts: Record<string, ComputerStart>;
  /** who is driving each bot's computer: held = the person has the wheel
   * (the bot's hands are refused server-side); helpReason = the bot's open
   * plea for the person to take over */
  computerControl: Record<string, { held: boolean; helpReason: string | null }>;
  dataResultFocus: { botId: string; id: string; requestId: number; consumed: boolean } | null;
  /** The New divider: the first message of the open conversation that came
   * in while the person was away. Taken from its unread flag when it opens,
   * so it holds still while that conversation stays open. */
  unreadDivider: { threadId: string; messageId: string } | null;
  connected: boolean;
  /** Bots and rooms have loaded once: a link opened at launch can resolve. */
  hydrated?: true;
  error: string | null;
  /** a quiet, non-error line above the transcript; clears itself */
  notice: { kind: "thread-gone" | "bot-gone"; botName: string | null } | null;
  /** a thread the person asked to open (chip or #Title link): the sidebar
   * expands its bot and scrolls the row into view once it is current */
  revealThread: { threadId: string; nonce: number } | null;
  mascotMotion: {
    botId: string;
    nonce: number;
    kind: string;
  } | null;
  /** Kept for reducer-shape parity with open panels the screens toggle;
   * the island screens never open these surfaces. */
  inspectorOpen: boolean;
  activityOpen: boolean;
  pluginsOpen: boolean;
  /** The Triggers pop-up (webhooks, as a sentence). */
  triggersOpen: boolean;
}

export type BotAnnouncement = Omit<Bot, "messages"> & { messages?: Message[] };

export type Action =
  | {
      type: "hydrate";
      bots: Bot[];
      groups: Group[];
      sections?: string[];
      computerControl: Record<string, { held: boolean; helpReason: string | null }>;
      /** the conversation open on this device last launch, for the first hydrate */
      resumeId?: string;
    }
  | { type: "sections"; sections: string[] }
  | { type: "showRoutines"; section?: "schedule" | "logs"; view?: "calendar" | "list"; botId?: string; routineId?: string; runStatus?: RoutineRunStatusFilter }
  | { type: "showTeamMap" }
  | { type: "showChat" }
  | { type: "routinesHydrated"; routines: Routine[]; runs: RoutineRun[] }
  | { type: "routinesLoadFailed" }
  | { type: "routinePatched"; routine: Routine }
  | { type: "routineDeleted"; routineId: string }
  | { type: "routineRunPatched"; run: RoutineRun }
  | { type: "webhooksHydrated"; webhooks: WebhookTrigger[]; attempts: WebhookAttempt[]; ingress: WebhookIngressStatus }
  | { type: "webhookPatched"; webhook: WebhookTrigger }
  | { type: "webhookAttempted"; attempt: WebhookAttempt }
  | { type: "webhookDeleted"; webhookId: string }
  | { type: "createRoutine"; input: RoutineInput }
  | { type: "updateRoutine"; routineId: string; patch: Partial<RoutineInput> }
  | { type: "deleteRoutine"; routineId: string }
  | { type: "runRoutine"; routineId: string; onStarted?: (run: RoutineRun) => void; onError?: (error: unknown) => void; onSettled?: () => void }
  | { type: "cancelRoutineRun"; runId: string }
  | { type: "markRoutineRunSeen"; runId: string }
  | { type: "markAllRoutineRunsSeen" }
  | { type: "groupPatched"; group: Partial<Group> & { id: string } }
  | { type: "groupDeleted"; groupId: string }
  | { type: "switchGroupTask"; groupId: string; threadId: string }
  | { type: "instances"; instances: InstanceInfo[] }
  | { type: "configStatus"; config: ConfigStatus }
  | { type: "select"; id: string }
  | { type: "threadActive"; threadId: string; activeLeafId: string }
  | { type: "newTask"; botId: string; projectId?: string; cwd?: string; onCreated?: () => void; onError?: (message: string) => void }
  /** `whole`: the whole thread, not its newest page (a search hit can be older). */
  | { type: "switchTask"; botId: string; threadId: string; whole?: true }
  | { type: "switchTaskFailed"; botId: string; threadId: string }
  | { type: "taskSwitched"; bot: Bot }
  | { type: "send"; botId: string; text: string; threadId?: string; sendId?: string; onError?: (message: string) => void }
  | { type: "messageAdded"; threadId: string; message: Message }
  | { type: "sendFailed"; threadId: string; sendId: string }
  | { type: "deleteTask"; botId: string; threadId: string }
  | { type: "newGroupTask"; groupId: string }
  | { type: "deleteGroupTask"; groupId: string; threadId: string }
  | { type: "newBot"; role?: string; section?: string; preserveSelection?: boolean; onCreated?: (bot: Bot) => void; onError?: (message: string) => void }
  | { type: "botCreationPending"; on: boolean }
  | { type: "updateTask"; botId: string; threadId: string; patch: TaskUpdatePatch }
  | { type: "botAdded"; bot: Bot; preserveSelection?: boolean }
  | { type: "deleteBot"; botId: string }
  | { type: "botPatched"; bot: BotAnnouncement }
  | { type: "computerStart"; botId: string; start: ComputerStart | null }
  | { type: "computerControl"; botId: string; held: boolean; helpReason: string | null }
  | { type: "connected"; value: boolean }
  | { type: "error"; message: string | null }
  | { type: "notice"; notice: AppState["notice"] }
  | { type: "revealThread"; threadId: string }
  | { type: "toggleSettings"; open?: boolean; section?: BotSettingsSection; botId?: string }
  | { type: "toggleNewBot"; open?: boolean }
  | { type: "toggleComputer"; open?: boolean }
  | { type: "dataResultFocusConsumed"; requestId: number }
  | { type: "toggleAppSettings"; open?: boolean; section?: AppSettingsSection; cloudLink?: boolean; phonePairing?: boolean }
  | {
      type: "updateBot";
      botId: string;
      patch: BotUpdatePatch;
    };

export function pinBotThreadAction(action: Action, bots: Bot[]): Action {
  if (!("botId" in action) || ("threadId" in action && action.threadId) ||
      !["send", "interrupt", "editMessage", "switchBranch", "answerCard", "dismissCard", "cancelQueued", "steerQueued"].includes(action.type)) return action;
  const botId = action.botId;
  const threadId = bots.find((bot) => bot.id === botId)?.threadId;
  return { ...action, threadId } as Action;
}

interface NotificationThreadOwner {
  id: string;
  threadId: string;
  /** A bot's main thread (WireBot.mainThreadId); a room has none. */
  mainThreadId?: string;
  tasks?: Array<{ threadId: string }>;
}

interface NotificationRoutingState {
  bots: NotificationThreadOwner[];
  groups: NotificationThreadOwner[];
}

/** A notification's conversation target. */
export interface NotificationTarget {
  botId: string;
  threadId: string;
}

export function visibleNotificationThread(
  state: NotificationRoutingState & Pick<AppState, "activeView" | "selectedId">,
): string | null {
  if (state.activeView !== "chat") return null;
  return (
    state.bots.find((candidate) => candidate.id === state.selectedId)?.threadId ??
    state.groups.find((candidate) => candidate.id === state.selectedId)?.threadId ??
    null
  );
}

export function openNotificationTarget(
  dispatch: (action: Action) => void,
  target: NotificationTarget,
  state: NotificationRoutingState,
  threadsShown: boolean,
) {
  // A room's approval/question notification carries the asker bot with the
  // GROUP's thread id; asking the bot to switch to that thread would 404.
  // Open the room itself. Cross-bot routine receipts carry the executing
  // bot but report into the requesting bot's thread: resolve its actual
  // owner before selecting. An unknown/deleted thread falls back to the bot.
  const group = state.groups.find(
    (candidate) =>
      candidate.threadId === target.threadId ||
      (candidate.tasks ?? []).some((task) => task.threadId === target.threadId),
  );
  if (group) {
    dispatch({ type: "select", id: group.id });
    if (group.threadId !== target.threadId) {
      dispatch({ type: "switchGroupTask", groupId: group.id, threadId: target.threadId });
    }
    return;
  }
  const bot = state.bots.find((candidate) =>
    candidate.threadId === target.threadId || candidate.tasks?.some((task) => task.threadId === target.threadId)
  ) ?? state.bots.find((candidate) => candidate.id === target.botId);
  if (!bot) {
    dispatch({ type: "select", id: target.botId });
    return;
  }
  const known =
    bot.threadId === target.threadId ||
    (bot.tasks ?? []).some((task) => task.threadId === target.threadId);
  if (known) openBotThread(dispatch, bot, target.threadId, threadsShown);
  else openBot(dispatch, bot, threadsShown);
}

/** The thread opening a bot itself shows. With threads shown, the one it
 * was on. With threads hidden the bot is one conversation, its main thread
 * (WireBot.mainThreadId), so a thread a notification or an activity row
 * opened is left on the next open; one this window has no row for yet
 * keeps the selection. */
export function botOpensTo(bot: Pick<NotificationThreadOwner, "threadId" | "mainThreadId" | "tasks">, threadsShown: boolean): string {
  return !threadsShown && bot.mainThreadId && bot.tasks?.some((task) => task.threadId === bot.mainThreadId)
    ? bot.mainThreadId : bot.threadId;
}

/** Open a bot itself: its row, its pinned circle, the palette, the + menu,
 * ⌘1–9, the team map, a link to the bot, the bot a dead thread link falls
 * back to, the bot the app reopens at launch, Edit profile on another bot,
 * a restored bot, the next one after archiving, its voice settings from a
 * room, or the chat a Cloud's setup job went to. It opens where botOpensTo
 * says. The bot on screen is selected again where it is (its computer from
 * the workspace view, its own Edit profile): the person sees that thread. */
export function openBot(
  dispatch: (action: Action) => void,
  bot: Pick<NotificationThreadOwner, "id" | "threadId" | "mainThreadId" | "tasks">,
  threadsShown: boolean,
) {
  const opened = botOpensTo(bot, threadsShown);
  if (opened === bot.threadId) dispatch({ type: "select", id: bot.id });
  else openBotThread(dispatch, bot, opened, threadsShown);
}

/** Open one of a bot's threads, as a notification, a chip, a link or a
 * button names it: a switch, once the bot is selected. With threads hidden
 * another thread than the one the bot is on opens by the switch alone,
 * which selects the bot too, so the thread left behind keeps its unread
 * mark: only an activity row reaches it, and a reply there must not pass
 * as read unseen, nor while the switch is under way (Bot.switchingTo). */
export function openBotThread(
  dispatch: (action: Action) => void,
  bot: Pick<NotificationThreadOwner, "id" | "threadId">,
  threadId: string,
  threadsShown: boolean,
) {
  if (threadsShown || threadId === bot.threadId) dispatch({ type: "select", id: bot.id });
  dispatch({ type: "switchTask", botId: bot.id, threadId });
}

/** A thread the person can open from a chip or a #Title link. */
export interface ThreadTarget {
  botId: string;
  threadId: string;
}

interface ThreadOpeningState extends NotificationRoutingState {
  bots: Array<NotificationThreadOwner & { name: string }>;
}

/** Open a thread the person clicked: select its bot (or room) and switch
 * the VIEW to that thread — never the work; a turn running elsewhere keeps
 * running (the #981 rule). The sidebar then reveals the row. A thread this
 * client no longer knows (deleted, or not yet announced) falls back to the
 * bot with a quiet notice rather than a 404 or a crash. Returns whether the
 * thread was found. */
export function openThread(
  dispatch: (action: Action) => void,
  target: ThreadTarget,
  state: ThreadOpeningState,
  threadsShown: boolean,
): boolean {
  const owns = (owner: NotificationThreadOwner) =>
    owner.threadId === target.threadId || (owner.tasks ?? []).some((task) => task.threadId === target.threadId);
  if (state.groups.some(owns) || state.bots.some(owns)) {
    openNotificationTarget(dispatch, target, state, threadsShown);
    dispatch({ type: "revealThread", threadId: target.threadId });
    return true;
  }
  const bot = state.bots.find((candidate) => candidate.id === target.botId);
  if (bot) openBot(dispatch, bot, threadsShown);
  dispatch({ type: "notice", notice: { kind: "thread-gone", botName: bot?.name ?? null } });
  return false;
}

function updateBot(state: AppState, botId: string, fn: (b: Bot) => Bot): AppState {
  return { ...state, bots: state.bots.map((b) => (b.id === botId ? fn(b) : b)) };
}

function withMascotMotion(
  state: AppState,
  botId: string,
  kind: string,
): AppState {
  return {
    ...state,
    mascotMotion: {
      botId,
      nonce: (state.mascotMotion?.nonce ?? 0) + 1,
      kind,
    },
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate": {
      const known = (id: string) => action.bots.some((b) => b.id === id) || action.groups.some((g) => g.id === id);
      const resume = action.resumeId;
      // A remembered conversation only counts while it still resolves to a
      // visible bot or a room; a deleted or hidden one falls back as before.
      const resumed =
        resume && (action.bots.some((b) => b.id === resume && !b.hidden) || action.groups.some((g) => g.id === resume)) ? resume : "";
      const selectedId = state.selectedId && known(state.selectedId) ? state.selectedId : resumed || (action.bots[0]?.id ?? "");
      return {
        ...state,
        bots: action.bots.map((bot) => {
          const previous = state.bots.find((candidate) => candidate.id === bot.id);
          return previous ? { ...bot, tasks: mergeTaskStamps(previous.tasks, bot.tasks) } : bot;
        }),
        groups: action.groups.map((group) => {
          const previous = state.groups.find((candidate) => candidate.id === group.id);
          return previous ? { ...group, tasks: mergeTaskStamps(previous.tasks, group.tasks) } : group;
        }),
        sections: action.sections ?? [],
        computerControl: action.computerControl,
        selectedId,
        hydrated: true as const,
      };
    }
    case "sections":
      return { ...state, sections: action.sections };
    case "showRoutines":
      return {
        ...state,
        activeView: "routines",
        routinesFocus: { section: action.section, view: action.view, botId: action.botId, routineId: action.routineId, runStatus: action.runStatus, nonce: state.routinesFocus.nonce + 1 },
        settingsOpen: false,
        computerOpen: false,
        inspectorOpen: false,
        activityOpen: false,
        appSettingsOpen: false,
        pluginsOpen: false,
        triggersOpen: false,
      };
    case "showChat":
      return state.activeView === "chat" ? state : { ...state, activeView: "chat" };
    case "showTeamMap":
      return {
        ...state,
        activeView: "team-map",
        settingsOpen: false,
        computerOpen: false,
        inspectorOpen: false,
        activityOpen: false,
        appSettingsOpen: false,
        pluginsOpen: false,
        triggersOpen: false,
      };
    case "routinesHydrated":
      return { ...state, routines: action.routines, routineRuns: trimRoutineRuns(action.runs), routinesLoadState: "ready" };
    case "routinesLoadFailed":
      return { ...state, routinesLoadState: "error" };
    case "routinePatched": {
      const exists = state.routines.some((routine) => routine.id === action.routine.id);
      return {
        ...state,
        routines: exists
          ? state.routines.map((routine) => (routine.id === action.routine.id ? action.routine : routine))
          : [action.routine, ...state.routines],
      };
    }
    case "routineDeleted":
      return { ...state, routines: state.routines.filter((routine) => routine.id !== action.routineId) };
    case "routineRunPatched": {
      const exists = state.routineRuns.some((run) => run.id === action.run.id);
      const runs = exists
        ? state.routineRuns.map((run) => (run.id === action.run.id ? action.run : run))
        : [action.run, ...state.routineRuns];
      return {
        ...state,
        routineRuns: trimRoutineRuns(runs),
      };
    }
    case "webhooksHydrated":
      return { ...state, webhooks: action.webhooks, webhookAttempts: action.attempts, webhookIngress: action.ingress };
    case "webhookPatched": {
      const exists = state.webhooks.some((webhook) => webhook.id === action.webhook.id);
      return {
        ...state,
        webhooks: exists
          ? state.webhooks.map((webhook) => (webhook.id === action.webhook.id ? action.webhook : webhook))
          : [action.webhook, ...state.webhooks],
      };
    }
    case "webhookDeleted":
      return { ...state, webhooks: state.webhooks.filter((webhook) => webhook.id !== action.webhookId) };
    case "webhookAttempted": {
      const attempts = [action.attempt, ...state.webhookAttempts].slice(0, 100);
      return { ...state, webhookAttempts: attempts };
    }
    case "groupPatched": {
      const exists = state.groups.some((g) => g.id === action.group.id);
      const groups = exists
        ? state.groups.map((g) => (g.id === action.group.id ? {
            ...g, ...action.group,
            section: typeof action.group.threadId === "string" || Object.hasOwn(action.group, "section") ? action.group.section : g.section,
            tasks: action.group.tasks ? mergeTaskStamps(g.tasks, action.group.tasks) : g.tasks,
            turnTimeoutMinutes: Object.hasOwn(action.group, "turnTimeoutMinutes")
              ? (action.group.turnTimeoutMinutes ?? undefined)
              : g.turnTimeoutMinutes,
            messages: action.group.messages ?? g.messages,
            hasMore: action.group.messages ? Boolean(action.group.hasMore) : g.hasMore,
          } : g))
        : [{ ...(action.group as Group), messages: action.group.messages ?? [] }, ...state.groups];
      return { ...state, groups };
    }
    case "groupDeleted": {
      const groups = state.groups.filter((g) => g.id !== action.groupId);
      const selectedId = state.selectedId === action.groupId ? (state.bots[0]?.id ?? "") : state.selectedId;
      return { ...state, groups, selectedId };
    }
    case "instances":
      return { ...state, instances: action.instances };
    case "configStatus":
      return { ...state, config: action.config };
    case "select": {
      const room = state.groups.find((g) => g.id === action.id);
      if (room) {
        return {
          ...state,
          unreadDivider: openedUnreadDivider(state, room.threadId, room.unread, room.messages, room.lastReadMessageId),
          activeView: "chat",
          selectedId: action.id,
          groups: state.groups.map((g) => (g.id === action.id ? { ...g, unread: false } : g)),
        };
      }
      const opened = state.bots.find((b) => b.id === action.id);
      return updateBot(
        withMascotMotion(
          {
            ...state,
            unreadDivider: opened
              ? openedUnreadDivider(state, opened.threadId, threadOpensUnread(opened), visibleMessages(opened), threadReadCursor(opened))
              : state.unreadDivider,
            activeView: "chat",
            selectedId: action.id,
          },
          action.id,
          "switch",
        ),
        action.id,
        (b) => ({ ...b, unread: Boolean(b.tasks?.some((task) => task.threadId !== b.threadId && task.unread)), tasks: b.tasks?.map((task) => task.threadId === b.threadId ? { ...task, unread: false } : task) }),
      );
    }
    case "botAdded":
      return withMascotMotion({
        ...state,
        // An HTTP create/import response and its SSE broadcast can race. Fold
        // both paths without ever showing the same bot twice.
        bots: [action.bot, ...state.bots.filter((bot) => bot.id !== action.bot.id)],
        ...(action.preserveSelection ? {} : { activeView: "chat" as const, selectedId: action.bot.id }),
      }, action.bot.id, "arrive");
    case "deleteBot": {
      const bots = state.bots.filter((b) => b.id !== action.botId);
      const selectedId =
        state.selectedId === action.botId ? (bots.find((b) => !b.hidden)?.id ?? bots[0]?.id ?? "") : state.selectedId;
      return { ...state, bots, selectedId };
    }
    case "botPatched": {
      const before = state.bots.find((b) => b.id === action.bot.id);
      // Bot frames are complete except for their transcript. An unknown one
      // was created by another client (the phone, another app window, or a
      // team import), so add it now; the following message frames will fill
      // its greeting without waiting for a full-page hydration.
      if (!before) {
        return {
          ...state,
          bots: [{ ...action.bot, messages: action.bot.messages ?? [] }, ...state.bots],
        };
      }
      const kind =
        action.bot.unread && !before?.unread
          ? "surprise"
          : action.bot.busy === true && !before?.busy
            ? "working"
            : action.bot.busy === false && before?.busy
              ? "celebrate"
              : null;
      const motioned = kind ? withMascotMotion(state, action.bot.id, kind) : state;
      // A start that failed never sends a first frame: its line ends with the turn.
      const animated = action.bot.busy === false && before?.busy && motioned.computerStarts[action.bot.id]
        ? reducer(motioned, { type: "computerStart", botId: action.bot.id, start: null }) : motioned;
      const next = action.bot.chiefOfStaff
        ? {
            ...animated,
            bots: animated.bots.map((b) =>
              b.id === action.bot.id || (b.section?.trim() || "") !== (action.bot.section?.trim() || "")
                ? b
                : { ...b, chiefOfStaff: false },
            ),
          }
        : animated;
      const switchedThread =
        typeof action.bot.threadId === "string" && action.bot.threadId !== before.threadId &&
        !action.bot.tasks?.some((task) => task.threadId === before.threadId);
      if ((switchedThread || (before.awaitingThreadSnapshot && action.bot.threadId === before.threadId)) &&
          Array.isArray(action.bot.messages)) {
        // The slim deletion broadcast can arrive before the full snapshot.
        // Finish that switch once, replaying any events received in between.
        // Later duplicate HTTP snapshots must not overwrite newer messages.
        return reducer(next, { type: "taskSwitched", bot: { ...before, ...action.bot, computer: action.bot.computer, section: action.bot.section, toolScope: action.bot.toolScope, messages: action.bot.messages, browserProfile: action.bot.browserProfile } });
      }
      return updateBot(next, action.bot.id, (b) => ({
        ...b,
        ...action.bot,
        threadId: switchedThread ? action.bot.threadId : b.threadId,
        activeLeafId: switchedThread ? null : b.activeLeafId,
        awaitingThreadSnapshot: switchedThread || b.awaitingThreadSnapshot,
        // Complete bot frames omit this optional field after switching back
        // to Own browser (or deleting a shared profile). Do not retain the
        // previous profile's name and selection in another window.
        browserProfile: action.bot.browserProfile,
        // Resetting Works on to Auto removes the field from the complete
        // server frame; merging alone would keep the old target highlighted.
        computer: action.bot.computer,
        toolScope: action.bot.toolScope,
        // A complete frame omits section after another client moves the bot
        // into General. Retaining the old label strands an empty team in UI.
        section: action.bot.section,
        tasks: action.bot.tasks ? mergeTaskStamps(b.tasks, action.bot.tasks) : b.tasks,
        // Clear immediately on deletion: old approvals must never be sent
        // to the replacement thread while waiting for its transcript.
        messages: switchedThread ? [] : b.messages,
        // This branch keeps the transcript it holds, so it keeps that
        // transcript's scrollback answer too. A frame's hasMore describes
        // the page it carries (often another thread's); taskSwitched takes
        // it together with that page.
        hasMore: switchedThread ? undefined : b.hasMore,
      }));
    }
    case "updateTask": {
      const patch = taskPatchFields(action.patch);
      return updateBot(state, action.botId, (bot) => ({
        ...bot,
        tasks: (bot.tasks ?? [{ threadId: bot.threadId, title: "New thread", createdAt: Date.now() }]).map((task) =>
          task.threadId === action.threadId ? { ...task, ...patch } : task),
      }));
    }
    case "connected":
      return { ...state, connected: action.value };
    // Lean chat shell: optimistic user send over POST /api/bots/:id/messages,
    // folded server echo/reply via messageAdded, rollback on failure.
    // Streaming assistant turns arrive over the SSE bot frames (botPatched).
    case "send": {
      if (!action.sendId) return state;
      const target = state.bots.find((b) => b.id === action.botId);
      const threadId = action.threadId ?? target?.threadId;
      if (!target || !threadId || threadId !== target.threadId) return state;
      if (target.messages.some((m) => m.sendId === action.sendId)) return state;
      const message: Message = {
        id: action.sendId,
        role: "user",
        kind: "text",
        text: action.text,
        at: Date.now(),
        parentId: target.activeLeafId ?? null,
        sendId: action.sendId,
      };
      return updateBot(state, action.botId, (b) => ({
        ...b,
        messages: [...b.messages, message],
        activeLeafId: message.id,
      }));
    }
    case "messageAdded": {
      const msg = action.message;
      const owner = state.bots.find((b) =>
        b.threadId === action.threadId ||
        (b.tasks ?? []).some((t) => t.threadId === action.threadId));
      if (!owner) return state;
      return updateBot(state, owner.id, (b) => {
        const idx = b.messages.findIndex((m) =>
          (msg.sendId != null && m.sendId === msg.sendId) || m.id === msg.id);
        if (idx < 0) return { ...b, messages: [...b.messages, msg] };
        const prev = b.messages[idx];
        return {
          ...b,
          messages: b.messages.map((m, i) => (i === idx ? msg : m)),
          activeLeafId: b.activeLeafId === prev.id ? msg.id : b.activeLeafId,
        };
      });
    }
    case "sendFailed": {
      const owner = state.bots.find((b) => b.messages.some((m) => m.sendId === action.sendId));
      if (!owner) return state;
      return updateBot(state, owner.id, (b) => {
        const doomed = b.messages.find((m) => m.sendId === action.sendId);
        return {
          ...b,
          messages: b.messages.filter((m) => m.sendId !== action.sendId),
          activeLeafId: doomed && b.activeLeafId === doomed.id ? (doomed.parentId ?? null) : b.activeLeafId,
        };
      });
    }
    case "error":
      return {
        ...(action.message && state.selectedId
          ? withMascotMotion(state, state.selectedId, "alert")
          : state),
        error: action.message,
      };
    case "toggleSettings": {
      if (action.botId !== undefined && !state.bots.some((bot) => bot.id === action.botId && !bot.hidden)) return state;
      const selectedId = action.botId ?? state.selectedId;
      // A targeted settings link opens that bot without navigating to chat
      // or marking its conversations read, even when another panel is open.
      const open = action.open ?? (action.botId !== undefined || !state.settingsOpen);
      const freshOpen = open && !state.settingsOpen;
      const named = action.section !== undefined;
      return {
        ...state,
        selectedId,
        settingsOpen: open,
        activityOpen: open ? false : state.activityOpen,
        // The pointer persists across bots and rooms (select) and across
        // switches to another bot's profile; a deep link names its target.
        botSettingsSection: action.section ?? state.botSettingsSection,
        // A bare fresh open re-expands the section this device last viewed;
        // a deep link expands the row it names.
        botSettingsExpandAccordion: open ? named || (freshOpen && state.botSettingsSectionStored) : false,
        // Only an opening that expanded the remembered row sets this; a deep
        // link forces the full view for sections Simple skips.
        botSettingsExpandRemembered: open ? !named && freshOpen && state.botSettingsSectionStored : false,
        botSettingsSectionStored: named || state.botSettingsSectionStored,
        // Preserve the computer and inspector surfaces; their own controls
        // can open bot settings. App settings are mutually exclusive.
        appSettingsOpen: open ? false : state.appSettingsOpen,
      };
    }
    case "botCreationPending":
      return { ...state, botCreationPending: action.on };
    case "toggleNewBot": {
      const open = action.open ?? !state.newBotOpen;
      return {
        ...state, newBotOpen: open,
        ...(open ? { settingsOpen: false, appSettingsOpen: false, pluginsOpen: false, triggersOpen: false } : {}),
      };
    }
    case "notice":
      return { ...state, notice: action.notice };
    case "revealThread":
      return { ...state, revealThread: { threadId: action.threadId, nonce: (state.revealThread?.nonce ?? 0) + 1 } };
    case "dataResultFocusConsumed":
      return state.dataResultFocus?.requestId === action.requestId
        ? { ...state, dataResultFocus: { ...state.dataResultFocus, consumed: true } } : state;
    case "toggleComputer": {
      const open = action.open ?? !state.computerOpen;
      return {
        ...state,
        computerOpen: open,
        settingsOpen: open ? false : state.settingsOpen,
        inspectorOpen: open ? false : state.inspectorOpen,
        activityOpen: open ? false : state.activityOpen,
        appSettingsOpen: open ? false : state.appSettingsOpen,
      };
    }
    case "toggleAppSettings": {
      const open = action.open ?? !state.appSettingsOpen;
      return {
        ...state,
        appSettingsOpen: open,
        activityOpen: open ? false : state.activityOpen,
        appSettingsSection: action.section ?? state.appSettingsSection,
        appSettingsCloudLink: action.cloudLink && open ? state.appSettingsCloudLink + 1 : 0,
        appSettingsPhonePairing: action.phonePairing && open ? state.appSettingsPhonePairing + 1 : 0,
        settingsOpen: open ? false : state.settingsOpen,
        computerOpen: open ? false : state.computerOpen,
        inspectorOpen: open ? false : state.inspectorOpen,
        pluginsOpen: open ? false : state.pluginsOpen,
        triggersOpen: open ? false : state.triggersOpen,
      };
    }
    case "updateBot": {
      const mascotChanged =
        Object.prototype.hasOwnProperty.call(action.patch, "color") ||
        Object.prototype.hasOwnProperty.call(action.patch, "mascotExpression");
      const animated = mascotChanged
        ? withMascotMotion(state, action.botId, "customize")
        : state;
      const target = animated.bots.find((bot) => bot.id === action.botId);
      const chiefSection = (action.patch.section ?? target?.section)?.trim() || "";
      const next = action.patch.chiefOfStaff
        ? {
            ...animated,
            bots: animated.bots.map((b) =>
              b.id === action.botId || (b.section?.trim() || "") !== chiefSection
                ? b
                : { ...b, chiefOfStaff: false },
            ),
          }
        : animated;
      const {
        acknowledgeLocalAuto: _localAck,
        confirmFullAccess: _fullConfirmation,
        applyToAllThreads: _allThreads,
        computer,
        connectorTools,
        connectorScopes,
        ...rest
      } = action.patch;
      const botPatch: Partial<Bot> = { ...rest };
      if (computer === null) botPatch.computer = undefined;
      else if (computer !== undefined) botPatch.computer = computer;
      // A dropped grants record returns the bot to the absent legacy field,
      // exactly like a cleared computer destination.
      if (connectorTools === null) botPatch.connectorTools = undefined;
      else if (connectorTools !== undefined) botPatch.connectorTools = connectorTools;
      if (connectorScopes === null) botPatch.connectorScopes = undefined;
      else if (connectorScopes !== undefined) botPatch.connectorScopes = connectorScopes;
      return updateBot(next, action.botId, (b) => ({ ...b, ...botPatch }));
    }
    case "threadActive": {
      const bot = state.bots.find((b) => b.threadId === action.threadId);
      if (!bot) return state;
      // The visible branch moved (an edit, a rewind, another client's switch).
      return updateBot(state, bot.id, (b) => ({
        ...b,
        activeLeafId: action.activeLeafId,
      }));
    }
    case "deleteTask":
    case "newGroupTask":
    case "deleteGroupTask":
    case "switchGroupTask":
      return state;
    case "newTask":
      // A chosen folder may fail validation. Keep the conversation beneath
      // its dialog in place until the server confirms the new thread.
      return action.cwd !== undefined ? state : { ...state, selectedId: action.botId, activeView: "chat" };
    case "switchTask": {
      return updateBot({ ...state, selectedId: action.botId, activeView: "chat" }, action.botId,
        (bot) => ({ ...bot, switchingTo: action.threadId }));
    }
    case "switchTaskFailed":
      return updateBot(state, action.botId, (bot) => bot.switchingTo === action.threadId ? { ...bot, switchingTo: undefined } : bot);
    case "taskSwitched": {
      const switched = updateBot(state, action.bot.id, (bot) => ({
        ...bot,
        ...action.bot,
        computer: action.bot.computer,
        toolScope: action.bot.toolScope,
        messages: action.bot.messages ?? [],
        // The snapshot decides whether this thread has scrollback. Merging
        // would carry the previous thread's answer onto a new one.
        hasMore: action.bot.hasMore,
        awaitingThreadSnapshot: false,
        switchingTo: undefined,
      }));
      // Only the conversation on screen draws a divider; a bot in the
      // background moving to another thread leaves it alone.
      const opened = switched.bots.find((bot) => bot.id === action.bot.id);
      if (opened && opened.id === switched.selectedId) {
        const withDivider = { ...switched, unreadDivider: openedUnreadDivider(switched, opened.threadId, threadOpensUnread(opened), visibleMessages(opened), threadReadCursor(opened)) };
        // …and on screen it is read, as `select` reads the thread it opens. The
        // snapshot predates the switch's own announcement, which told the
        // server so (the "bot" frame), and must not put the dot back.
        if (withDivider.activeView === "chat") return updateBot(withDivider, opened.id, (bot) => ({
          ...bot,
          unread: Boolean(bot.tasks?.some((task) => task.threadId !== bot.threadId && task.unread)),
          tasks: bot.tasks?.map((task) => task.threadId === bot.threadId ? { ...task, unread: false } : task),
        }));
        return withDivider;
      }
      return switched;
    }
    case "newBot":
    case "createRoutine":
    case "updateRoutine":
    case "deleteRoutine":
    case "runRoutine":
    case "cancelRoutineRun":
    case "markRoutineRunSeen":
    case "markAllRoutineRunsSeen":
      return state;
    case "computerStart": {
      const { [action.botId]: _ended, ...others } = state.computerStarts;
      return {
        ...(action.start ? withMascotMotion(state, action.botId, "launch") : state),
        computerStarts: action.start ? { ...others, [action.botId]: action.start } : others,
      };
    }
    case "computerControl":
      return {
        ...state,
        computerControl: {
          ...state.computerControl,
          [action.botId]: { held: action.held, helpReason: action.helpReason },
        },
      };
    default:
      return state;
  }
}

export const initialState: AppState = {
  bots: [],
  groups: [],
  sections: [],
  instances: [],
  config: null,
  selectedId: "",
  activeView: "chat",
  routines: [],
  routineRuns: [],
  routinesLoadState: "loading",
  routinesFocus: { nonce: 0 },
  webhooks: [],
  webhookAttempts: [],
  webhookIngress: null,
  settingsOpen: false,
  newBotOpen: false,
  botCreationPending: false,
  computerOpen: false,
  appSettingsOpen: false,
  appSettingsSection: "general",
  appSettingsCloudLink: 0,
  appSettingsPhonePairing: 0,
  botSettingsSection: "overview",
  botSettingsExpandAccordion: false,
  botSettingsSectionStored: false,
  botSettingsExpandRemembered: false,
  computerStarts: {},
  computerControl: {},
  dataResultFocus: null,
  unreadDivider: null,
  connected: false,
  error: null,
  notice: null,
  revealThread: null,
  mascotMotion: null,
  inspectorOpen: false,
  activityOpen: false,
  pluginsOpen: false,
  triggersOpen: false,
};

// ── API client ─────────────────────────────────────────────────────────
export class ApiError extends Error {
  readonly status: number;
  /** The refusal's JSON body, for callers that read more than `error`. */
  readonly body?: Record<string, unknown>;
  constructor(message: string, status: number, body?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Messages per thread in a snapshot, and per scrollback page. */
export const MESSAGE_PAGE_SIZE = 200;

export async function api<T = unknown>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  // timeoutMs races the fetch against AbortSignal.timeout, combined with any
  // caller signal so either can cancel. Omitted means no behavior change.
  const { timeoutMs, signal, ...rest } = init ?? {};
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...rest,
    signal: timeoutMs === undefined
      ? signal
      : signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = (body as { error?: unknown })?.error;
    const message = typeof error === "string" ? error : typeof (error as { message?: unknown } | null)?.message === "string" ? (error as { message: string }).message : `${res.status} ${res.statusText}`;
    throw new ApiError(message, res.status, body as Record<string, unknown>);
  }
  return body as T;
}

type TrustedApprovalBridge = {
  setMode(
    botId: string,
    mode: ApprovalMode,
    options?: { acknowledgeLocalAuto?: boolean; threadId?: string; threadOnly?: boolean; allThreads?: boolean; refreshPermissions?: boolean },
  ): Promise<BotAnnouncement>;
};

/** Composer changes use the same private bridge as bot settings, but never
 * change profile defaults. Confirmation is UI state, never an HTTP credential. */
export async function persistTaskApproval(
  botId: string, threadId: string, patch: TaskUpdatePatch,
  bridge: TrustedApprovalBridge | undefined,
  request: (path: string, init?: RequestInit) => Promise<{ bot: BotAnnouncement }> = api,
): Promise<BotAnnouncement> {
  const { approvalMode, autoApprove, confirmFullAccess, acknowledgeLocalAuto, ...ordinary } = patch;
  const mode = approvalMode ?? (autoApprove === undefined ? undefined : autoApprove ? "auto" : "ask");
  if (mode === "full" && confirmFullAccess !== true) throw new Error("Confirm Full access for this thread first");
  if ((mode === "full" || mode === "custom") && !bridge) throw new Error("This approval change requires the packaged desktop app");
  if (mode && bridge) {
    if (Object.keys(ordinary).length) await request(`/api/bots/${botId}/tasks/${threadId}`, { method: "PATCH", body: JSON.stringify(ordinary) });
    return bridge.setMode(botId, mode, { threadId, threadOnly: true, acknowledgeLocalAuto: acknowledgeLocalAuto === true });
  }
  const result = await request(`/api/bots/${botId}/tasks/${threadId}`, { method: "PATCH", body: JSON.stringify({ ...ordinary, approvalMode, autoApprove, acknowledgeLocalAuto }) });
  return result.bot;
}

/** Persist one coalesced bot edit without ever putting Full/Custom authority
 * on the bot-accessible HTTP surface. Entering a trusted mode writes ordinary
 * fields first, then grants authority. Leaving Custom reverses that order so a
 * coalesced provider switch is validated after the bot is back in Ask/Auto.
 * Exported for a small ordering/security contract test. */
export async function persistBotUpdate(
  botId: string,
  patch: BotUpdatePatch,
  signal: AbortSignal,
  request: (path: string, init?: RequestInit) => Promise<{ bot: BotAnnouncement }> = api,
  trustedApprovals: TrustedApprovalBridge | undefined =
    typeof window === "undefined" ? undefined : window.ogb?.approvals,
  currentBot?: BotAnnouncement,
): Promise<BotAnnouncement> {
  const {
    approvalMode,
    confirmFullAccess,
    applyToAllThreads,
    ...ordinaryPatch
  } = patch;
  const trustedMode = approvalMode === "full" || approvalMode === "custom"
    ? approvalMode
    : null;
  const leavesCustom = approvalMode !== undefined &&
    approvalModeFor(currentBot ?? {}) === "custom" &&
    approvalMode !== "custom";

  if (!trustedMode && !leavesCustom) {
    const result = await request(`/api/bots/${botId}`, {
      method: "PATCH",
      // The Full confirmation is renderer-local and has already been removed
      // above, including when a rapid later Ask/Auto choice was coalesced.
      body: JSON.stringify(
        approvalMode === undefined ? ordinaryPatch : { ...ordinaryPatch, approvalMode },
      ),
      signal,
    });
    return result.bot;
  }

  if (approvalMode === "full" && confirmFullAccess !== true) {
    throw new Error("Confirm the Full access warning before enabling it");
  }
  if (!trustedApprovals || approvalMode === undefined) {
    throw new Error("This approval-level change requires the packaged desktop app");
  }

  const trustedOptions = {
    acknowledgeLocalAuto: ordinaryPatch.acknowledgeLocalAuto === true,
    ...(applyToAllThreads ? { allThreads: true } : {}),
  };

  const rejectCancelledTrustedGrant = async () => {
    if (!signal.aborted) return;
    // IPC cannot cancel a grant that already reached the embedded server. If
    // a newer selection or an unmount aborted this operation while
    // Full/Custom was in flight, revoke it through the same private channel
    // before reporting cancellation. The server permits this one fail-closed
    // downgrade even if a turn happened to start in the response gap.
    if (approvalMode === "full" || approvalMode === "custom") {
      try {
        await trustedApprovals.setMode(botId, "ask", { acknowledgeLocalAuto: false, ...(applyToAllThreads ? { allThreads: true } : {}) });
      } catch (error) {
        throw new Error(
          `The cancelled ${approvalMode === "full" ? "Full access" : "Custom approval"} grant could not be revoked: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    throw new DOMException("The bot update was cancelled", "AbortError");
  };

  if (leavesCustom) {
    const modeBot = await trustedApprovals.setMode(botId, approvalMode, trustedOptions);
    await rejectCancelledTrustedGrant();
    if (Object.keys(ordinaryPatch).length === 0) return modeBot;
    const result = await request(`/api/bots/${botId}`, {
      method: "PATCH",
      body: JSON.stringify(ordinaryPatch),
      signal,
    });
    return result.bot;
  }

  if (Object.keys(ordinaryPatch).length > 0) {
    await request(`/api/bots/${botId}`, {
      method: "PATCH",
      // Local-computer + Auto consent remains relevant when the approval
      // transition itself uses the private channel (for example, a coalesced
      // Auto -> Full edit). The HTTP computer update must retain that proof.
      body: JSON.stringify(ordinaryPatch),
      signal,
    });
  }
  if (signal.aborted) throw new DOMException("The bot update was cancelled", "AbortError");
  const modeBot = await trustedApprovals.setMode(botId, approvalMode, trustedOptions);
  await rejectCancelledTrustedGrant();
  return modeBot;
}

export interface PeripheralSnapshotLoad<Key extends string = string> {
  key: Key;
  load: () => Promise<void>;
}

function normalizeSnapshotFailure(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/** A refused SSE resume needs the chat transcript snapshot before its cursor
 * can be acknowledged. The other panels should refresh at the same boundary,
 * but a broken optional endpoint must not hold every chat frame hostage. */
export async function loadSnapshotBoundary<Key extends string>(
  loadChat: () => Promise<void>,
  peripherals: readonly PeripheralSnapshotLoad<Key>[],
  onPeripheralFailure: (part: PeripheralSnapshotLoad<Key>, error: Error) => void,
): Promise<boolean> {
  const [chat, ...settledPeripherals] = await Promise.allSettled([
    loadChat(),
    ...peripherals.map((part) => part.load()),
  ]);
  settledPeripherals.forEach((result, index) => {
    if (result.status === "rejected") {
      onPeripheralFailure(peripherals[index]!, normalizeSnapshotFailure(result.reason));
    }
  });
  return chat.status === "fulfilled";
}

const StoreContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  /** Commit any debounced profile edits before an operation reads the bot. */
  flushBotPatches: (botId: string) => Promise<BotAnnouncement | null>;
} | null>(null);

/** Lazy useReducer init: adopt the section this device last viewed once per
 * launch, so a bare open starts there. The exported initialState stays
 * "overview"/false and the reducer never touches localStorage. */
function restoreBotSettingsSection(state: AppState): AppState {
  const section = readLastBotSection();
  return section ? { ...state, botSettingsSection: section, botSettingsSectionStored: true } : state;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const taskWrites = useRef(new Map<string, { botId: string; updatesDefault: boolean; promise: Promise<BotAnnouncement>; execution: Promise<unknown>; patch: TaskUpdatePatch }>()).current;
  const withTaskWrites = (bot: BotAnnouncement): BotAnnouncement => ({
    ...bot,
    tasks: bot.tasks?.map((task) => ({ ...task, ...taskPatchFields(taskWrites.get(task.threadId)?.patch ?? {}) })),
  });
  const [state, rawDispatch] = useReducer(reducer, initialState, restoreBotSettingsSection);
  const stateRef = useRef(state);
  stateRef.current = state;
  const showThreads = useShowThreads();
  const showThreadsRef = useRef(showThreads);
  showThreadsRef.current = showThreads;
  const clearChatError = useCallback(() => {
    rawDispatch({ type: "error", message: null });
  }, []);
  useChatErrorClear(state.error, clearChatError);
  // Every selection path lands on state.selectedId, so one effect is the
  // whole remember; an empty selection must never overwrite it.
  useEffect(() => {
    if (state.selectedId) rememberConversation(state.selectedId);
  }, [state.selectedId]);
  // Rail clicks, deep links and remembered openings all carry the accordion
  // flag, so only a section actually viewed is written; a bare open that
  // stays collapsed never is.
  useEffect(() => {
    if (state.settingsOpen && state.botSettingsExpandAccordion) rememberBotSection(state.botSettingsSection);
  }, [state.settingsOpen, state.botSettingsExpandAccordion, state.botSettingsSection]);
  const botPatchQueue = useMemo(
    () =>
      createBotPatchQueue({
        send: (botId, patch, signal, currentBot) =>
          persistBotUpdate(botId, patch, signal, api, window.ogb?.approvals, currentBot),
        reconcile: async (botId, signal) => {
          const result: { bots: BotAnnouncement[] } = await api(`/api/bots?messages=${MESSAGE_PAGE_SIZE}`, { signal });
          return result.bots.find((candidate) => candidate.id === botId) ?? null;
        },
        onAuthoritative: (bot, optimisticOverlay) => {
          rawDispatch({ type: "botPatched", bot: withTaskWrites({ ...bot, ...optimisticOverlay }) });
        },
        onError: (error) => {
          rawDispatch({ type: "error", message: error.message });
        },
      }),
    [],
  );

  useEffect(() => {
    // StrictMode's dev probe runs this cleanup once against the same memoized
    // queue; revive undoes it so profile saves survive development mounts.
    botPatchQueue.revive();
    return () => botPatchQueue.dispose();
  }, [botPatchQueue]);

  const dispatch = useMemo(() => {
    const navigation = new Map<string, number>();
    let selectionRevision = 0;
    const showError = (e: unknown) => {
      rawDispatch({ type: "error", message: e instanceof Error ? e.message : String(e) });
    };

    const persistTaskPatch = (botId: string, threadId: string, patch: TaskUpdatePatch) => {
      const previous = taskWrites.get(threadId);
      // A quick tab switch may queue two default changes on different threads.
      // Keep their order, and don't let a group send race either pending save.
      const defaults = patch.updateBotDefault || patch.approvalMode !== undefined
        ? [...taskWrites.values()].filter((write) => write.botId === botId) : [];
      const promise = Promise.all([previous?.promise, ...defaults.map((write) => write.promise)].map((save) => save?.catch(() => {})))
        .then(async () => {
          // The private path is required for Custom; use it for every
          // confirmed desktop switch so optimistic Ask cannot hide the
          // original mode while a pending write waits its turn.
          if (patch.resetApprovalToAsk && window.ogb?.approvals) {
            return window.ogb.approvals.setMode(botId, "ask", {
              threadId, modelSelection: patch.modelSelection, updateBotDefault: Boolean(patch.updateBotDefault),
            });
          }
          return persistTaskApproval(botId, threadId, patch, window.ogb?.approvals);
        });
      // Later edits still get saved after an earlier failure, but a send
      // awaiting this batch must observe every rejected setting in it. A
      // successful folder move is not confirmation of a failed model change.
      const execution = Promise.all([previous?.execution, promise]);
      void execution.catch(() => {}); // handled by the write and send paths
      const pending = { botId, updatesDefault: Boolean(patch.updateBotDefault || previous?.updatesDefault), patch: { ...previous?.patch, ...patch }, promise, execution };
      taskWrites.set(threadId, pending);
      void pending.promise.then((bot) => {
        if (taskWrites.get(threadId) !== pending) return;
        taskWrites.delete(threadId);
        if (bot) rawDispatch({ type: "botPatched", bot: withTaskWrites(bot) });
      }).catch((error) => {
        showError(error);
        // Block sends until authoritative settings have been restored. Do
        // not clear the failed write if reconciliation also fails or a newer
        // write supersedes it: those settings are still unconfirmed.
        if (taskWrites.get(threadId) === pending) {
          pending.patch = {};
          void api(`/api/bots?messages=${MESSAGE_PAGE_SIZE}`).then((body: unknown) => {
            if (taskWrites.get(threadId) !== pending) return;
            const bot = (body as { bots?: Bot[] }).bots?.find((candidate: Bot) => candidate.id === botId);
            if (bot) {
              rawDispatch({ type: "botPatched", bot: withTaskWrites(bot) });
              taskWrites.delete(threadId);
            }
          }).catch(() => {});
        }
      });
    };

    const waitForExecutionSettings = async (expectedBots: Bot[], threadId?: string) => {
      // Capture this send's task save before waiting on slower profile saves.
      const taskWrite = threadId ? taskWrites.get(threadId)?.execution : undefined;
      const defaultWrites = [...taskWrites.values()].filter((write) => write.updatesDefault && expectedBots.some((bot) => bot.id === write.botId));
      await Promise.all([taskWrite, ...defaultWrites.map((write) => write.execution), ...expectedBots.map(async (expected) => {
        const persisted = await botPatchQueue.flush(expected.id);
        if (!persisted) return;
        const expectedSelection = expected.modelSelection;
        if (
          approvalModeFor(persisted) !== approvalModeFor(expected) ||
          (persisted.memoryEnabled !== false) !== (expected.memoryEnabled !== false) ||
          persisted.modelSelection.instanceId !== expectedSelection.instanceId ||
          persisted.modelSelection.model !== expectedSelection.model ||
          persisted.modelSelection.effort !== expectedSelection.effort ||
          persisted.modelSelection.variant !== expectedSelection.variant
        ) {
          throw new Error("The approval level, memory setting, or model could not be saved, so this work was not started");
        }
      })]);
      if (threadId) await taskWrites.get(threadId)?.execution;
    };

    const wrapped: React.Dispatch<Action> = (action) => {
      // Deferred folder creation may select its bot only while it is still
      // the latest navigation intent, even if the person went away and back.
      if (["select", "newTask", "switchTask", "newGroupTask", "switchGroupTask", "showChat", "showRoutines", "showTeamMap"].includes(action.type)) selectionRevision++;
      // Pin before any await or optimistic state change, including legacy
      // callers such as keyboard shortcuts and voice controls.
      action = pinBotThreadAction(action, stateRef.current.bots);
      if (action.type === "taskSwitched") action = { ...action, bot: withTaskWrites(action.bot) as Bot };
      if (action.type === "botPatched") action = { ...action, bot: withTaskWrites(action.bot) };
      if (action.type === "send" && !action.sendId) {
        // ponytail: backend rejects non-UUID sendIds (400) — fallback stays
        // UUID-shaped so the send still lands where randomUUID is missing.
        const bytes = globalThis.crypto?.getRandomValues
          ? globalThis.crypto.getRandomValues(new Uint8Array(16))
          : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        const fallback = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        action = {
          ...action,
          sendId: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : fallback,
        };
      }
      rawDispatch(action);
      switch (action.type) {
        case "notice":
          if (action.notice) setTimeout(() => rawDispatch({ type: "notice", notice: null }), 6000);
          break;
        case "createRoutine":
          api("/api/routines", { method: "POST", body: JSON.stringify(action.input) }).catch(showError);
          break;
        case "updateRoutine":
          api(`/api/routines/${action.routineId}`, {
            method: "PATCH",
            body: JSON.stringify(action.patch),
          }).catch(showError);
          break;
        case "deleteRoutine":
          api(`/api/routines/${action.routineId}`, { method: "DELETE" }).catch(showError);
          break;
        case "runRoutine": {
          const routine = stateRef.current.routines.find((candidate) => candidate.id === action.routineId);
          const ids = new Set(routine ? [routine.botId] : []);
          if (routine?.target === "room-goal" && routine.groupId) {
            const group = stateRef.current.groups.find((candidate) => candidate.id === routine.groupId);
            for (const memberId of group?.memberIds ?? []) ids.add(memberId);
          }
          const executionBots = stateRef.current.bots.filter((candidate) => ids.has(candidate.id));
          void waitForExecutionSettings(executionBots)
            .then(() => api(`/api/routines/${action.routineId}/run`, { method: "POST" }))
            .then((body: unknown) => action.onStarted?.((body as { run: RoutineRun }).run))
            .catch((error) => {
              if (action.onError) action.onError(error);
              else showError(error);
            })
            .finally(() => action.onSettled?.());
          break;
        }
        case "cancelRoutineRun":
          api(`/api/routine-runs/${action.runId}/cancel`, { method: "POST" }).catch(showError);
          break;
        case "markRoutineRunSeen":
          api(`/api/routine-runs/${action.runId}/seen`, { method: "POST" }).catch(showError);
          break;
        case "markAllRoutineRunsSeen":
          api("/api/routine-runs/seen-all", { method: "POST" }).catch(showError);
          break;
        case "select": {
          const id = action.id;
          const bot = stateRef.current.bots.find((b) => b.id === id);
          const group = stateRef.current.groups.find((g) => g.id === id);
          if (bot?.unread) {
            api(`/api/bots/${id}/read`, { method: "POST", body: JSON.stringify({ threadId: bot.threadId }) }).catch(() => {});
          } else if (group?.unread) {
            api(`/api/groups/${id}/read`, { method: "POST" }).catch(() => {});
          }
          break;
        }
        case "send": {
          const sendId = action.sendId;
          const threadId = action.threadId ?? stateRef.current.bots.find((b) => b.id === action.botId)?.threadId;
          if (!sendId || !threadId) {
            action.onError?.("no thread");
            break;
          }
          void api<{ message?: Message; threadId?: string }>(`/api/bots/${action.botId}/messages`, {
            method: "POST",
            body: JSON.stringify({ text: action.text, threadId, sendId }),
          })
            .then((body) => {
              if (body?.message && typeof body.threadId === "string") {
                rawDispatch({ type: "messageAdded", threadId: body.threadId, message: body.message });
              }
            })
            .catch((error) => {
              rawDispatch({ type: "sendFailed", threadId, sendId });
              if (action.onError) action.onError(error instanceof Error ? error.message : String(error));
              else showError(error);
            });
          break;
        }
        case "updateTask":
          persistTaskPatch(action.botId, action.threadId, action.patch);
          break;
        // tasks: the server answers with the bot AND the live transcript,
        // because switching changes which conversation is on screen
        case "newTask":
        case "switchTask": {
          const revision = (navigation.get(action.botId) ?? 0) + 1;
          navigation.set(action.botId, revision);
          const selectedAtStart = selectionRevision;
          const ready = action.type === "newTask"
            ? botPatchQueue.flush(action.botId)
            : Promise.resolve();
          // A new task's thread is empty, so only the switch needs a page.
          void ready.then(() => api<{ bot: Bot }>(action.type === "newTask"
            ? `/api/bots/${action.botId}/tasks`
            : `/api/bots/${action.botId}/tasks/${action.threadId}${action.whole ? "" : `?messages=${MESSAGE_PAGE_SIZE}`}`, { method: "POST", body: JSON.stringify(action.type === "newTask" ? { projectId: action.projectId, cwd: action.cwd } : {}) }))
            .then((r) => {
              if (action.type === "newTask") action.onCreated?.();
              if (!r?.bot || navigation.get(action.botId) !== revision) return;
              const selectsAfterCreation = action.type === "newTask" && action.cwd !== undefined;
              if (selectsAfterCreation && selectionRevision !== selectedAtStart) return;
              dispatch({ type: "taskSwitched", bot: r.bot });
              if (selectsAfterCreation) rawDispatch({ type: "select", id: action.botId });
            })
            .catch((error) => {
              // The latest switch, failed, leaves the thread it was on on screen.
              if (action.type === "switchTask" && navigation.get(action.botId) === revision) {
                rawDispatch({ type: "switchTaskFailed", botId: action.botId, threadId: action.threadId });
              }
              if (action.type === "newTask" && action.onError) action.onError(error instanceof Error ? error.message : String(error));
              else showError(error);
            });
          break;
        }
        // Channel tasks mirror bot tasks, but hydrate the whole channel so
        // switching atomically replaces its transcript, folder and pin.
        case "switchGroupTask":
          api<{ group?: Partial<Group> & { id: string } }>(`/api/groups/${action.groupId}/tasks/${action.threadId}?messages=${MESSAGE_PAGE_SIZE}`, { method: "POST" })
            .then((r) => r?.group && dispatch({ type: "groupPatched", group: r.group }))
            .catch(showError);
          break;
        case "updateBot": {
          const botBeforeUpdate = stateRef.current.bots.find((candidate) => candidate.id === action.botId);
          if (botBeforeUpdate) {
            botPatchQueue.enqueue(action.botId, action.patch, botBeforeUpdate);
          }
          break;
        }
        default:
          break;
      }
    };
    return wrapped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botPatchQueue]);

  // The app opens the bot it remembers as that bot's row would (openBot):
  // with threads hidden at its main thread, not at a thread an activity row
  // or a notification left it on, where the person's next words would make
  // that thread theirs and leave their own conversation behind. Once, at the
  // first snapshot. With threads shown the bot stays where it was.
  const launched = useRef(false);
  useEffect(() => {
    if (!state.hydrated || launched.current) return;
    launched.current = true;
    const bot = state.bots.find((candidate) => candidate.id === state.selectedId);
    if (bot && state.activeView === "chat" && botOpensTo(bot, showThreads) !== bot.threadId) openBot(dispatch, bot, showThreads);
  }, [state.hydrated, state.bots, state.selectedId, state.activeView, showThreads, dispatch]);

  // ── initial load + SSE fold ──────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    type PeripheralKey = "instances" | "config" | "routines" | "webhooks";
    type PeripheralPart = {
      key: PeripheralKey;
      request: () => Promise<() => void>;
    };
    type PeripheralRefresh = {
      attempt: number;
      generation: number;
      timer: ReturnType<typeof setTimeout> | null;
      version: number;
    };
    const peripheralRefresh = new Map<PeripheralKey, PeripheralRefresh>();
    const refreshState = (key: PeripheralKey) => {
      let current = peripheralRefresh.get(key);
      if (!current) {
        current = { attempt: 0, generation: 0, timer: null, version: 0 };
        peripheralRefresh.set(key, current);
      }
      return current;
    };
    const peripheralParts: PeripheralPart[] = [
      {
        key: "instances",
        request: async () => {
          const { instances } = await api("/api/instances") as { instances: InstanceInfo[] };
          return () => rawDispatch({ type: "instances", instances });
        },
      },
      {
        key: "config",
        request: async () => {
          const config = await api("/api/config") as ConfigStatus;
          return () => rawDispatch({ type: "configStatus", config });
        },
      },
      {
        key: "routines",
        request: async () => {
          const { routines, runs } = await api("/api/routines") as { routines: Routine[]; runs: RoutineRun[] };
          return () => rawDispatch({ type: "routinesHydrated", routines, runs });
        },
      },
      ...(window.ogb?.remoteClient?.active ? [] : [{
        key: "webhooks",
        request: async () => {
          const { webhooks, attempts, ingress } = await api("/api/webhooks") as { webhooks: WebhookTrigger[]; attempts?: WebhookAttempt[]; ingress: WebhookIngressStatus };
          return () =>
            rawDispatch({ type: "webhooksHydrated", webhooks, attempts: attempts ?? [], ingress });
        },
      } satisfies PeripheralPart]),
    ];
    const partByKey = new Map(peripheralParts.map((part) => [part.key, part]));
    const schedulePeripheralRetry = (part: PeripheralPart, error?: Error) => {
      if (!alive) return;
      const refresh = refreshState(part.key);
      if (refresh.timer) return;
      if (error !== undefined) {
        if (part.key === "routines") rawDispatch({ type: "routinesLoadFailed" });
        console.warn(`snapshot: ${part.key} refresh failed; retrying`, error);
      }
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(refresh.attempt, 5));
      refresh.attempt += 1;
      refresh.timer = setTimeout(() => {
        refresh.timer = null;
        void loadPeripheral(part, true).catch((nextError) => schedulePeripheralRetry(part, nextError));
      }, delay);
    };
    const loadPeripheral = async (part: PeripheralPart, protectLiveFrames: boolean): Promise<void> => {
      const refresh = refreshState(part.key);
      if (refresh.timer) {
        clearTimeout(refresh.timer);
        refresh.timer = null;
      }
      const generation = ++refresh.generation;
      const version = refresh.version;
      try {
        const apply = await part.request();
        if (!alive || refresh.generation !== generation) return;
        // A background retry must never replace a live patch that arrived
        // after its request began. Discard that stale response and try again
        // from the newer event boundary instead.
        if (protectLiveFrames && refresh.version !== version) {
          schedulePeripheralRetry(part);
          return;
        }
        apply();
        refresh.attempt = 0;
      } catch (error) {
        // A newer refresh owns this lane now; its result will decide whether
        // another retry is needed.
        if (!alive || refresh.generation !== generation) return;
        throw normalizeSnapshotFailure(error);
      }
    };
    const bumpPeripheralVersion = (...keys: PeripheralKey[]) => {
      for (const key of keys) refreshState(key).version += 1;
    };
    const loadAll = async (): Promise<boolean> => {
      const chat = () =>
        api(`/api/bots?messages=${MESSAGE_PAGE_SIZE}`).then((body) => {
          if (!alive) return;
          const { bots, groups, sections, computerControl } = body as {
            bots: Bot[]; groups?: Group[]; sections?: string[];
            computerControl?: Record<string, { held: boolean; helpReason: string | null }>;
          };
          rawDispatch({
            type: "hydrate",
            bots,
            groups: groups ?? [],
            sections: sections ?? [],
            computerControl: computerControl ?? {},
            resumeId: readLastConversation() ?? undefined,
          });
        });
      const peripherals = peripheralParts.map((part) => ({
        key: part.key,
        load: () => loadPeripheral(part, false),
      }));
      const chatReady = await loadSnapshotBoundary(chat, peripherals, (failed, error) => {
        const part = partByKey.get(failed.key);
        if (part) schedulePeripheralRetry(part, error);
      });
      return alive && chatReady;
    };

    // A snapshot and the live fold have to meet at a defined boundary. Start
    // hydration only after the stream says hello, queue frames that arrive
    // while the REST snapshot is in flight, then apply them on top. Otherwise
    // a late hydrate can overwrite a newer event, or an event can land between
    // an eager request and the stream opening and disappear entirely.
    let hydrated = false;
    let hydrationPromise: Promise<boolean> | null = null;
    let rehydrateRequested = false;
    const pendingFrames: ServerFrame[] = [];
    let handleFrame: (frame: ServerFrame) => void;
    const hydrate = (): Promise<boolean> => {
      if (hydrationPromise) {
        // A second non-resumable hello means this snapshot may have started
        // before another connection gap. Run one more after it settles.
        rehydrateRequested = true;
        return hydrationPromise;
      }
      hydrated = false;
      hydrationPromise = (async () => {
        let loaded = false;
        do {
          rehydrateRequested = false;
          loaded = await loadAll();
        } while (alive && rehydrateRequested);
        if (!alive || !loaded) return false;
        hydrated = true;
        for (const frame of pendingFrames.splice(0)) handleFrame(frame);
        return true;
      })().finally(() => {
        hydrationPromise = null;
      });
      return hydrationPromise;
    };
    // If SSE is unavailable, the app should still show its saved state. A
    // later first hello hydrates again because it cannot prove there was no
    // gap before that connection opened.
    const hydrationFallback = setTimeout(hydrate, 1_000);

    // The hydrate decision belongs to the hello frame, not to onopen: the
    // server replays what we missed when it can, and re-downloading every
    // transcript on a reconnect it already covered is pure waste.
    handleFrame = (frame) => {
      if (frame.kind === "config") bumpPeripheralVersion("config", "instances");
      else if (frame.kind === "routine" || frame.kind === "routine.deleted" || frame.kind === "routine.run") {
        bumpPeripheralVersion("routines");
      } else if (
        frame.kind === "webhook" ||
        frame.kind === "webhook.attempt" ||
        frame.kind === "webhook.deleted"
      ) {
        bumpPeripheralVersion("webhooks");
      }
      switch (frame.kind) {
        case "sections":
          rawDispatch({ type: "sections", sections: frame.sections });
          break;
        case "thread":
          rawDispatch({ type: "threadActive", threadId: frame.threadId, activeLeafId: frame.activeLeafId });
          break;
        case "bot": {
          const bot = frame.bot as BotAnnouncement;
          // reading the selected chat clears its badge immediately: the
          // thread on screen, the one a switch is opening while it is under
          // way (this frame may be its own announcement), never one it leaves
          const selected = stateRef.current.bots.find((candidate) => candidate.id === bot.id);
          const shown = selected?.switchingTo ?? selected?.threadId;
          const selectedTask = bot.tasks?.find((task) => task.threadId === shown);
          if (bot.id === stateRef.current.selectedId && stateRef.current.activeView === "chat" &&
              (selectedTask?.unread || (!bot.tasks && bot.unread))) {
            if (selectedTask) selectedTask.unread = false;
            // Hidden routine runs must not put the dot back on the next frame.
            // No task list: the bot flag is the unread signal.
            bot.unread = botShowsUnread(bot);
            fetch(`/api/bots/${bot.id}/read`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: shown }) }).catch(() => {});
          }
          rawDispatch({
            type: "botPatched",
            bot: withTaskWrites({ ...bot, ...botPatchQueue.overlayFor(bot.id) }),
          });
          break;
        }
        case "group": {
          const group = frame.group as Partial<Group> & { id: string };
          // reading the selected room clears its badge immediately
          if (group.unread && group.id === stateRef.current.selectedId) {
            group.unread = false;
            fetch(`/api/groups/${group.id}/read`, { method: "POST" }).catch(() => {});
          }
          rawDispatch({ type: "groupPatched", group });
          break;
        }
        case "group.deleted":
          rawDispatch({ type: "groupDeleted", groupId: frame.groupId });
          break;
        case "routine":
          rawDispatch({ type: "routinePatched", routine: frame.routine });
          break;
        case "routine.deleted":
          rawDispatch({ type: "routineDeleted", routineId: frame.routineId });
          break;
        case "routine.run":
          rawDispatch({ type: "routineRunPatched", run: frame.run });
          break;
        case "webhook":
          rawDispatch({ type: "webhookPatched", webhook: frame.webhook });
          break;
        case "webhook.attempt":
          rawDispatch({ type: "webhookAttempted", attempt: frame.attempt });
          break;
        case "webhook.deleted":
          rawDispatch({ type: "webhookDeleted", webhookId: frame.webhookId });
          break;
        case "screen":
          // The picture went to the Computer panel (publishLiveFrame). For
          // the store, a first frame only means the computer is set up.
          if (stateRef.current.computerStarts[frame.botId]) {
            rawDispatch({ type: "computerStart", botId: frame.botId, start: null });
          }
          break;
        case "computer":
          rawDispatch({ type: "computerStart", botId: frame.botId,
            start: { state: frame.state, ...(frame.place ? { place: frame.place } : {}) } });
          break;
        case "computer-control":
          rawDispatch({
            type: "computerControl",
            botId: frame.botId,
            held: frame.held === true,
            helpReason: typeof frame.helpReason === "string" ? frame.helpReason : null,
          });
          break;
        case "bot.deleted":
          botPatchQueue.cancel(frame.botId);
          rawDispatch({ type: "deleteBot", botId: frame.botId });
          break;
        // a key changed and the fleet hot-reloaded — refresh the picker so
        // newly available providers un-dim immediately
        case "config":
          rawDispatch({
            type: "configStatus",
            config: configStatusFromFrame(frame as unknown as ConfigStatusFrame),
          });
          {
            const instances = partByKey.get("instances");
            if (instances) {
              void loadPeripheral(instances, true).catch((error) =>
                schedulePeripheralRetry(instances, error),
              );
            }
          }
          break;
        default:
          // Transcript, call, queue, notify, runtime and data frames belong
          // to surfaces this island does not port (chat, calls, composer);
          // open panels read what the store does not keep via
          // publishLiveFrame below.
          break;
      }
    };
    const stopLive = openLiveEvents({
      onOpen: () => rawDispatch({ type: "connected", value: true }),
      onError: () => rawDispatch({ type: "connected", value: false }),
      onSnapshotRequired: () => {
        clearTimeout(hydrationFallback);
        publishMissedFrames();
        // Frames buffered before this non-resumable stream belong to an
        // abandoned generation. Keep the new generation behind hydrate().
        pendingFrames.splice(0);
        return hydrate();
      },
      onFrame: (frame) => {
        // Open panels read what the store does not keep (live screens, raw
        // runtime events) from this same stream.
        publishLiveFrame(frame as ServerFrame);
        if (hydrated) handleFrame(frame as ServerFrame);
        else pendingFrames.push(frame as ServerFrame);
      },
    });
    return () => {
      alive = false;
      clearTimeout(hydrationFallback);
      for (const refresh of peripheralRefresh.values()) {
        if (refresh.timer) clearTimeout(refresh.timer);
      }
      stopLive();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushBotPatches = useCallback(
    (botId: string) => botPatchQueue.flush(botId),
    [botPatchQueue],
  );
  const value = useMemo(
    () => ({ state, dispatch, flushBotPatches }),
    [state, dispatch, flushBotPatches],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}

/** Scoped state for an unsaved editor. The parent workspace remains intact. */
export function BotEditorStore({ value, children }: { value: ReturnType<typeof useStore>; children: ReactNode }) {
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// Building a formatter costs far more than formatting with one, and every
// row shows a time: build it once. No locale given, as before: times follow
// the system's clock style, not the app language.
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatTime(at: number) {
  const date = new Date(at);
  // what toLocaleTimeString says, where a formatter would throw
  return Number.isNaN(date.getTime()) ? "Invalid Date" : TIME_FORMAT.format(date);
}
