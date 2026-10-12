// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// NOTE (Steroids island): zod-free port of shared/bot-avatar.ts. The two
// schema uses are hand-rolled with identical accept/reject behavior (crop
// enum membership, attachment-URL regex); no other behavior changes.

/**
 * `mascot` draws the animated mascot body, filled with the bot's colour
 * gradient. `circle`, `rounded`, and `square` crop the bot's own image
 * instead, shown as it is, with no mascot at all.
 */
export const BOT_AVATAR_CROPS = ["mascot", "circle", "rounded", "square"] as const;
export type BotAvatarCrop = (typeof BOT_AVATAR_CROPS)[number];

function isBotAvatarCrop(value: unknown): value is BotAvatarCrop {
  return typeof value === "string" && (BOT_AVATAR_CROPS as readonly string[]).includes(value);
}

/** CSS radius for a profile crop. Mascot is drawn, not photo-cropped, so it is not clipped. */
export function avatarCropRadius(crop: BotAvatarCrop): string {
  if (crop === "circle") return "50%";
  if (crop === "rounded") return "22%";
  return "0";
}

/** 1 shows the picture with object-fit cover. Larger values zoom in. */
export const AVATAR_ZOOM_MIN = 1;
export const AVATAR_ZOOM_MAX = 3;
/** The point of the picture kept in the middle of the crop, from 0 to 1. */
export const AVATAR_FOCUS_CENTER = 0.5;

export function clampAvatarZoom(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) return AVATAR_ZOOM_MIN;
  const clamped = Math.min(AVATAR_ZOOM_MAX, Math.max(AVATAR_ZOOM_MIN, parsed));
  return Math.round(clamped * 100) / 100;
}

export function clampAvatarFocus(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) return AVATAR_FOCUS_CENTER;
  const clamped = Math.min(1, Math.max(0, parsed));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Custom avatars are deliberately limited to this app's attachment server.
 * Besides making persisted profiles portable across desktop/browser clients,
 * this prevents a bot profile from becoming an external tracking pixel or a
 * script-capable SVG.
 */
const BOT_AVATAR_URL_PATTERN = /^\/api\/attachments\/[A-Za-z0-9-]+\.(?:png|jpg|gif|webp)$/;

export function botAvatarUrlFromStoredPath(path: string): string | null {
  const name = path.replaceAll("\\", "/").split("/").pop();
  if (!name) return null;
  const url = `/api/attachments/${name}`;
  return BOT_AVATAR_URL_PATTERN.test(url) ? url : null;
}

/** Runtime-safe defaults for untrusted persisted/SSE profile data. */
export interface BotAvatarProfileInput {
  avatarUrl?: unknown;
  avatarCrop?: unknown;
}

export interface BotAvatarProfile {
  avatarUrl?: string;
  avatarCrop: BotAvatarCrop;
}

export function botAvatarProfile(value: BotAvatarProfileInput): BotAvatarProfile {
  const profile: BotAvatarProfile = {
    avatarCrop: isBotAvatarCrop(value.avatarCrop) ? value.avatarCrop : "mascot",
  };
  if (typeof value.avatarUrl === "string" && BOT_AVATAR_URL_PATTERN.test(value.avatarUrl)) {
    profile.avatarUrl = value.avatarUrl;
  }
  return profile;
}
