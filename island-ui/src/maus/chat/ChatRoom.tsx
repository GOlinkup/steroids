// Maus chat room: thread transcript + composer on the absorbed store.
// Lean stand-in for the unported ChatView: text + activity rows only,
// exotic card kinds render their text or are skipped. Live assistant turns
// arrive over the SSE bot frames the store already folds.
import { useEffect, useMemo, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { useStore, visibleMessages, type Message } from "../shared/store";
import { BotAvatar } from "../bots/Avatar";
import { cn } from "../shared/cn";

function Row({ message, threadId }: { message: Message; threadId: string }) {
  if (message.kind === "activity") {
    const line = message.tool?.spoken ?? message.tool?.summary ?? (message.text || "working…");
    return <div className="px-1 py-0.5 text-[11px] text-ink-tertiary">{line}</div>;
  }
  if (message.kind === "screen" && message.hasImage) {
    return (
      <div className="px-1 py-1">
        <img
          src={`/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(message.id)}/image`}
          alt="bot screen"
          className="max-h-48 rounded-lg border border-hairline"
          loading="lazy"
        />
      </div>
    );
  }
  const text = (message.text ?? "").trim();
  if (!text) return null;
  if (message.role === "user") {
    return (
      <div className="flex justify-end py-0.5">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bubble-user px-3 py-1.5 text-[13px] text-ink">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="whitespace-pre-wrap py-0.5 text-[13px] leading-relaxed text-ink">
      {message.from ? (
        <span className="mr-1 font-semibold text-accent-text">{message.from.name}:</span>
      ) : null}
      {text}
    </div>
  );
}

export function ChatRoom() {
  const { state, dispatch } = useStore();
  const bot = state.bots.find((b) => b.id === state.selectedId) ?? state.bots[0] ?? null;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bot) dispatch({ type: "select", id: bot.id });
    // mark-read on open; selection itself is the dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot?.id]);

  const messages = useMemo(() => (bot ? visibleMessages(bot) : []), [bot]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, bot?.id]);

  if (!bot) {
    return (
      <div className="grid flex-1 place-items-center bg-app">
        <div className="card">
          <div className="card-title">No agents yet</div>
          <div className="card-detail">Add your first agent on the left.</div>
        </div>
      </div>
    );
  }

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setError(null);
    dispatch({ type: "send", botId: bot.id, text, onError: setError });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-app">
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <BotAvatar bot={bot} size={28} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{bot.name}</span>
        {(bot.busy) && (
          <span className="flex items-center gap-1 text-[11px] text-ink-tertiary">
            <span className="size-1.5 animate-status-pulse rounded-full bg-success" /> working
          </span>
        )}
        <button
          onClick={() => dispatch({ type: "newTask", botId: bot.id })}
          className="rounded-lg px-2 py-1 text-[12px] text-ink-secondary hover:bg-raised hover:text-ink"
        >
          New chat
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {messages.map((m) => (
          <Row key={m.id} message={m} threadId={bot.threadId} />
        ))}
        {messages.length === 0 && (
          <p className="py-6 text-center text-[12px] text-ink-tertiary">
            Say hello — {bot.name} runs on your machine.
          </p>
        )}
      </div>
      {error && <div className="px-3 pb-1 text-[12px] text-danger">{error}</div>}
      <div className="flex items-end gap-2 border-t border-hairline p-2">
        <textarea
          value={draft}
          rows={2}
          placeholder={`Message ${bot.name}…`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className={cn(
            "min-h-0 flex-1 resize-none rounded-xl bg-composer px-3 py-2",
            "text-[13px] text-ink placeholder:text-ink-tertiary focus:outline-none",
          )}
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          aria-label="Send"
          className="rounded-xl bg-accent p-2.5 text-white disabled:opacity-40"
        >
          <SendHorizontal size={16} />
        </button>
      </div>
    </div>
  );
}
