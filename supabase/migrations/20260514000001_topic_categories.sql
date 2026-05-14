-- Topic categories for Dashboard grouping
CREATE TABLE IF NOT EXISTS topic_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE topic_categories ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "authenticated read topic_categories"
  ON topic_categories FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can write
CREATE POLICY "admin write topic_categories"
  ON topic_categories FOR ALL
  TO authenticated
  USING (has_role('admin'::app_role))
  WITH CHECK (has_role('admin'::app_role));

-- Seed with default categories relevant to data centers / tech / finance
INSERT INTO topic_categories (name, keywords, sort_order) VALUES
  ('AI & מחשוב', ARRAY['ai', 'artificial intelligence', 'machine learning', 'gpu', 'nvidia', 'llm', 'generative ai', 'deep learning', 'מודל שפה', 'בינה מלאכותית'], 1),
  ('מרכזי נתונים', ARRAY['data center', 'datacenter', 'colocation', 'colo', 'hyperscaler', 'cloud', 'aws', 'azure', 'google cloud', 'מרכז נתונים', 'ענן'], 2),
  ('תשתיות ואנרגיה', ARRAY['power', 'energy', 'electricity', 'cooling', 'infrastructure', 'grid', 'renewable', 'solar', 'אנרגיה', 'תשתיות', 'חשמל'], 3),
  ('שוק הון', ARRAY['stocks', 'shares', 'investment', 'ipo', 'nasdaq', 'market', 'equity', 'מניות', 'בורסה', 'השקעות', 'שוק ההון'], 4),
  ('נדל"ן', ARRAY['real estate', 'property', 'reit', 'land', 'building', 'נדל"ן', 'נכסים', 'קרקע', 'בנייה'], 5),
  ('רגולציה ומדיניות', ARRAY['regulation', 'policy', 'law', 'government', 'regulatory', 'compliance', 'רגולציה', 'מדיניות', 'חקיקה', 'ממשלה'], 6);
