-- Prompt templates for each content type (editable from Admin)
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read prompt_templates"
  ON prompt_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin write prompt_templates"
  ON prompt_templates FOR ALL
  TO authenticated
  USING (has_role('admin'::app_role))
  WITH CHECK (has_role('admin'::app_role));

-- Seed with default prompt IDs (Edge Functions fall back to hardcoded if row missing)
INSERT INTO prompt_templates (id, label, system_prompt) VALUES
  ('article_linkedin', 'מאמר LinkedIn — סגנון מנכ"ל', ''),
  ('article_blog_he', 'מאמר בלוג — עברית', ''),
  ('article_blog_en', 'מאמר בלוג — אנגלית', ''),
  ('social_linkedin_en', 'פוסט LinkedIn — אנגלית', ''),
  ('social_linkedin_he', 'פוסט LinkedIn — עברית', ''),
  ('image_hero', 'תמונת Hero (16:9) — בלוג/מאמר', ''),
  ('image_square', 'תמונת סקוור (1:1) — LinkedIn/פוסטים', ''),
  ('image_newsletter', 'תמונת ניוזלטר (3:1) — כותרת', ''),
  ('image_infographic', 'אינפוגרפיקה (4:5) — נתונים ויזואליים', '')
ON CONFLICT (id) DO NOTHING;
