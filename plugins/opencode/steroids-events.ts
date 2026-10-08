/**
 * Steroids OpenCode events plugin — island telemetry side-channel.
 *
 * Like steroids-plugin.ts (routing), but the island-facing half: forwards
 * user prompts + tool runs to the shared agent ledger so the steroids
 * island Sessions tab can follow OpenCode like it follows Claude Code.
 *
 * ponytail: NEVER console.log — stdout corrupts the opencode TUI.
 * All failures swallowed; the island is cosmetic, never blocking.
 */

import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import * as path from "path"

const RELAY = path.join(
  homedir(),
  ".config",
  "opencode",
  "plugins",
  "steroids",
  "hook_relay.py",
)

function report(kind: string, extra: Record<string, unknown> = {}): void {
  try {
    spawnSync("python3", [RELAY, "opencode"], {
      input: JSON.stringify({ kind, cwd: root, ...extra }),
      encoding: "utf-8",
      timeout: 2000,
    })
  } catch {
    /* island is cosmetic — never surface this */
  }
}

function sessionOf(...candidates: any[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c) return c
    if (c && typeof c === "object") {
      const s = c.sessionID ?? c.session_id ?? c.session
      if (typeof s === "string" && s) return s
    }
  }
  return ""
}

function fileOf(args: any): string {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args)
    } catch {
      return ""
    }
  }
  if (!args || typeof args !== "object") return ""
  for (const k of ["file_path", "filePath", "path", "filename", "notebook_path"]) {
    const v = args[k]
    if (typeof v === "string" && v) return v
  }
  return ""
}

function dirOf(...candidates: any[]): string {
  // project root for the project-centric home hero: explicit directory
  // first (plugin ctx), then per-payload fields, then server cwd.
  // Server cwd is last — opencode often starts at $HOME, never the project.
  for (const c of candidates) {
    if (typeof c === "string" && c) return c
    if (c && typeof c === "object") {
      for (const k of ["directory", "cwd", "workdir", "projectRoot", "root"]) {
        const v = (c as any)[k]
        if (typeof v === "string" && v) return v
      }
    }
  }
  try {
    return process.cwd()
  } catch {
    return ""
  }
}

export const SteroidsEventsPlugin = async (ctx: any = {}) => {
  const root = dirOf(ctx?.directory, ctx)
  return {
    "chat.message": async (_input: any, output: any) => {
      try {
        const text = (output?.parts || [])
          .filter((p: any) => p?.type === "text" && typeof p.text === "string")
          .map((p: any) => p.text)
          .join(" ")
          .slice(0, 2000)
        if (text.trim().length >= 2) {
          report("prompt", { text, session: sessionOf(output?.info, output), cwd: dirOf(_input, output, root) })
        }
      } catch {}
    },
    "tool.execute.before": async (input: any) => {
      try {
        const tool =
          input?.call?.tool ??
          input?.tool ??
          input?.name ??
          "tool"
        const file = fileOf(input?.call?.arguments ?? input?.arguments ?? input?.input)
        report("tool-before", { tool: String(tool), file, cwd: dirOf(input, root), session: sessionOf(input) })
        // act-from-island: surface approval-worthy calls as attention rows.
        // We only report; the native permission UI still decides.
        if (/permission|approve|confirm|ask/i.test(String(tool))) {
          report("prompt", { text: `approval: ${String(tool)}`, session: sessionOf(input) })
        }
      } catch {}
    },
    "tool.execute.after": async (input: any) => {
      try {
        const tool =
          input?.call?.tool ?? input?.tool ?? input?.name ?? "tool"
        const err = input?.output?.error ?? input?.output?.exitCode
        report("tool-after", {
          tool: String(tool),
          file: fileOf(input?.call?.arguments ?? input?.arguments ?? input?.input),
          cwd: dirOf(input, root),
          ok: err == null || err === 0,
          session: sessionOf(input),
        })
      } catch {}
    },
    event: async ({ event }: any) => {
      try {
        const t = event?.type
        if (t === "session.idle" || t === "session.deleted") {
          report("done", { session: sessionOf(event?.properties, event) })
        }
      } catch {}
    },
  }
}

export default SteroidsEventsPlugin
