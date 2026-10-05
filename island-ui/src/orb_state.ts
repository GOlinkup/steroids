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
