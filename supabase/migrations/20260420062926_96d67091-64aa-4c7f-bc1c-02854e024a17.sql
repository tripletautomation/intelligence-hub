
-- Updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =========================
-- sources
-- =========================
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  type TEXT,
  region TEXT,
  priority INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources readable by authenticated"
  ON public.sources FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_sources_updated_at
  BEFORE UPDATE ON public.sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- items
-- =========================
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL DEFAULT 'news', -- news | event | research | vendor
  region TEXT, -- israel | global
  url TEXT,
  published_at TIMESTAMPTZ,
  -- Original
  title_orig TEXT,
  summary_orig TEXT,
  -- Hebrew
  title_he TEXT NOT NULL,
  summary_he TEXT,
  -- AI enrichment
  why_it_matters TEXT,
  tags_ai TEXT[] NOT NULL DEFAULT '{}',
  relevance_score INT NOT NULL DEFAULT 0,
  -- Event fields
  event_date TIMESTAMPTZ,
  event_location TEXT,
  event_is_online BOOLEAN,
  event_register_url TEXT,
  -- Counters / flags
  view_count INT NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items readable by authenticated"
  ON public.items FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_items_published_at ON public.items(published_at DESC);
CREATE INDEX idx_items_event_date ON public.items(event_date);
CREATE INDEX idx_items_type ON public.items(item_type);
CREATE INDEX idx_items_region ON public.items(region);
CREATE INDEX idx_items_tags ON public.items USING GIN(tags_ai);
CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- user_item_actions (append-only log)
-- =========================
CREATE TABLE public.user_item_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- view | mark_read | mark_unread | save | unsave | like | dislike | open_source
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_item_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_uia_user_item ON public.user_item_actions(user_id, item_id, created_at DESC);
CREATE INDEX idx_uia_user_action ON public.user_item_actions(user_id, action, created_at DESC);

CREATE POLICY "users select own actions"
  ON public.user_item_actions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users insert own actions"
  ON public.user_item_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own actions"
  ON public.user_item_actions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =========================
-- user_preferences
-- =========================
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY,
  preferred_topics TEXT[] NOT NULL DEFAULT '{}',
  preferred_sources UUID[] NOT NULL DEFAULT '{}',
  hidden_item_ids UUID[] NOT NULL DEFAULT '{}',
  region_preference TEXT NOT NULL DEFAULT 'balanced', -- israel | global | balanced
  show_unread_first BOOLEAN NOT NULL DEFAULT true,
  prioritize_events BOOLEAN NOT NULL DEFAULT false,
  hide_disliked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users select own prefs"
  ON public.user_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users insert own prefs"
  ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own prefs"
  ON public.user_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE TRIGGER trg_user_prefs_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
