CREATE TABLE public.saved_discoveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  event_date timestamptz,
  location text,
  is_online boolean DEFAULT false,
  source_name text,
  source_url text NOT NULL,
  summary text,
  why_it_matters text,
  query text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own discoveries" ON public.saved_discoveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own discoveries" ON public.saved_discoveries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own discoveries" ON public.saved_discoveries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own discoveries" ON public.saved_discoveries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_saved_discoveries_updated_at
  BEFORE UPDATE ON public.saved_discoveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_saved_discoveries_user ON public.saved_discoveries(user_id, created_at DESC);