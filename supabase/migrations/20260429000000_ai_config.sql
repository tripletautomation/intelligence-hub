-- AI configuration table — stores the active model/provider choice for Edge Functions.
-- API keys are stored as Supabase Edge Function secrets, not here.

create table if not exists public.ai_config (
  id        text primary key default 'default',
  provider  text not null default 'lovable',
  model_id  text not null default 'google/gemini-2.5-pro',
  updated_at timestamptz not null default now()
);

alter table public.ai_config enable row level security;

-- Only admins can read or write AI config
create policy "Admins manage AI config"
  on public.ai_config for all
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Seed with the current default (Lovable gateway → Gemini 2.5 Pro)
insert into public.ai_config (id, provider, model_id)
values ('default', 'lovable', 'google/gemini-2.5-pro')
on conflict (id) do nothing;
