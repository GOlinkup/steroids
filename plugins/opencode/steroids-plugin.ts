/**
 * Steroids OpenCode plugin (server side).
 *
 * ponytail: NEVER console.log here — plugin stdout corrupts the opencode TUI
 * (dark screen / blank first message, upstream #19108). Visible channel is
 * client.tui.showToast; diagnostics go to client.app.log (log file only).
 * Per-prompt routing reuses steroids/hook.sh.
 * Ceiling: keyword overlap, not semantic search.
 */

import { spawnSync } from "node:child_process"
import * as fs from "fs"
import { homedir } from "node:os"
import * as path from "path"

const DIR = path.join(homedir(), ".config", "opencode", "plugins")
const HOOK = path.join(DIR, "steroids", "hook.sh")
const INDEX = path.join(DIR, "steroids", "skill-index.json")

function skillCount(): number {
  try {
    return Object.keys(JSON.parse(fs.readFileSync(INDEX, "utf-8")).index || {}).length
  } catch {
    return 0
  }
}

const N = skillCount()
// ponytail: zero console.* in this file — stdout breaks the TUI.

function route(prompt: string): string {
  // ponytail: return skills[] joined — if 3 match, show 3. Hint sentence is log-only chrome.
  try {
    const r = spawnSync("bash", [HOOK, "--json"], {
      input: JSON.stringify({ prompt }),
      encoding: "utf-8",
    })
    const out = (r.stdout || "").trim()
    try {
      const j = JSON.parse(out) as any
      const skills = (j.skills || []) as string[]
      if (skills.length) return skills.slice(0, 4).join(" · ")
      return ((j.hint || "") as string).replace(/\s+/g, " ").slice(0, 120).trim()
    } catch {
      return out.split("\n")[0].replace(/\s+/g, " ").slice(0, 120).trim()
    }
  } catch {
    return ""
  }
}

export const SteroidsPlugin = async ({ client }: any) => {
  // ponytail: dedup double-fire; same prompt within 5s = skip.
  let lastQ = ""
  let lastT = 0
  // ponytail: braille spinner = best 1-char loader (all fonts, no width jitter).
  // Others that fit: lineiné -\|/, dots …, bounce ⠁⠉⠙, clock 🕐🕑, moon 🌑🌒. Braille wins.
  const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  let rep = 0
  const log = (level: "info" | "debug", message: string) => {
    try {
      const p = client?.app?.log?.({ body: { service: "steroids", level, message } })
      ;(p as any)?.catch?.(() => {})
    } catch {}
  }
  const spotlight = (skills: string) => {
    // ponytail: server toast = plain text only, no shimmer/opacity API.
    // Bold STEROIDS title is the max branding here; true shimmer needs TUI slot.
    log("debug", `[Steroids] → ${skills}`)
    try {
      const p = client?.tui?.showToast?.({
        body: {
          title: "STEROIDS",
          message: `${SPIN[rep++ % SPIN.length]} ${skills} 🏋️`,
          variant: "info",
          duration: 2000,
        },
      })
      ;(p as any)?.catch?.(() => {})
    } catch {}
  }
  return {
    event: async ({ event }: any) => {
      if (event?.type === "session.created") log("info", `[Steroids] router live: ${N} indexed skills`)
    },
    "chat.message": async (_input: any, output: any) => {
      // ponytail: toast = spotlight during the run; no Part-shape risk, no TUI corruption.
      // output.parts here IS the user message (per @opencode-ai/plugin types).
      try {
        const text = (output?.parts || [])
          .filter((p: any) => p?.type === "text" && typeof p.text === "string")
          .map((p: any) => p.text)
          .join("\n")
          .slice(0, 2000)
        if (text.trim().length < 2) return
        const now = Date.now()
        if (text === lastQ && now - lastT < 5000) return
        lastQ = text
        lastT = now
        const hint = route(text)
        if (!hint) return
        spotlight(hint)
      } catch {
        // never block a prompt
      }
    },
    "experimental.session.compacting": async (_input: any, output: any) => {
      output?.context?.push(
        "## Steroids skill router (preserve across compaction)",
        `Skills: ${N} indexed. On each user prompt, match keywords and load what applies, skip the rest.`,
      )
    },
  }
}

export default SteroidsPlugin
