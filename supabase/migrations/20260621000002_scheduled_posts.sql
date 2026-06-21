-- Publishing queue: scheduled posts per platform.
-- This is the foundation for "schedule + one-click publish" — posts are queued
-- with a target time; a cron dispatcher emails the ready-to-paste content when
-- a post comes due. Real auto-posting via platform APIs can layer on later.

create table if not exists public.scheduled_posts (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid references public.article_drafts(id) on delete cascade,
  platform     text not null check (platform in (
                 'linkedin_he','linkedin_en','instagram','facebook','blog','newsletter'
               )),
  content      text not null,
  media_prompt text,
  scheduled_at timestamptz not null,
  status       text not null default 'queued' check (status in (
                 'queued','due','published','skipped'
               )),
  published_at timestamptz,
  user_id      uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_scheduled_posts_status_time
  on public.scheduled_posts (status, scheduled_at);
create index if not exists idx_scheduled_posts_draft
  on public.scheduled_posts (draft_id);

alter table public.scheduled_posts enable row level security;

-- Team-wide access, consistent with article_drafts / social_posts
create policy "team full access scheduled posts"
  on public.scheduled_posts for all to authenticated
  using (true)
  with check (true);

-- Dispatcher: every hour, mark queued posts whose time has arrived as "due"
-- and let the edge function email the ready-to-paste content.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('dispatch-due-posts') where exists (
  select 1 from cron.job where jobname = 'dispatch-due-posts'
);

select cron.schedule(
  'dispatch-due-posts',
  '5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL') || '/functions/v1/dispatch-due-posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);
