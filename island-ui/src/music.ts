// Now-playing fetch layer: system music via the bridge (playerctl/MPRIS).
// Injectable fetch seam keeps it testable under node.
// Erasable TS only (node --test strips types, no enums, no param props).

export interface NowPlaying {
  hasPlayerctl: boolean;
  playing: boolean;
  player: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  art: string | null;
  status: string | null;
  pos: number | null;
  len: number | null;
}

export const NO_MUSIC: NowPlaying = {
  hasPlayerctl: false,
  playing: false,
  player: null,
  title: null,
  artist: null,
  album: null,
  art: null,
  status: null,
  pos: null,
  len: null,
};

export type FetchLike = (url: string, init?: RequestInit) => Promise<{ json(): Promise<unknown> }>;

export function normalizeNowPlaying(raw: unknown): NowPlaying {
  if (typeof raw !== "object" || raw === null) return { ...NO_MUSIC };
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    hasPlayerctl: r.has_playerctl === true,
    playing: r.playing === true,
    player: str(r.player),
    title: str(r.title),
    artist: str(r.artist),
    album: str(r.album),
    art: str(r.art),
    status: str(r.status),
    pos: num(r.pos),
    len: num(r.len),
  };
}

export async function fetchNowPlaying(base: string, fetchFn: FetchLike): Promise<NowPlaying> {
  // no-store: same URL every poll, must never come from HTTP cache.
  const r = await fetchFn(`${base}/nowplaying`, { cache: "no-store" });
  return normalizeNowPlaying(await r.json());
}

export type PlayerAction = "play-pause" | "next" | "previous" | "seek";

export async function sendPlayerCmd(
  base: string,
  fetchFn: FetchLike,
  action: PlayerAction,
  opts: { player?: string | null; position?: number } = {},
): Promise<boolean> {
  const body: Record<string, unknown> = { action };
  if (opts.player) body.player = opts.player;
  if (action === "seek" && typeof opts.position === "number") body.position = opts.position;
  const r = await fetchFn(`${base}/playercmd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as Record<string, unknown>;
  return j.ok === true;
}

/** mm:ss — position labels, null-safe. */
export function fmtClock(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/** Art src for <img>: file:// thumbs (Chromium drops them in /tmp,
unreachable from http) ride the bridge /np-art endpoint instead. */
export function resolveArt(art: string | null, base: string): string | null {
  if (!art) return null;
  if (art.startsWith("file://")) return `${base}/np-art`;
  return art;
}

/** 0..1 seek fraction, null when the player gives no length. */
export function seekFrac(track: NowPlaying): number | null {
  if (track.pos === null || track.len === null || track.len <= 0) return null;
  return Math.max(0, Math.min(1, track.pos / track.len));
}

/** Identity of a track across polls — everything except live pos/playing. */
export function trackKey(t: NowPlaying): string {
  return [t.player ?? "", t.title ?? "", t.artist ?? "", t.album ?? "", String(t.len ?? "")].join("");
}

/**
 * Change-guard for the 3s /nowplaying poll. Returns the value to store:
 * null = honest empty (only before any track was ever seen), prev = no
 * visual change (keep ref so React bails), next = a real change to paint.
 * - No title in the poll -> keep the last track sticky (prev), so the card
 *   never blanks to "nothing playing" mid-session; null only when nothing
 *   was ever seen (first load / no player at all).
 * - Same track + same playing flag: paused polls freeze (ignore pos/art
 *   churn); playing polls ignore <2s pos jitter.
 */
export function mergeTrack(prev: NowPlaying | null, next: NowPlaying): NowPlaying | null {
  if (!next.title) return prev;
  if (prev && trackKey(prev) === trackKey(next) && prev.playing === next.playing) {
    if (!next.playing) return prev;
    if (prev.pos !== null && next.pos !== null && Math.abs(next.pos - prev.pos) < 2) return prev;
  }
  return next;
}

export interface HistTrack {
  key: string;
  title: string;
  artist: string | null;
  art: string | null;
  player: string | null;
  len: number | null;
}

/** Pure Up-Next insert: dedupe by key, newest first, capped. */
export function pushHistory(hist: HistTrack[], t: NowPlaying, cap = 8): HistTrack[] {
  if (!t.title) return hist;
  const key = trackKey(t);
  const row: HistTrack = {
    key,
    title: t.title,
    artist: t.artist,
    art: t.art,
    player: t.player,
    len: t.len,
  };
  return [row, ...hist.filter((h) => h.key !== key)].slice(0, Math.max(1, cap));
}
