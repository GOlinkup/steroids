// Maus chat sidebar: view nav, agent roster, thread list. All Maus, no island chrome.
import { CalendarClock, MessageSquare, Monitor, Plus, Users } from "lucide-react";
import { useStore } from "../shared/store";
import type { IslandView } from "../../store";
import { BotAvatar } from "../bots/Avatar";
import { NewBotDialog } from "../bots/NewBotDialog";
import { cn } from "../shared/cn";

export type ChatNavView = "chat" | "bots" | "computer" | "routines";

const NAV: Array<{ view: ChatNavView; island: IslandView; title: string; Icon: typeof MessageSquare }> = [
  { view: "chat", island: "chat", title: "Chats", Icon: MessageSquare },
  { view: "bots", island: "bots", title: "Team", Icon: Users },
  { view: "computer", island: "computer", title: "Computers", Icon: Monitor },
  { view: "routines", island: "routines", title: "Routines", Icon: CalendarClock },
];

export function Sidebar({ view, onNavigate }: { view: ChatNavView; onNavigate: (v: IslandView) => void }) {
  const { state, dispatch } = useStore();
  const selected = state.bots.find((b) => b.id === state.selectedId) ?? null;

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-hairline bg-panel">
      <div className="flex gap-1 p-2">
        {NAV.map(({ view: v, island, title, Icon }) => (
          <button
            key={v}
            title={title}
            aria-label={title}
            aria-pressed={view === v}
            onClick={() => onNavigate(island)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-lg p-2",
              view === v ? "bg-raised text-ink" : "text-ink-secondary hover:bg-raised hover:text-ink",
            )}
          >
            <Icon size={17} />
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Agents</span>
        <button
          title="Add agent"
          aria-label="Add agent"
          onClick={() => dispatch({ type: "toggleNewBot", open: true })}
          className="rounded-md p-1 text-ink-secondary hover:bg-raised hover:text-ink"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {state.bots.map((bot) => {
          const active = bot.id === selected?.id;
          const unread = bot.unread || (bot.tasks ?? []).some((t) => t.unread);
          return (
            <button
              key={bot.id}
              onClick={() => {
                dispatch({ type: "select", id: bot.id });
                onNavigate("chat");
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                active ? "bg-raised" : "hover:bg-raised",
              )}
            >
              <BotAvatar bot={bot} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{bot.name}</span>
                <span className="block truncate text-[11px] text-ink-tertiary">
                  {bot.busy ? "working…" : `${(bot.tasks ?? []).length || 1} chat${(bot.tasks ?? []).length > 1 ? "s" : ""}`}
                </span>
              </span>
              {unread && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="unread" />}
              {(bot.busy) && !unread && (
                <span className="size-2 shrink-0 animate-status-pulse rounded-full bg-success" aria-label="working" />
              )}
            </button>
          );
        })}
        {state.bots.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-ink-tertiary">No agents yet — add one above.</p>
        )}
      </div>
      {selected && (
        <div className="border-t border-hairline p-2">
          <button
            onClick={() => dispatch({ type: "newTask", botId: selected.id })}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-ink-secondary hover:bg-raised hover:text-ink"
          >
            <Plus size={14} /> New chat
          </button>
          {(selected.tasks ?? []).map((task) => (
            <button
              key={task.threadId}
              onClick={() => dispatch({ type: "switchTask", botId: selected.id, threadId: task.threadId })}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px]",
                task.threadId === selected.threadId ? "bg-raised text-ink" : "text-ink-secondary hover:bg-raised hover:text-ink",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{task.title || "Untitled"}</span>
              {task.unread && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="unread" />}
            </button>
          ))}
        </div>
      )}
      {state.newBotOpen && (
        <NewBotDialog
          preserveSelection
          onClose={() => dispatch({ type: "toggleNewBot", open: false })}
          onCreated={(bot) => {
            dispatch({ type: "toggleNewBot", open: false });
            dispatch({ type: "select", id: bot.id });
            onNavigate("chat");
          }}
        />
      )}
    </div>
  );
}
