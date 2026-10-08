import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChatSession } from "./store";

// Supabase sync — same project + same login as GOlinkup (auth is
// project-wide, no separate signup). Offline-first: localStorage stays the
// source of truth; this only mirrors chats so the phone sees them after
// login. Needs island-ui/.env (gitignored) + the steroid_chats migration.

let client: SupabaseClient | null = null;

export function supa(): SupabaseClient | null {
  if (client) return client;
  const env = ((import.meta as unknown as { env?: Record<string, string> }).env) ?? {};
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

export function cloudConfigured(): boolean {
  return supa() !== null;
}

export async function sendCode(email: string): Promise<void> {
  const s = supa();
  if (!s) throw new Error("cloud not configured (island-ui/.env missing)");
  const { error } = await s.auth.signInWithOtp({ email: email.trim() });
  if (error) throw new Error(error.message);
}

export async function verifyCode(email: string, token: string): Promise<string> {
  const s = supa();
  if (!s) throw new Error("cloud not configured (island-ui/.env missing)");
  const { data, error } = await s.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email",
  });
  if (error) throw new Error(error.message);
  return data.user?.email ?? email.trim();
}

export async function signOut(): Promise<void> {
  await supa()?.auth.signOut();
}

// Google one-tap (same as GOlinkup): leaves to Google, returns to this
// page — the restore effect picks up the session. Needs this origin in
// Supabase dashboard → Authentication → URL Configuration, else it errors
// honestly here.
export async function signInGoogle(): Promise<void> {
  const s = supa();
  if (!s) throw new Error("cloud not configured (island-ui/.env missing)");
  const { error } = await s.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw new Error(error.message);
}

export async function accountEmail(): Promise<string | null> {
  try {
    const { data } = (await supa()?.auth.getSession()) ?? { data: { session: null } };
    return data.session?.user?.email ?? null;
  } catch {
    return null;
  }
}

// Profiles-table identity — the Flutter rule (account_drawer): the table
// wins over session metadata. Nulls where nothing set (RLS included) —
// callers fall back to email/initial. One query for photo + display name.
export async function profileIdentity(): Promise<{ avatar: string | null; name: string | null }> {
  const none = { avatar: null, name: null };
  try {
    const s = supa();
    if (!s) return none;
    const { data: { session } } = await s.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return none;
    const { data, error } = await s
      .from("profiles")
      .select("avatar_url, full_name")
      .eq("id", uid)
      .maybeSingle();
    if (error) return none;
    const row = (data as { avatar_url?: unknown; full_name?: unknown } | null) ?? {};
    const avatar = typeof row.avatar_url === "string" && row.avatar_url.trim() ? row.avatar_url.trim() : null;
    const name = typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : null;
    return { avatar, name };
  } catch {
    return none;
  }
}

// Session-metadata photo (Google avatar_url/picture, rides the session).
// Lowest priority — the profiles table wins. Null for email-OTP logins.
export async function sessionAvatar(): Promise<string | null> {
  try {
    const { data } = (await supa()?.auth.getSession()) ?? { data: { session: null } };
    const meta = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
    const url = meta?.avatar_url ?? meta?.picture;
    return typeof url === "string" && url ? url : null;
  } catch {
    return null;
  }
}

// Display name: profiles-table full_name wins (same rule as avatar), then
// Google session metadata (given+family, else full name split), null for
// email-OTP logins that never completed their account.
export interface DisplayName {
  full: string;
  first: string;
  last: string;
}

export async function displayName(): Promise<DisplayName | null> {
  try {
    const table = await profileIdentity();
    if (table.name) return splitName(table.name);
    const s = supa();
    const { data } = (await s?.auth.getSession()) ?? { data: { session: null } };
    const meta = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
    const given = typeof meta?.given_name === "string" ? meta.given_name.trim() : "";
    const family = typeof meta?.family_name === "string" ? meta.family_name.trim() : "";
    if (given || family) {
      const full = `${given} ${family}`.trim();
      return { full, first: given || full, last: family };
    }
    const raw = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
    if (raw.trim()) return splitName(raw.trim());
    return null;
  } catch {
    return null;
  }
}

function splitName(full: string): DisplayName {
  const parts = full.trim().split(/\s+/);
  return { full: full.trim(), first: parts[0] ?? full.trim(), last: parts.slice(1).join(" ") };
}

// Save first+last: auth metadata always (own-user update, no RLS needed),
// profiles-table upsert best-effort so the table rule keeps winning.
export async function saveDisplayName(first: string, last: string): Promise<DisplayName> {
  const s = supa();
  if (!s) throw new Error("cloud not configured (island-ui/.env missing)");
  const f = first.trim();
  const l = last.trim();
  if (f.length < 2) throw new Error("First name must be at least 2 characters.");
  const full = `${f} ${l}`.trim();
  const { error } = await s.auth.updateUser({
    data: { full_name: full, given_name: f, family_name: l },
  });
  if (error) throw new Error(error.message);
  try {
    const { data: { session } } = await s.auth.getSession();
    const uid = session?.user?.id;
    if (uid) await s.from("profiles").upsert({ id: uid, full_name: full }, { onConflict: "id" });
  } catch { /* RLS may forbid — metadata already saved, table just won't win */ }
  return { full, first: f, last: l };
}

