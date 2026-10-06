// Island profile view-model: mirror-only assembly (pure, no IO).
// Sources mirror island/profile.py: linked accounts or honest empty.
export interface IslandProfile {
  user_id: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  links: string[];
  verified: boolean;
  gigs_done: number;
  gigs_saved: number;
}

export const EMPTY_PROFILE: IslandProfile = {
  user_id: "",
  handle: "",
  avatar_url: null,
  bio: null,
  links: [],
  verified: false,
  gigs_done: 0,
  gigs_saved: 0,
};

export function isEmptyProfile(p: IslandProfile): boolean {
  return p.user_id === "";
}

/** Backend row (or null) -> view-model. Null reads honest empty. */
export function assembleMirror(
  row: Record<string, unknown> | null | undefined,
): IslandProfile {
  if (!row || !row.user_id) return { ...EMPTY_PROFILE };
  const str = (v: unknown): string =>
    typeof v === "string" ? v : "";
  return {
    user_id: str(row.user_id),
    handle: str(row.handle),
    avatar_url: (row.avatar_url as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    links: Array.isArray(row.links)
      ? (row.links as unknown[]).map(String)
      : [],
    verified: row.verified === true,
    gigs_done: typeof row.gigs_done === "number" ? row.gigs_done : 0,
    gigs_saved: typeof row.gigs_saved === "number" ? row.gigs_saved : 0,
  };
}
