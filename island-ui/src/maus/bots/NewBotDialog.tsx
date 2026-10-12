// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// Minimal working stand-in for the "New bot" role picker (lazy-screens
// NewBotDialog): a name prompt that creates the bot on the team via
// POST /api/bots and announces it with botAdded. Role templates, model
// pickers and avatar setup are skipped — create first, configure after.
import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { api, useStore, type Bot } from "../shared/store";

export function NewBotDialog({ section, preserveSelection, onClose, onCreated }: {
  section?: string;
  preserveSelection?: boolean;
  onClose: () => void;
  onCreated?: (bot: Bot) => void;
}) {
  const { dispatch } = useStore();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const trimmed = name.trim();

  const save = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");
    try {
      const bot = await api<Bot>("/api/bots", {
        method: "POST",
        body: JSON.stringify({ name: trimmed, ...(section !== undefined ? { section } : {}) }),
      });
      dispatch({ type: "botAdded", bot, preserveSelection });
      onCreated?.(bot);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-bot-title"
        className="w-full max-w-[400px] rounded-2xl border border-hairline/50 bg-panel p-5 text-ink shadow-2xl"
        onKeyDown={(event) => { if (event.key === "Escape" && !saving) { event.stopPropagation(); onClose(); } }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="new-bot-title" className="text-[17px] font-semibold">New bot</h2>
          <button aria-label="Close" disabled={saving} onClick={onClose} className="rounded-lg p-1.5 text-ink-secondary hover:bg-raised">
            <X size={18} />
          </button>
        </div>
        <label className="block text-[13px] text-ink-secondary">Name
          <input
            value={name}
            maxLength={60}
            disabled={saving}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void save(); }}
            placeholder="e.g. Researcher"
            className="mt-1 w-full rounded-lg border border-hairline/50 bg-inset px-3 py-2 text-[14px] text-ink"
          />
        </label>
        {section !== undefined && (
          <p className="mt-2 text-[12px] text-ink-secondary">Joins {section || "General"}{section ? "" : " (no team)"}.</p>
        )}
        {error && <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button disabled={saving} onClick={onClose} className="rounded-lg px-3 py-2 text-[13px] text-ink-secondary hover:bg-raised">
            Cancel
          </button>
          <button
            disabled={saving || !trimmed}
            onClick={() => void save()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create bot
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
