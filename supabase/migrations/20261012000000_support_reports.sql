-- Support bug reports with screenshots (island app, same project auth as GOlinkup).
-- Flow: user drops a screenshot + text in Settings → Support; browser
-- uploads to the private `support-reports` bucket under <uid>/, then inserts
-- one `support_reports` row. Owner-only rows (user reads own reports back);
-- support reads via service_role/dashboard. No R2 involved (R2 is only the
-- jobs-media fallback bot in GOlinkup).
-- Apply: paste into the dashboard SQL editor (remote migration history has
-- diverged from repo copies — `db push` would repair-revert other apps).

-- 1. Private bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('support-reports', 'support-reports', false)
on conflict (id) do nothing;

-- 2. One row per report.
create table if not exists public.support_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  image_path text,
  app_version text not null default '',
  created_at timestamptz not null default now()
);

alter table public.support_reports enable row level security;

drop policy if exists "own support insert" on public.support_reports;
create policy "own support insert" on public.support_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "own support select" on public.support_reports;
create policy "own support select" on public.support_reports
  for select using (auth.uid() = user_id);

-- 3. Storage RLS (uid-folder rule, same as safety-recordings).
drop policy if exists "support reports insert own" on storage.objects;
create policy "support reports insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'support-reports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "support reports select own" on storage.objects;
create policy "support reports select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'support-reports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "support reports delete own" on storage.objects;
create policy "support reports delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'support-reports' and (storage.foldername(name))[1] = auth.uid()::text);
