create table public.article_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  intro text,
  body text,
  closing text,
  source_item_ids uuid[] not null default '{}'::uuid[],
  style_note text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.article_drafts enable row level security;

create policy "users select own drafts"
  on public.article_drafts for select to authenticated
  using (auth.uid() = user_id);

create policy "users insert own drafts"
  on public.article_drafts for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users update own drafts"
  on public.article_drafts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own drafts"
  on public.article_drafts for delete to authenticated
  using (auth.uid() = user_id);

create trigger article_drafts_set_updated_at
  before update on public.article_drafts
  for each row execute function public.update_updated_at_column();

create index article_drafts_user_idx on public.article_drafts(user_id, created_at desc);