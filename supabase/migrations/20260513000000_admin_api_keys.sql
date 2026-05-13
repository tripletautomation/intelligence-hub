-- Admin API Keys table (admin-only)
create table public.admin_api_keys (
  key_name   text primary key,
  key_value  text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.admin_api_keys enable row level security;

create policy "Admins only"
  on public.admin_api_keys for all
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Writing style guidelines column on ai_config
alter table public.ai_config add column if not exists prompt_text text;

-- Social posts: expand platform constraint to include new formats
alter table public.social_posts drop constraint if exists social_posts_platform_check;

alter table public.social_posts add constraint social_posts_platform_check
  check (platform in (
    'linkedin_en',
    'linkedin_he',
    'image_prompt',
    'linkedin',
    'facebook',
    'instagram',
    'twitter'
  ));
