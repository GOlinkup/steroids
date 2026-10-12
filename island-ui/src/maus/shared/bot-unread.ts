// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
/** Sidebar dot, dock badge, and notifying pose.
 * A hidden routine execution is not a conversation, so it never counts.
 * Bots saved before task lists still use their own unread flag. */
export function botShowsUnread(bot: {
  unread?: boolean;
  tasks?: ReadonlyArray<{ unread?: boolean; routineRunId?: string }> | null;
}): boolean {
  if (!bot.tasks?.length) return Boolean(bot.unread);
  return bot.tasks.some((task) => Boolean(task.unread) && !task.routineRunId);
}
