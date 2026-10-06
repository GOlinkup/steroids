-- steroid_chats: make user_id server-derived so browser upserts work under RLS.
-- pushChats() never sent user_id; with no default every push failed on the
-- not-null violation. auth.uid() default fills it from the JWT at insert.
-- Applied to the linked project via `supabase db query` (remote migration
-- history has diverged from this repo copy; `db push` would repair-revert
-- other apps' migrations). Recorded here so `db pull` adopts it as applied.
alter table public.steroid_chats
  alter column user_id set default auth.uid();
