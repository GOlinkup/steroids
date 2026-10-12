// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// The Files tab of the bot's computer panel (Simple mode): where the bot
// keeps its working files, and the files this conversation's turns created
// or changed. The list is read from the turn digests the chat already
// holds, so the tab costs no request of its own.
//
// Trimmed cut: the original resolves bot-authored Markdown links through a
// Markdown AST (AttachmentGallery) and saves through the shared
// AttachedFileChip (AttachmentPreview + TableFilePreview). Both pull the
// chat renderer in; here link extraction is a plain Markdown-link scan and
// the chip downloads through the same message-scoped file endpoint.
import { useMemo, useRef, useState } from "react";
import { Check, Download, FileText, FolderOpen, LoaderCircle } from "lucide-react";
import { useStore, visibleMessages, type Bot } from "../shared/store";
import { useDesktopCapabilities } from "../shared/desktop-capabilities";
import { shortPath } from "../shared/short-path";
import { t } from "../shared/i18n";
import { cn } from "../shared/cn";

const MAX_FILES = 20;

/** Newest first, each path once; a path whose latest turn deleted it is left out. */
export function recentChangedFiles(bot: Bot, limit = MAX_FILES): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  const messages = visibleMessages(bot);
  for (let index = messages.length - 1; index >= 0 && files.length < limit; index -= 1) {
    const digestFiles = messages[index]!.digest?.files;
    if (!digestFiles) continue;
    for (const path of digestFiles.deleted) seen.add(path);
    for (const path of [...digestFiles.added, ...digestFiles.changed]) {
      if (seen.has(path)) continue;
      seen.add(path);
      files.push(path);
      if (files.length >= limit) break;
    }
  }
  return files;
}

export interface FilesPaneFile {
  path: string;
  name: string;
  /** A bot-authored Markdown link, still checked by the server on click. */
  linked?: boolean;
  /** Attached with attach_file: the message itself authorizes the download. */
  priv?: boolean;
}

export interface MessageAttachmentContext { threadId: string; messageId: string }

