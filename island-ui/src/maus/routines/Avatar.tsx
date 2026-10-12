// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
import { MAUS_COLORS } from "../shared/mascot";
import type { Bot } from "../shared/store";

/** Minimal bot avatar for the Routines island: custom image when set,
 * otherwise the bot's initial on its color. The full mascot engine
 * (CursorAvatar, motion, gaze) is skipped; add when the island needs it. */
export function BotAvatar({ bot, size = 36 }: {
  bot: Bot;
  size?: number;
  state?: string;
  animated?: boolean;
}) {
  const dimension = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  if (bot.avatarUrl) {
    return (
      <img
        src={bot.avatarUrl}
        alt={bot.name}
        width={size}
        height={size}
        style={dimension}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...dimension, background: MAUS_COLORS[bot.color] }}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
    >
      {(bot.name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
