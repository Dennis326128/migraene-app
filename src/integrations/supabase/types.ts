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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      entry_symptoms: {
        Row: {
          created_at: string
          entry_id: number
          symptom_id: string
        }
        Insert: {
          created_at?: string
          entry_id: number
          symptom_id: string
        }
        Update: {
          created_at?: string
          entry_id?: number
          symptom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_symptoms_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "pain_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_symptoms_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "symptom_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      pain_entries: {
        Row: {
          aura_type: string
          id: number
          medications: string[] | null
          notes: string | null
          pain_level: string
          pain_location: string | null
          selected_date: string | null
          selected_time: string | null
          timestamp_created: string | null
          user_id: string | null
          weather_id: number | null
        }
        Insert: {
          aura_type?: string
          id?: number
          medications?: string[] | null
          notes?: string | null
          pain_level: string
          pain_location?: string | null
          selected_date?: string | null
          selected_time?: string | null
          timestamp_created?: string | null
          user_id?: string | null
          weather_id?: number | null
        }
        Update: {
          aura_type?: string
          id?: number
          medications?: string[] | null
          notes?: string | null
          pain_level?: string
          pain_location?: string | null
          selected_date?: string | null
          selected_time?: string | null
          timestamp_created?: string | null
          user_id?: string | null
          weather_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pain_weather"
            columns: ["weather_id"]
            isOneToOne: false
            referencedRelation: "weather_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pain_entries_weather_id_fkey"
            columns: ["weather_id"]
            isOneToOne: false
            referencedRelation: "weather_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      symptom_catalog: {
        Row: {
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      user_medications: {
        Row: {
          created_at: string | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          latitude: number | null
          longitude: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          latitude?: number | null
          longitude?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          latitude?: number | null
          longitude?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          backfill_days: number
          default_report_preset: string
          include_no_meds: boolean
          snapshot_hours: number[]
          updated_at: string
          user_id: string
        }
        Insert: {
          backfill_days?: number
          default_report_preset?: string
          include_no_meds?: boolean
          snapshot_hours?: number[]
          updated_at?: string
          user_id: string
        }
        Update: {
          backfill_days?: number
          default_report_preset?: string
          include_no_meds?: boolean
          snapshot_hours?: number[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weather_logs: {
        Row: {
          condition_icon: string | null
          condition_text: string | null
          created_at: string | null
          humidity: number | null
          id: number
          latitude: number
          location: string | null
          longitude: number
          moon_phase: number | null
          moonrise: number | null
          moonset: number | null
          pressure_change_24h: number | null
          pressure_mb: number | null
          temperature_c: number | null
          user_id: string | null
          wind_kph: number | null
        }
        Insert: {
          condition_icon?: string | null
          condition_text?: string | null
          created_at?: string | null
          humidity?: number | null
          id?: number
          latitude: number
          location?: string | null
          longitude: number
          moon_phase?: number | null
          moonrise?: number | null
          moonset?: number | null
          pressure_change_24h?: number | null
          pressure_mb?: number | null
          temperature_c?: number | null
          user_id?: string | null
          wind_kph?: number | null
        }
        Update: {
          condition_icon?: string | null
          condition_text?: string | null
          created_at?: string | null
          humidity?: number | null
          id?: number
          latitude?: number
          location?: string | null
          longitude?: number
          moon_phase?: number | null
          moonrise?: number | null
          moonset?: number | null
          pressure_change_24h?: number | null
          pressure_mb?: number | null
          temperature_c?: number | null
          user_id?: string | null
          wind_kph?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      invoke_auto_weather: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      rpc_entries_filtered: {
        Args: {
          p_aura_types?: string[]
          p_from: string
          p_levels?: string[]
          p_pain_locations?: string[]
          p_to: string
          p_user: string
        }
        Returns: {
          aura_type: string
          id: number
          medications: string[] | null
          notes: string | null
          pain_level: string
          pain_location: string | null
          selected_date: string | null
          selected_time: string | null
          timestamp_created: string | null
          user_id: string | null
          weather_id: number | null
        }[]
      }
      rpc_migraine_stats: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: {
          avg_intensity: number
          most_common_aura: string
          most_common_location: string
          most_common_time_hour: number
          total_entries: number
          with_medication_count: number
        }[]
      }
      rpc_time_distribution: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: {
          entry_count: number
          hour_of_day: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
