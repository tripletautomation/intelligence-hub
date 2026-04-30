create table public.social_posts (
  id         uuid primary key default gen_random_uuid(),
  draft_id   uuid not null references public.article_drafts(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  platform   text not null check (platform in ('linkedin','facebook','instagram','twitter')),
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, platform)
);

alter table public.social_posts enable row level security;

create policy "Users manage own social posts"
  on public.social_posts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
