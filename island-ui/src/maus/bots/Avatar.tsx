// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// Minimal stub of components/Avatar.tsx: a colored initial tile. The full
// mascot engine (CursorAvatar, motion beats, image profiles) is skipped —
// the canvas only needs a recognizable per-bot mark.
import type { Bot } from "../shared/store";
import { cn } from "../shared/cn";

const COLOR_STYLES: Record<string, string> = {
  green: "bg-emerald-500/20 text-emerald-600",
  blue: "bg-sky-500/20 text-sky-600",
  purple: "bg-violet-500/20 text-violet-600",
  orange: "bg-orange-500/20 text-orange-600",
  pink: "bg-pink-500/20 text-pink-600",
  red: "bg-red-500/20 text-red-600",
  yellow: "bg-yellow-500/20 text-yellow-600",
  teal: "bg-teal-500/20 text-teal-600",
};

export function BotAvatar({ bot, size = 44, label }: {
  bot: Pick<Bot, "name" | "color">;
  size?: number;
  label?: string;
  /** Accepted for call-site compatibility; ignored by the stub. */
  state?: string;
  motion?: string;
  motionKey?: number;
  animated?: boolean;
}) {
  const initial = (bot.name.trim().charAt(0) || "?").toUpperCase();
  return (
    <span
      role="img"
      aria-label={label ?? (bot.name ? `${bot.name} avatar` : "Bot avatar")}
      title={label ?? bot.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        COLOR_STYLES[bot.color] ?? "bg-control text-ink-secondary",
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42) }}
    >
      {initial}
    </span>
  );
}
