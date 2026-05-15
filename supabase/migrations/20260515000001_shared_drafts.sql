-- Make article_drafts and social_posts shared across all authenticated users
-- (small team, all admins — full shared workspace)

-- article_drafts: replace user-scoped policies with team-wide access
drop policy if exists "users select own drafts" on public.article_drafts;
drop policy if exists "users insert own drafts" on public.article_drafts;
drop policy if exists "users update own drafts" on public.article_drafts;
drop policy if exists "users delete own drafts" on public.article_drafts;

create policy "team full access drafts"
  on public.article_drafts for all to authenticated
  using (true)
  with check (true);

-- social_posts: same
drop policy if exists "Users manage own social posts" on public.social_posts;

create policy "team full access social posts"
  on public.social_posts for all to authenticated
  using (true)
  with check (true);
