// Service-worker update guard: an update must never yank a live chat.
// Defer the reload while the user is messaging from this same app — a
// FRESH transcript draft, or unsent composer text (typing a first message
// leaves no transcript yet). Empty states + stale drafts reload at once.
// Pure + total (never throws: corrupt storage / private mode → reload).
export function shouldDeferSwReload(
  transcriptRaw: string | null,
  composerRaw: string | null,
  now = Date.now(),
): boolean {
  try {
    if (transcriptRaw) {
      const at = (JSON.parse(transcriptRaw) as { at?: unknown }).at;
      if (typeof at === "number" && now - at < 15 * 60 * 1000) return true;
    }
    if (composerRaw && composerRaw.length > 0) return true;
    return false;
  } catch {
    return false;
  }
}