// E2E sync key — one random 256-bit secret per human, shared across
// their devices by pasting a sync code. The server only ever sees
// AES-GCM ciphertext in messages; titles stay plaintext (first-sync
// dedup matches on title) and ids stay plaintext (merge + tombstones).
// ponytail: losing the code with no logged-in device left = old cloud
// chats unreadable. That's the price of the server never holding the key.
const SYNC_KEY_LS = "steroids_sync_key_v1";

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function getSyncKey(): string | null {
  try {
    return localStorage.getItem(SYNC_KEY_LS);
  } catch {
    return null;
  }
}

// First login mints the secret (44-char base64). Idempotent — existing key wins.
export function ensureSyncKey(): string {
  const cur = getSyncKey();
  if (cur) return cur;
  const code = b64(crypto.getRandomValues(new Uint8Array(32)));
  try {
    localStorage.setItem(SYNC_KEY_LS, code);
  } catch { /* private mode — key lives for the session only */ }
  return code;
}

// Second device pastes the code. 32 bytes or it isn't ours.
export function setSyncKey(code: string): void {
  const clean = code.trim().replace(/\s+/g, "");
  let raw: Uint8Array;
  try {
    raw = unb64(clean);
  } catch {
    throw new Error("that code doesn't look right");
  }
  if (raw.length !== 32) throw new Error("that code doesn't look right");
  try {
    localStorage.setItem(SYNC_KEY_LS, clean);
  } catch { /* private mode — see above */ }
}

async function aesKey(): Promise<CryptoKey> {
  const stored = getSyncKey();
  if (!stored) throw new Error("enter your sync code to start syncing");
  return crypto.subtle.importKey("raw", unb64(stored), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export interface EncBlob {
  v: 1;
  iv: string;
  data: string;
}

export async function encPayload(obj: unknown): Promise<EncBlob> {
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { v: 1, iv: b64(iv), data: b64(new Uint8Array(ct)) };
}

// Sealed rows decrypt; legacy plaintext rows (pre-encryption) pass
// through untouched — the next auto-push seals them in place.
export async function decPayload<T>(blob: unknown): Promise<T> {
  const b = blob as Partial<EncBlob>;
  if (!b || b.v !== 1 || typeof b.iv !== "string" || typeof b.data !== "string") {
    return blob as T;
  }
  const key = await aesKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(b.iv) },
    key,
    unb64(b.data),
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

export interface CloudRow {
  chat_id: string;
  title: string;
  messages: ChatSession["messages"];
  updated_at: string;
}

// Push: one sealed row per local chat (blob URLs stripped — bytes
// don't sync). Plaintext legacy rows already server-side get overwritten
// by ciphertext on the next push (same chat_id upsert). No key → no
// push: we'd rather stall than downgrade to plaintext.
export async function pushChats(rows: ChatSession[]): Promise<number> {
  const s = supa();
  if (!s) throw new Error("cloud not configured (island-ui/.env missing)");
  if (!getSyncKey()) throw new Error("enter your sync code to start syncing");
  const { data: { session } } = await s.auth.getSession();
  if (!session) throw new Error("not logged in");
  const clean = await Promise.all(
    JSON.parse(
      JSON.stringify(
        rows.map((r) => ({
          chat_id: r.cloudId ?? `local-${r.id}`,
          title: r.title,
          messages: r.messages,
          updated_at: new Date(r.updatedAt).toISOString(),
        })),
        (k, v) => (k === "url" ? undefined : v),
      ),
    ).map(async (r: { chat_id: string; title: string; messages: unknown; updated_at: string }) => ({
      ...r,
      messages: await encPayload(r.messages),
    })),
  );
  const { error } = await s.from("steroid_chats").upsert(clean, {
    onConflict: "user_id,chat_id",
  });
  if (error) throw new Error(error.message);
  return clean.length;
}

export interface PullResult {
  rows: CloudRow[];
  // Sealed rows we couldn't open (no/wrong key) — counted, never crash.
  skipped: number;
}

export async function pullChats(): Promise<PullResult> {
  const s = supa();
  if (!s) throw new Error("cloud not configured (island-ui/.env missing)");
  const { data, error } = await s
    .from("steroid_chats")
    .select("chat_id,title,messages,updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const rows: CloudRow[] = [];
  let skipped = 0;
  for (const r of (data ?? []) as CloudRow[]) {
    try {
      const messages = await decPayload<ChatSession["messages"]>(r.messages);
      rows.push({ ...r, messages });
    } catch {
      skipped++;
    }
  }
  return { rows, skipped };
}

// Tombstone: deleting a chat removes the cloud row too, or the next login
// pulls it right back (sync is additive upsert — local-only delete loses).
export async function deleteCloudChat(chatId: string): Promise<void> {
  const s = supa();
  if (!s) return; // logged out / no .env — local delete is the whole delete
  const { error } = await s.from("steroid_chats").delete().eq("chat_id", chatId);
  if (error) throw new Error(error.message);
}

// Tombstones (deleted-chat memory) live in ./store — localStorage only,
// no supabase, so the main bundle can use them without the cloud chunk.
