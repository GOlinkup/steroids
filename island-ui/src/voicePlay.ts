// Daily voice play-hook: "play X" text (typed or transcribed) resolves to
// a playable track. TS mirror of the Flutter T3-3 contract
// (lib/features/home/services/music_resolver.dart): same parse rule, same
// keyless youtubei search + oEmbed confirm, same honest-null failures.
// Erasable TS only (node --test strips types); injectable fetch seam keeps
// it testable under node like music.ts. Wiring into Daily.tsx is a separate
// gated step — this file has no imports from the tree, so it lands clean.

export interface VoiceTrack {
  videoId: string;
  title: string;
  author: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<{
  ok?: boolean;
  status?: number;
  json(): Promise<unknown>;
}>;

const YOUTUBEI_SEARCH = "https://www.youtube.com/youtubei/v1/search";
const OEMBED = "https://www.youtube.com/oembed";

/** "play ..." prefix parse. Pure — null means not a music ask. */
export function musicQueryOf(rawText: string): string | null {
  const t = rawText.trim();
  if (!t.toLowerCase().startsWith("play ")) return null;
  const q = t.substring(5).trim();
  return q ? q : null;
}

/** Privacy-enhanced nocookie embed for a resolved video id. */
export function embedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}

/** Walk a youtubei search response to the first videoRenderer videoId. Pure. */
export function firstVideoId(json: unknown): string | null {
  try {
    const contents = (json as Record<string, Record<string, Record<string, Record<string, unknown>>>>)["contents"]?.["twoColumnSearchResultsRenderer"]?.["primaryContents"]?.["sectionListRenderer"]?.["contents"];
    if (!Array.isArray(contents)) return null;
    for (const section of contents) {
      const items = (section as Record<string, Record<string, unknown>>)?.["itemSectionRenderer"]?.["contents"];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const vr = (item as Record<string, unknown>)?.["videoRenderer"] as Record<string, unknown> | undefined;
        if (vr && typeof vr["videoId"] === "string") return vr["videoId"] as string;
      }
    }
  } catch {
    // Shape drift: honest null, never a guessed id.
  }
  return null;
}

async function oembedMeta(videoId: string, fetchFn: FetchLike): Promise<{ title: string; author: string }> {
  try {
    const r = await fetchFn(
      `${OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
    );
    if (r.ok === false) return { title: "", author: "" };
    if (typeof r.status === "number" && r.status !== 200) return { title: "", author: "" };
    const j = (await r.json()) as Record<string, unknown>;
    if (typeof j !== "object" || j === null) return { title: "", author: "" };
    return {
      title: typeof j["title"] === "string" ? (j["title"] as string) : "",
      author: typeof j["author_name"] === "string" ? (j["author_name"] as string) : "",
    };
  } catch {
    return { title: "", author: "" };
  }
}

/**
 * First videoId for [query] via youtubei search, metadata confirmed via
 * oEmbed. Null = no result / upstream drift / offline — never an invented
 * track. Callers fail loud through their own funnel (same rule as trips).
 */
export async function resolveTrack(query: string, fetchFn: FetchLike): Promise<VoiceTrack | null> {
  try {
    const r = await fetchFn(YOUTUBEI_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20241001" } }, query }),
    });
    if (r.ok === false) return null;
    if (typeof r.status === "number" && r.status !== 200) return null;
    const videoId = firstVideoId(await r.json());
    if (!videoId) return null;
    const meta = await oembedMeta(videoId, fetchFn);
    return { videoId, title: meta.title || query, author: meta.author };
  } catch {
    return null;
  }
}
