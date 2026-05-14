-- Add content_type to article_drafts (linkedin | blog_he | blog_en)
ALTER TABLE article_drafts
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'linkedin'
    CHECK (content_type IN ('linkedin', 'blog_he', 'blog_en'));
