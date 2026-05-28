ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS source_notes jsonb DEFAULT '{}';