function attachmentBasename(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return (cut < 0 ? path : path.slice(cut + 1)).split(/[?#]/, 1)[0] || path;
}

/** Presentation-only identity for dedup, never an authorization check. */
function fileIdentity(path: string): string {
  if (/^file:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      return decodeURIComponent(url.pathname) || path;
    } catch {
      return path;
    }
  }
  try { return decodeURIComponent(path.split(/[?#]/, 1)[0]!); }
  catch { return path; }
}

/** Whether a Markdown link target names a local file rather than a remote URL. */
function isLocalFileHref(href: string): boolean {
  const text = href.trim();
  if (!text || /^(?:https?:|data:|blob:|mailto:|about:)/i.test(text)) return false;
  if (/^file:\/\//i.test(text)) return true;
  if (/^[a-z]:[\\/]/i.test(text) || text.startsWith("\\\\")) return true;
  if (text.startsWith("/") || text.startsWith("~/") || text.startsWith("./") || text.startsWith("../")) return true;
  // A bare relative path with a file extension (docs/report.md). The server
  // validates every click against the conversation's folders regardless.
  return /^[^?#\s]+\.[a-z0-9]{1,10}([?#]|$)/i.test(text);
}

/** Real Markdown links only: prose and remote URLs don't turn into file cards.
 * The server independently validates every click. */
function collectMessageFiles(text: string, existingPaths: readonly string[] = []): FilesPaneFile[] {
  const seen = new Set(existingPaths.map(fileIdentity));
  const files: FilesPaneFile[] = [];
  const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text)) !== null) {
    const href = match[1] ?? "";
    if (!isLocalFileHref(href)) continue;
    const identity = fileIdentity(href);
    if (seen.has(identity)) continue;
    seen.add(identity);
    files.push({ path: href, name: attachmentBasename(identity) || identity, linked: true });
  }
  return files;
}

type MessageAttachmentEntry = { path: string; kind?: string; name?: string };

/** A bot message's stored attachments: image paths, plus documents, audio and
 * video attached with attach_file as private files (authorized by the message
 * itself, like a user's own upload). */
function splitMessageAttachments(attachments: readonly MessageAttachmentEntry[] = []): { images: string[]; files: FilesPaneFile[] } {
  const images: string[] = [];
  const files: FilesPaneFile[] = [];
  for (const attachment of attachments) {
    if (attachment.kind === "file") files.push({ path: attachment.path, name: attachment.name || attachmentBasename(attachment.path), priv: true });
    else if (attachment.kind === "image" || attachment.kind === undefined) images.push(attachment.path);
  }
  return { images, files };
}

interface SharedFile {
  file: FilesPaneFile;
  message: MessageAttachmentContext;
}

/** A digest records changes, not permission to read a path. Reuse only a
 * visible bot reply's existing file grant, keeping its original URL spelling
 * and exact message id for the server to validate on every click. */
export function sharedFileReferences(bot: Bot): Map<string, SharedFile> {
  const references = new Map<string, SharedFile>();
  const task = bot.tasks?.find((candidate) => candidate.threadId === bot.threadId);
  const cwd = task?.cwd === undefined ? bot.cwd : task.cwd;
  const windows = cwd && (/^[a-z]:[\\/]/i.test(cwd) || cwd.startsWith("\\\\"));
  const spelling = (path: string) => windows ? path.replace(/\\/g, "/") : path;
  const prefix = typeof cwd === "string" ? `${spelling(cwd).replace(/\/+$/, "")}/` : undefined;
  for (const message of [...visibleMessages(bot)].reverse()) {
    if (message.role !== "bot" || message.kind !== "text") continue;
    const attached = splitMessageAttachments(message.attachments);
    const files = [
      ...attached.files,
      ...collectMessageFiles(message.text ?? "", [...attached.images, ...attached.files.map((file) => file.path)]),
    ];
    for (const file of files) {
      const identity = file.priv ? file.path : fileIdentity(file.path);
      const reference = {
        file,
        message: { threadId: bot.threadId, messageId: message.id },
      };
      // Digests use paths relative to the turn's working folder. Only match
      // an absolute link beneath that exact folder; never guess by basename.
      const path = spelling(identity);
      // Windows drive/UNC prefixes are case-insensitive. Slice the original
      // spelling so Git's relative path and the shared URL keep their case.
      const inFolder = prefix && (windows
        ? path.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()
        : path.startsWith(prefix));
      const keys = [identity, ...(inFolder ? [path.slice(prefix.length)] : [])];
      if (identity.startsWith("./")) keys.push(identity.replace(/^(\.\/)+/, ""));
      for (const key of keys) if (!references.has(key)) references.set(key, reference);
    }
  }
  return references;
}

function splitPath(path: string): { name: string; folder: string } {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut < 0 ? { name: path, folder: "" } : { name: path.slice(cut + 1), folder: path.slice(0, cut) };
}

/** Minimal replacement for AttachedFileChip: downloads through the same
 * message-scoped capability (`POST .../file`), saving the response as a
 * file. Folder listings and table previews stay in the chat renderer. */
function FileChip({ file, message, linked = false, className }: {
  file: FilesPaneFile;
  message?: MessageAttachmentContext;
  linked?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [reason, setReason] = useState("");
  const request = useRef<AbortController | null>(null);

  if (!message || (!file.priv && !linked)) {
    return (
      <div title={t("attach.legacyFile", { name: file.name })} className={cn("flex max-w-[280px] items-center gap-2 overflow-hidden rounded-lg border border-hairline/40 bg-inset/70 px-2.5 py-2 text-[12px] text-ink-secondary", className)}>
        <FileText size={14} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
        <span className="text-[10.5px]">{t("attach.unavailable")}</span>
      </div>
    );
  }

  const save = async () => {
    if (state === "saving") return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState("saving");
    setReason("");
    try {
      const response = await fetch(`/api/threads/${encodeURIComponent(message.threadId)}/messages/${encodeURIComponent(message.messageId)}/file`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: file.path }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? t("attach.downloadFailed"));
      }
      if (response.headers.get("x-openmausbot-folder") === "1") {
        throw new Error(t("attach.folderHint"));
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name || attachmentBasename(file.path);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setState("saved");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setReason(cause instanceof Error ? cause.message : String(cause));
      setState("failed");
    }
  };

  return (
    <div className={cn("max-w-[280px] overflow-hidden rounded-lg border border-hairline/40 bg-inset/70 text-[12px] text-ink-secondary", className)}>
      <button
        type="button"
        onClick={() => void save()}
        disabled={state === "saving"}
        aria-label={t("attach.saveAria", { name: file.name })}
        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-raised/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 disabled:cursor-wait disabled:hover:bg-transparent"
      >
        <FileText size={14} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
        {state === "saving" ? (
          <LoaderCircle size={13} className="shrink-0 animate-spin" />
        ) : state === "saved" ? (
          <Check size={13} className="shrink-0 text-success" />
        ) : (
          <Download size={13} className="shrink-0" />
        )}
      </button>
      {state !== "idle" && (
        <div
          role={state === "failed" ? "alert" : "status"}
          className={cn(
            "border-t border-hairline/30 px-2.5 py-1.5 text-[10.5px]",
            state === "failed" ? "text-danger" : state === "saved" ? "text-success" : "text-ink-secondary",
          )}
        >
          {state === "saving" ? t("attach.downloading") : state === "saved" ? t("attach.downloaded") : reason}
        </div>
      )}
    </div>
  );
}

export function ComputerFilesPane({ bot }: { bot: Bot }) {
  const { dispatch } = useStore();
  const { capabilities } = useDesktopCapabilities();
  const home = capabilities.host.homeDir;
  const task = bot.tasks?.find((candidate) => candidate.threadId === bot.threadId);
  // Match Access settings: absent means not pinned yet; null is a legacy
  // home-folder session, which must not inherit a later bot default.
  const pinned = task?.cwd;
  const cwd = pinned === undefined ? bot.cwd : pinned;
  const files = recentChangedFiles(bot);
  const shared = useMemo(() => sharedFileReferences(bot), [bot.messages, bot.activeLeafId, bot.threadId, bot.tasks, bot.cwd]);
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-5" data-testid="computer-files">
      <div className="mt-2 rounded-xl bg-card p-4">
        <div className="text-[13px] font-medium text-ink">{t("computer.files.folder")}</div>
        <div className="mt-2 flex items-center gap-2">
          <FolderOpen size={15} className="shrink-0 text-ink-secondary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={cwd ?? undefined}>
            {cwd ? shortPath(cwd, home) : cwd === null ? t("computer.files.homeFolder") : t("computer.files.privateFolder", { name: bot.name })}
          </span>
          <button
            type="button"
            onClick={() => {
              // Same entry as the Advanced header's gear: the working folder
              // lives in the bot's Access settings.
              dispatch({ type: "toggleComputer", open: false });
              dispatch({ type: "toggleSettings", open: true, section: "access" });
            }}
            className="shrink-0 rounded-lg bg-control px-2.5 py-1 text-[12px] text-ink hover:bg-raised-hover"
          >
            {t(pinned === undefined ? "computer.files.changeFolder" : "computer.files.changeDefaultFolder")}
          </button>
        </div>
        {pinned !== undefined && <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{t("computer.files.pinnedFolderHint")}</p>}
      </div>
      <div className="mt-3 rounded-xl bg-card p-4">
        <div className="text-[13px] font-medium text-ink">{t("computer.files.recent")}</div>
        {files.length === 0 ? (
          <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{t("computer.files.empty", { name: bot.name })}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {files.map((path) => {
              const { name, folder } = splitPath(path);
              const reference = shared.get(path);
              return (
                <li key={path} className="min-w-0 rounded-lg py-1" title={path}>
                  {reference ? (
                    <FileChip
                      key={`${reference.message.threadId}:${reference.message.messageId}:${reference.file.path}`}
                      file={{ ...reference.file, name }}
                      message={reference.message}
                      linked={reference.file.linked}
                      className="w-full max-w-none"
                    />
                  ) : (
                    <div className="flex min-w-0 items-center gap-2 px-2.5 py-2" title={t("computer.files.notSharedHint")}>
                      <FileText size={14} className="shrink-0 text-ink-secondary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{name}</span>
                      <span className="shrink-0 text-[11px] text-ink-tertiary">{t("computer.files.notShared")}</span>
                    </div>
                  )}
                  {folder && <div className="mt-1 truncate px-2.5 text-[11px] text-ink-tertiary">{shortPath(folder, home)}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
