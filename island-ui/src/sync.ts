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

export interface CloudRow {
  chat_id: string;
  title: string;
  messages: ChatSession["messages"];
  updated_at: string;
}

// Push: one row per local chat (blob URLs stripped — bytes don't sync).
export async function pushChats(rows: ChatSession[]): Promise<number> {
  const s = supa();
  if (!s) throw new Error("cloud not configured (island-ui/.env missing)");
  const { data: { session } } = await s.auth.getSession();
  if (!session) throw new Error("not logged in");
  const clean = JSON.parse(
    JSON.stringify(
      rows.map((r) => ({
        chat_id: r.cloudId ?? `local-${r.id}`,
        title: r.title,
        messages: r.messages,
        updated_at: new Date(r.updatedAt).toISOString(),
      })),
      (k, v) => (k === "url" ? undefined : v),
    ),
  );
  const { error } = await s.from("steroid_chats").upsert(clean, {
    onConflict: "user_id,chat_id",
  });
  if (error) throw new Error(error.message);
  return clean.length;
}

export async function pullChats(): Promise<CloudRow[]> {
  const s = supa();
  if (!s) throw new Error("cloud not configured (island-ui/.env missing)");
  const { data, error } = await s
    .from("steroid_chats")
    .select("chat_id,title,messages,updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudRow[];
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
