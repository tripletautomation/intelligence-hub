-- 1. Extend sources
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS rss_url TEXT,
  ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false;

-- 2. Extend items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false;

-- Dedup: unique URL when present
CREATE UNIQUE INDEX IF NOT EXISTS items_url_unique_idx
  ON public.items (url)
  WHERE url IS NOT NULL;

-- 3. Mark existing rows as seed
UPDATE public.sources SET is_seed = true WHERE created_at < now();
UPDATE public.items   SET is_seed = true WHERE created_at < now();

-- 4. ingestion_runs log
CREATE TABLE IF NOT EXISTS public.ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  source_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running | success | error | partial
  fetched INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors_json JSONB,
  triggered_by TEXT NOT NULL DEFAULT 'manual'
);

ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_runs readable by authenticated"
  ON public.ingestion_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS ingestion_runs_started_at_idx
  ON public.ingestion_runs (started_at DESC);

-- 5. Insert real Phase 1 sources (skip if already present by name)
INSERT INTO public.sources (name, category, type, region, priority, active, url, rss_url, is_seed)
SELECT 'Data Center Dynamics', 'industry_news', 'news', 'global', 90, true,
       'https://www.datacenterdynamics.com',
       'https://www.datacenterdynamics.com/en/rss/', false
WHERE NOT EXISTS (SELECT 1 FROM public.sources WHERE name = 'Data Center Dynamics');

INSERT INTO public.sources (name, category, type, region, priority, active, url, rss_url, is_seed)
SELECT 'Calcalist Tech', 'industry_news', 'news', 'israel', 85, true,
       'https://www.calcalist.co.il',
       'https://www.calcalist.co.il/GeneralRSS/0,16335,L-8,00.xml', false
WHERE NOT EXISTS (SELECT 1 FROM public.sources WHERE name = 'Calcalist Tech');