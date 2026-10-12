// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Plus, Trash2, Webhook } from "lucide-react";
import { cn } from "../shared/cn";
import { t } from "../shared/i18n";
import { api, useStore, type Bot } from "../shared/store";
import type { WebhookTrigger, WebhookTriggerInput } from "../shared/wire/webhooks";
import { BotAvatar } from "./Avatar";

/** Minimal webhooks tab for the Routines island: list, enable/pause,
 * delete, and a small create form driven by `createRequest`. Credential
 * rotation/copy, activity feed, verification flow, and the full editor
 * (event types, pending-run caps, runOn) are skipped; add when needed. */
export function WebhooksPanel({
  bots,
  createRequest,
  onCreateHandled,
}: {
  bots: Bot[];
  createRequest: number;
  onCreateHandled: () => void;
}) {
  const { state, dispatch } = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [botId, setBotId] = useState(bots[0]?.id ?? "");
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const handledRequest = useRef(0);

  useEffect(() => {
    if (!createRequest || handledRequest.current === createRequest) return;
    handledRequest.current = createRequest;
    setCreating(true);
    onCreateHandled();
  }, [createRequest, onCreateHandled]);

  useEffect(() => {
    if (!bots.some((bot) => bot.id === botId)) setBotId(bots[0]?.id ?? "");
  }, [bots, botId]);

  const invoke = async (webhook: WebhookTrigger, action: "toggle" | "delete") => {
    if (working) return;
    if (action === "delete" && !window.confirm(`Delete “${webhook.name}”? Existing thread history will stay available.`)) return;
    setWorking(`${webhook.id}:${action}`);
    setError("");
    try {
      if (action === "delete") {
        await api(`/api/webhooks/${webhook.id}`, { method: "DELETE" });
        dispatch({ type: "webhookDeleted", webhookId: webhook.id });
      } else {
        const response = await api<{ webhook: WebhookTrigger }>(`/api/webhooks/${webhook.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !webhook.enabled }),
        });
        dispatch({ type: "webhookPatched", webhook: response.webhook });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(null);
    }
  };

  const create = async () => {
    if (!name.trim() || !prompt.trim() || !botId || working) return;
    setWorking("new");
    setError("");
    try {
      const input: WebhookTriggerInput = { name: name.trim(), prompt: prompt.trim(), botId, enabled: true };
      const response = await api<{ webhook: WebhookTrigger }>("/api/webhooks", {
        method: "POST",
        body: JSON.stringify(input),
      });
      dispatch({ type: "webhookPatched", webhook: response.webhook });
      setCreating(false);
      setName("");
      setPrompt("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6" aria-label={t("routines.webhooks")}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">{t("routines.webhooks")}</h2>
          <p className="mt-1 text-[12px] text-ink-secondary">External events that start a bot run.</p>
        </div>
        <button
          type="button"
          disabled={bots.length === 0}
          onClick={() => setCreating((open) => !open)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
        >
          <Plus size={15} aria-hidden="true" />{t("routines.newWebhook")}
        </button>
      </div>

      {creating && (
        <div className="space-y-3 rounded-xl border border-hairline/40 bg-card p-4">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Webhook name"
            className="w-full rounded-lg border border-hairline/50 bg-inset px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-tertiary focus:border-accent"
          />
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Bot"
              value={botId}
              onChange={(event) => setBotId(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-hairline/50 bg-inset px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
            >
              {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
            </select>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="What should the bot do when this fires?"
            className="w-full resize-y rounded-lg border border-hairline/50 bg-inset px-3 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-tertiary focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-4 py-2 text-[12.5px] text-ink-secondary hover:bg-raised hover:text-ink">Cancel</button>
            <button
              type="button"
              onClick={() => void create()}
              disabled={!name.trim() || !prompt.trim() || !botId || working === "new"}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-[12.5px] font-semibold text-white hover:brightness-110 disabled:opacity-40"
            >
              {working === "new" && <Loader2 size={14} className="animate-spin" />}Create webhook
            </button>
          </div>
        </div>
      )}

      {error && <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div>}

      {state.webhooks.length === 0 && !creating && (
        <div className="rounded-xl border border-dashed border-hairline/50 p-10 text-center text-[13px] text-ink-secondary">
          <Webhook size={24} className="mx-auto mb-3 opacity-50" />No webhooks yet.
        </div>
      )}

      <div className="space-y-2">
        {state.webhooks.map((webhook) => {
          const bot = bots.find((candidate) => candidate.id === webhook.botId);
          const busy = working === `${webhook.id}:toggle` || working === `${webhook.id}:delete`;
          return (
            <article key={webhook.id} className="flex items-center gap-3 rounded-xl border border-hairline/40 bg-card p-3.5" aria-label={webhook.name}>
              {bot && <BotAvatar bot={bot} size={32} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{webhook.name}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-ink-secondary">{bot?.name ?? t("routines.unavailableBot")}</div>
              </div>
              <span className={cn("shrink-0 rounded-full bg-inset px-2 py-0.5 text-[10px]", webhook.enabled ? "text-accent" : "text-ink-secondary")}>
                {webhook.enabled ? "On" : "Paused"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void invoke(webhook, "toggle")}
                title={webhook.enabled ? "Pause webhook" : "Enable webhook"}
                className="rounded-lg p-2 text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-40"
              >
                {webhook.enabled ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void invoke(webhook, "delete")}
                title={t("routines.delete")}
                aria-label={t("routines.delete")}
                className="rounded-lg p-2 text-ink-secondary hover:bg-danger/10 hover:text-danger disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
