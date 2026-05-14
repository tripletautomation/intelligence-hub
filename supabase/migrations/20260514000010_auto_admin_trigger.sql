-- Auto-grant admin role to every new user on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_auto_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_auto_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_auto_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_auto_admin();

-- Also grant admin to all existing users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;
