// Activity -> orb mapper: the lens-live face of current work.
// Priority is deliberate (mic > turn > wire > queue > search > idle):
// the scarcest human attention wins. Idle breathes — never a black void.
import type { OrbState } from "thinking-orbs";

export interface IslandActivity {
  thinking: boolean;
  listening: boolean;
  relay: "idle" | "connecting" | "connected" | "offline";
  outboxPending: number;
  searching: boolean;
}

export const IDLE_ACTIVITY: IslandActivity = {
  thinking: false,
  listening: false,
  relay: "idle",
  outboxPending: 0,
  searching: false,
};

export function orbFor(a: IslandActivity): OrbState {
  if (a.listening) return "listening";
  if (a.thinking) return "working";
  if (a.relay === "connecting") return "connecting";
  if (a.outboxPending > 0) return "weaving";
  if (a.searching) return "searching";
  return "breathing";
}

// Search-family tool verbs, as the engine emits them: `· Tool …`
// (agentlog latest(): `· Read App.tsx 📄`, `· Grep foo`). Anchored on
// purpose — bare-substring matching lit `searching` on plain prose:
// user-prompt echoes share the `· ` prefix ("· looking for lunch…",
// "· find out…"), and they are not tool calls.
const SEARCH_ACTIVITY = /^·\s*(read|glob|grep|webfetch|websearch)\b/i;

// Chat working bubble -> orb: each live turn signal owns its design, so
// the bubble shows more than one animation end-to-end. Order is deliberate
// (bridge-down honesty first, then the most specific live signal wins).
// Only real turn signals are read — phases are never invented.
export function chatOrbFor(opts: {
  bridgeOn: boolean;
  activity?: string | null;
  partial?: string | null;
  stepsActive?: boolean;
}): OrbState {
  if (!opts.bridgeOn) return "breathing";
  if (SEARCH_ACTIVITY.test(opts.activity ?? "")) return "searching";
  if (opts.stepsActive) return "solving";
  if ((opts.partial ?? "").length > 0) return "composing";
  return "working";
}
