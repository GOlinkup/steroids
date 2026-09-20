/**
 * Steroids OpenCode plugin (server side).
 *
 * ponytail: console.log is the visible channel (client.app.log goes to
 * the log file only). Per-prompt routing reuses steroids/hook.sh.
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
console.log(`[Steroids] router live: ${N > 0 ? `${N} indexed skills` : "index unavailable"}`)

function route(prompt: string): string {
  // ponytail: shell out to the tested router; inline port if spawn proves slow.
  try {
    const r = spawnSync("bash", [HOOK], {
      input: JSON.stringify({ prompt }),
      encoding: "utf-8",
    })
    return (r.stdout || "").trim()
  } catch {
    return ""
  }
}

export const SteroidsPlugin = async () => {
  // ponytail: dedup double-fire; same prompt within 5s = skip.
  let lastQ = ""
  let lastT = 0
  return {
    event: async ({ event }: any) => {
      if (event?.type === "session.created") {
        console.log(`[Steroids] router live: ${N} indexed skills`)
      }
    },
    "chat.message": async (_input: any, output: any) => {
      // ponytail: hint via console.log (proven visible); no Part-shape risk.
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
        if (hint) console.log(`\n[Steroids] ${hint}\n`)
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
