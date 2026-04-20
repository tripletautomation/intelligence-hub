-- DCD Events: global events source, runnable on current RSS pipeline.
INSERT INTO public.sources (name, display_name, type, category, region, url, rss_url, active, status, is_seed, priority, notes)
SELECT
  'DCD Events',
  'DCD Events',
  'events',
  'events',
  'global',
  'https://www.datacenterdynamics.com/en/events/',
  'https://www.datacenterdynamics.com/en/rss/events/',
  true,
  'pending',  -- will flip to 'valid' after first successful validate-rss / ingest-rss
  false,
  10,
  'Primary global events source. Validate RSS via Source Manager to mark as valid.'
WHERE NOT EXISTS (SELECT 1 FROM public.sources WHERE name = 'DCD Events');

-- IDCA Events: Israel events, page-based, NOT runnable in current RSS pipeline.
INSERT INTO public.sources (name, display_name, type, category, region, url, rss_url, active, status, is_seed, priority, notes)
SELECT
  'IDCA Events',
  'IDCA Events',
  'events',
  'events',
  'israel',
  'https://www.idca.org.il/en/events',
  NULL,
  false,    -- inactive so RSS pipeline ignores it
  'pending',
  false,
  9,
  'Israel events source (IDCA). No public RSS feed available — queued for the next phase using page-based ingestion. Do not enable until that pipeline ships.'
WHERE NOT EXISTS (SELECT 1 FROM public.sources WHERE name = 'IDCA Events');