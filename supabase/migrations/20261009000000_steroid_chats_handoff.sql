-- steroid_chats: carry the session handoff note (goal → result) so the
-- other screen opens with memory, not just transcript. Nullable + client-
-- tolerant: old clients ignore it, new clients fall back when absent.
alter table public.steroid_chats
  add column if not exists handoff text;
