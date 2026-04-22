-- Track promotion link from saved_discoveries -> items
ALTER TABLE public.saved_discoveries
  ADD COLUMN IF NOT EXISTS promoted_to_item_id uuid NULL;

-- Allow admins to insert curated items
DROP POLICY IF EXISTS "admins insert items" ON public.items;
CREATE POLICY "admins insert items"
ON public.items
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Promotion function (admin only)
CREATE OR REPLACE FUNCTION public.promote_discovery_to_item(_discovery_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.saved_discoveries%ROWTYPE;
  new_item_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO d FROM public.saved_discoveries WHERE id = _discovery_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'discovery not found';
  END IF;

  IF d.promoted_to_item_id IS NOT NULL THEN
    RETURN d.promoted_to_item_id;
  END IF;

  INSERT INTO public.items (
    item_type, title_he, summary_he, why_it_matters,
    url, event_date, event_location, event_is_online,
    event_register_url, published_at, is_featured, is_seed
  ) VALUES (
    'event', d.title, d.summary, d.why_it_matters,
    d.source_url, d.event_date, d.location, COALESCE(d.is_online, false),
    d.source_url, COALESCE(d.event_date, now()), false, false
  )
  RETURNING id INTO new_item_id;

  UPDATE public.saved_discoveries
    SET promoted_to_item_id = new_item_id, updated_at = now()
    WHERE id = _discovery_id;

  RETURN new_item_id;
END;
$$;