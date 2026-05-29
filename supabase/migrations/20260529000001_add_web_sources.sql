ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS web_sources jsonb DEFAULT '[]';
