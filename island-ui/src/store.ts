// Steroids island store — views, pills, chat, approvals.
// Ours: steroids always orange, everyone else dim gray (benchmark rule).

export type IslandView =
  | "explore"
  | "approval"
  | "question"
  | "chat"
  | "daily"
  | "lens"
  | "settings"
  | "finished";

export interface Pill {
  id: string;
  label: string;
  color: string;
  badge?: string | null;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
}

export interface Approval {
  requestId: string;
  title: string;
  detail: string;
  options: string[];
}

export interface Question {
  title: string;
  choices: string[];
  multi: boolean;
}

export interface ChatSession {
  id: number;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  cloudId?: string; // steroid_chats.chat_id — set on cloud merge, sent back on push
}

export function sessionTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const raw = (first?.content ?? "").trim() || "Untitled chat";
  return raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
}

export interface AgentSession {
  session: string;
  ts: number;
  agent: string;
  first: string;
}

export interface SkillHit {
  name: string;
  description: string;
}

export interface TrendItem {
  skill: string;
  n: number;
}

export interface RecentRoute {
  skills: string[];
  ts: number;
}

export interface ExploreFeed {
  trending: TrendItem[];
  recent: RecentRoute[];
}

export interface Attachment {
  id: number;
  name: string;
  size: number;
  kind: "image" | "code" | "doc" | "audio" | "other";
  url?: string;
}

export function classifyAttachment(name: string, mime = ""): Attachment["kind"] {
  if (mime.startsWith("audio")) return "audio";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["py", "js", "ts", "tsx", "md", "json", "sh", "rs", "toml"].includes(ext)) return "code";
  if (["pdf", "txt", "log"].includes(ext)) return "doc";
  return "other";
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export const ROUTE_SAMPLES = [
  "build,flutter -> dart-flutter-patterns/…",
  "write a git commit message -> git-commit-helper/…",
  "no confident skill — abstaining",
  "deploy preview -> vercel-deploy/…",
];

export const HARNESS_PILLS: Pill[] = [
  { id: "router", label: "steroids", color: "#ff4d1c" },
  { id: "opencode", label: "opencode", color: "#3d3e45", badge: "idle" },
  { id: "claude", label: "claude", color: "#3d3e45", badge: "idle" },
  { id: "codex", label: "codex", color: "#3d3e45", badge: "idle" },
  { id: "ollama", label: "ollama", color: "#3d3e45", badge: "idle" },
];
