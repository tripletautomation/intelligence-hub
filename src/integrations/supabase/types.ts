export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ingestion_runs: {
        Row: {
          errors_json: Json | null
          fetched: number
          finished_at: string | null
          id: string
          inserted: number
          skipped: number
          source_id: string | null
          source_name: string | null
          started_at: string
          status: string
          triggered_by: string
        }
        Insert: {
          errors_json?: Json | null
          fetched?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          skipped?: number
          source_id?: string | null
          source_name?: string | null
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Update: {
          errors_json?: Json | null
          fetched?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          skipped?: number
          source_id?: string | null
          source_name?: string | null
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          created_at: string
          event_date: string | null
          event_is_online: boolean | null
          event_location: string | null
          event_register_url: string | null
          id: string
          is_featured: boolean
          is_seed: boolean
          item_type: string
          published_at: string | null
          region: string | null
          relevance_score: number
          source_id: string | null
          summary_he: string | null
          summary_orig: string | null
          tags_ai: string[]
          title_he: string
          title_orig: string | null
          updated_at: string
          url: string | null
          view_count: number
          why_it_matters: string | null
        }
        Insert: {
          created_at?: string
          event_date?: string | null
          event_is_online?: boolean | null
          event_location?: string | null
          event_register_url?: string | null
          id?: string
          is_featured?: boolean
          is_seed?: boolean
          item_type?: string
          published_at?: string | null
          region?: string | null
          relevance_score?: number
          source_id?: string | null
          summary_he?: string | null
          summary_orig?: string | null
          tags_ai?: string[]
          title_he: string
          title_orig?: string | null
          updated_at?: string
          url?: string | null
          view_count?: number
          why_it_matters?: string | null
        }
        Update: {
          created_at?: string
          event_date?: string | null
          event_is_online?: boolean | null
          event_location?: string | null
          event_register_url?: string | null
          id?: string
          is_featured?: boolean
          is_seed?: boolean
          item_type?: string
          published_at?: string | null
          region?: string | null
          relevance_score?: number
          source_id?: string | null
          summary_he?: string | null
          summary_orig?: string | null
          tags_ai?: string[]
          title_he?: string
          title_orig?: string | null
          updated_at?: string
          url?: string | null
          view_count?: number
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          active: boolean
          archived_at: string | null
          category: string | null
          created_at: string
          display_name: string | null
          id: string
          is_seed: boolean
          name: string
          notes: string | null
          priority: number
          region: string | null
          rss_url: string | null
          status: string
          type: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          category?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_seed?: boolean
          name: string
          notes?: string | null
          priority?: number
          region?: string | null
          rss_url?: string | null
          status?: string
          type?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          category?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_seed?: boolean
          name?: string
          notes?: string | null
          priority?: number
          region?: string | null
          rss_url?: string | null
          status?: string
          type?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      user_item_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_item_actions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          hidden_item_ids: string[]
          hide_disliked: boolean
          preferred_sources: string[]
          preferred_topics: string[]
          prioritize_events: boolean
          region_preference: string
          show_unread_first: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hidden_item_ids?: string[]
          hide_disliked?: boolean
          preferred_sources?: string[]
          preferred_topics?: string[]
          prioritize_events?: boolean
          region_preference?: string
          show_unread_first?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hidden_item_ids?: string[]
          hide_disliked?: boolean
          preferred_sources?: string[]
          preferred_topics?: string[]
          prioritize_events?: boolean
          region_preference?: string
          show_unread_first?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
