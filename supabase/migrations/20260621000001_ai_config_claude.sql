-- Switch the content engine to Claude with a cost-aware tiering:
--   default  → Sonnet 4.6  (workhorse: social posts, refine, chat, light tasks)
--   article  → Opus 4.8    (flagship long-form articles & blog posts)
-- This also fixes the broken fallback where a missing "article" row dropped
-- generation to Gemini 2.5 Pro, despite the prompts being tuned for a top model.

-- Point the default config at Anthropic Sonnet
update public.ai_config
   set provider   = 'anthropic',
       model_id   = 'claude-sonnet-4-6',
       updated_at = now()
 where id = 'default';

-- Ensure the default row exists even on a fresh DB
insert into public.ai_config (id, provider, model_id)
values ('default', 'anthropic', 'claude-sonnet-4-6')
on conflict (id) do nothing;

-- Dedicated row for flagship articles → Opus 4.8
insert into public.ai_config (id, provider, model_id)
values ('article', 'anthropic', 'claude-opus-4-8')
on conflict (id) do update
   set provider   = excluded.provider,
       model_id   = excluded.model_id,
       updated_at = now();
