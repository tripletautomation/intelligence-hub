-- 1. Add the missing source columns (keep existing ones intact)
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Validate status values via trigger (avoids check-constraint immutability issues)
CREATE OR REPLACE FUNCTION public.validate_source_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('valid', 'invalid', 'pending', 'archived') THEN
    RAISE EXCEPTION 'invalid status: %, must be valid|invalid|pending|archived', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_source_status_trg ON public.sources;
CREATE TRIGGER validate_source_status_trg
BEFORE INSERT OR UPDATE ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.validate_source_status();

-- updated_at trigger for sources
DROP TRIGGER IF EXISTS sources_updated_at ON public.sources;
CREATE TRIGGER sources_updated_at
BEFORE UPDATE ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. App role enum + user_roles table (separate table per security best-practice)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security-definer role-check function (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. RLS policies on user_roles: users see their own roles; only admins manage roles
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;
CREATE POLICY "admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Admin-gated write RLS on sources (SELECT stays open to authenticated)
DROP POLICY IF EXISTS "admins insert sources" ON public.sources;
CREATE POLICY "admins insert sources" ON public.sources
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins update sources" ON public.sources;
CREATE POLICY "admins update sources" ON public.sources
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins delete sources" ON public.sources;
CREATE POLICY "admins delete sources" ON public.sources
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. (First admin is granted manually after signup via the Dashboard or SQL Editor)

-- 7. Backfill status for existing sources: those with rss_url + active → valid, else pending
UPDATE public.sources
SET status = CASE
  WHEN active = true AND rss_url IS NOT NULL AND rss_url <> '' THEN 'valid'
  WHEN is_seed = true THEN 'pending'
  ELSE 'pending'
END
WHERE status = 'pending';