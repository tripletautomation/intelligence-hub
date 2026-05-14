-- Content images table — stores AI-generated image prompts per draft
CREATE TABLE IF NOT EXISTS content_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES article_drafts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  image_type TEXT NOT NULL CHECK (image_type IN ('hero', 'square', 'newsletter', 'infographic')),
  prompt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (draft_id, image_type)
);

ALTER TABLE content_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own content_images"
  ON content_images FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
