import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Item, Source, UserItemAction, UserPreferences, ActionType, ItemUserState } from "@/lib/types";
import { useAuth } from "./useAuth";

const DEFAULT_PREFS: Omit<UserPreferences, "user_id"> = {
  preferred_topics: [],
  preferred_sources: [],
  hidden_item_ids: [],
  region_preference: "balanced",
  show_unread_first: true,
  prioritize_events: false,
  hide_disliked: true,
};

export const useSources = () =>
  useQuery({
    queryKey: ["sources"],
    queryFn: async (): Promise<Source[]> => {
      const { data, error } = await supabase.from("sources").select("*").order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Source[];
    },
  });

export const useItems = () =>
  useQuery({
    queryKey: ["items"],
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("published_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

export const useUserActions = () => {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["user_actions", user?.id],
    queryFn: async (): Promise<UserItemAction[]> => {
      const { data, error } = await supabase
        .from("user_item_actions")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UserItemAction[];
    },
  });
};

/** Derive per-item user state from append-only action log. */
export const deriveItemStates = (actions: UserItemAction[] | undefined): Map<string, ItemUserState> => {
  const map = new Map<string, ItemUserState>();
  if (!actions) return map;
  for (const a of actions) {
    const cur = map.get(a.item_id) ?? { read: false, saved: false, liked: false, disliked: false };
    switch (a.action) {
      case "mark_read": cur.read = true; break;
      case "mark_unread": cur.read = false; break;
      case "save": cur.saved = true; break;
      case "unsave": cur.saved = false; break;
      case "like": cur.liked = true; cur.disliked = false; break;
      case "dislike": cur.disliked = true; cur.liked = false; break;
    }
    map.set(a.item_id, cur);
  }
  return map;
};

export const useLogAction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ itemId, action }: { itemId: string; action: ActionType }) => {
      if (!user) throw new Error("not authenticated");
      const { error } = await supabase.from("user_item_actions").insert({ item_id: itemId, action, user_id: user.id });
      if (error) throw error;
      // Increment view counter when viewing
      if (action === "view") {
        await supabase.rpc; // no-op placeholder; counter updates can be added via DB trigger later
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_actions"] });
    },
  });
};

export const usePreferences = () => {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["preferences", user?.id],
    queryFn: async (): Promise<UserPreferences> => {
      if (!user) throw new Error("not authenticated");
      const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!data) return { user_id: user.id, ...DEFAULT_PREFS };
      return data as UserPreferences;
    },
  });
};

export const useSavePreferences = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (prefs: Omit<UserPreferences, "user_id">) => {
      if (!user) throw new Error("not authenticated");
      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, ...prefs }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["preferences"] }),
  });
};
