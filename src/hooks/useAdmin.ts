import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS === 'true';

/** Returns true if the current user has the 'admin' role. */
export const useIsAdmin = () => {
  const { user } = useAuth();
  return useQuery({
    enabled: DEV_BYPASS || !!user,
    queryKey: ["is_admin", user?.id],
    queryFn: async (): Promise<boolean> => {
      if (DEV_BYPASS) return true;
      if (!user) return false;
      const { data, error } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });
};
