// Domain types — independent from Supabase generated types so the data layer
// could be swapped to a different backend later with minimal change.

export type ItemType = "news" | "event" | "research" | "vendor";
export type Region = "israel" | "global";
export type ActionType =
  | "view"
  | "mark_read"
  | "mark_unread"
  | "save"
  | "unsave"
  | "like"
  | "dislike"
  | "open_source";

export interface Source {
  id: string;
  name: string;
  category: string | null;
  type: string | null;
  region: string | null;
  priority: number;
  active: boolean;
  url: string | null;
}

export interface Item {
  id: string;
  source_id: string | null;
  item_type: ItemType;
  region: Region | null;
  url: string | null;
  published_at: string | null;
  title_he: string;
  summary_he: string | null;
  why_it_matters: string | null;
  tags_ai: string[];
  relevance_score: number;
  event_date: string | null;
  event_location: string | null;
  event_is_online: boolean | null;
  event_register_url: string | null;
  view_count: number;
  is_featured: boolean;
}

export interface UserItemAction {
  id: string;
  user_id: string;
  item_id: string;
  action: ActionType;
  created_at: string;
}

export interface UserPreferences {
  user_id: string;
  preferred_topics: string[];
  preferred_sources: string[];
  hidden_item_ids: string[];
  region_preference: "israel" | "global" | "balanced";
  show_unread_first: boolean;
  prioritize_events: boolean;
  hide_disliked: boolean;
  user_relevance_boost: Record<string, number>;
}

export interface ItemUserState {
  read: boolean;
  saved: boolean;
  liked: boolean;
  disliked: boolean;
}

export interface TopicCategory {
  id: string;
  name: string;
  keywords: string[];
  sort_order: number;
}
