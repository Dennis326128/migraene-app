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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      entry_medications: {
        Row: {
          created_at: string
          dosage: string | null
          effectiveness_rating: number | null
          entry_id: number
          id: string
          medication_name: string
          notes: string | null
          taken_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          effectiveness_rating?: number | null
          entry_id: number
          id?: string
          medication_name: string
          notes?: string | null
          taken_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          effectiveness_rating?: number | null
          entry_id?: number
          id?: string
          medication_name?: string
          notes?: string | null
          taken_at?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      event_meds: {
        Row: {
          created_at: string
          dose_mg: number | null
          event_id: number
          id: number
          med_id: string
          source: string
          taken_at: string
          units: string | null
          was_default: boolean | null
        }
        Insert: {
          created_at?: string
          dose_mg?: number | null
          event_id: number
          id?: number
          med_id: string
          source?: string
          taken_at?: string
          units?: string | null
          was_default?: boolean | null
        }
        Update: {
          created_at?: string
          dose_mg?: number | null
          event_id?: number
          id?: number
          med_id?: string
          source?: string
          taken_at?: string
          units?: string | null
          was_default?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "event_meds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_meds_med_id_fkey"
            columns: ["med_id"]
            isOneToOne: false
            referencedRelation: "user_medications"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          default_symptoms_applied: boolean | null
          duration_min: number | null
          id: number
          intensity_0_10: number | null
          location_geo: unknown | null
          notes_extraordinary: string | null
          started_at: string
          type: string
          updated_at: string
          user_id: string
          weather_id: number | null
        }
        Insert: {
          created_at?: string
          default_symptoms_applied?: boolean | null
          duration_min?: number | null
          id?: number
          intensity_0_10?: number | null
          location_geo?: unknown | null
          notes_extraordinary?: string | null
          started_at: string
          type?: string
          updated_at?: string
          user_id?: string
          weather_id?: number | null
        }
        Update: {
          created_at?: string
          default_symptoms_applied?: boolean | null
          duration_min?: number | null
          id?: number
          intensity_0_10?: number | null
          location_geo?: unknown | null
          notes_extraordinary?: string | null
          started_at?: string
          type?: string
          updated_at?: string
          user_id?: string
          weather_id?: number | null
        }
        Relationships: []
      }
      hormonal_logs: {
        Row: {
          contraception_active: boolean | null
          contraception_type: string | null
          created_at: string
          cycle_day: number | null
          cycle_phase: string | null
          id: string
          log_date: string
          notes: string | null
          symptoms: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contraception_active?: boolean | null
          contraception_type?: string | null
          created_at?: string
          cycle_day?: number | null
          cycle_phase?: string | null
          id?: string
          log_date: string
          notes?: string | null
          symptoms?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          contraception_active?: boolean | null
          contraception_type?: string | null
          created_at?: string
          cycle_day?: number | null
          cycle_phase?: string | null
          id?: string
          log_date?: string
          notes?: string | null
          symptoms?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lifestyle_logs: {
        Row: {
          alcohol_units: number | null
          caffeine_mg: number | null
          created_at: string
          exercise_minutes: number | null
          id: string
          log_date: string
          notes: string | null
          sleep_hours: number | null
          sleep_quality: number | null
          stress_level: number | null
          trigger_foods: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alcohol_units?: number | null
          caffeine_mg?: number | null
          created_at?: string
          exercise_minutes?: number | null
          id?: string
          log_date: string
          notes?: string | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          stress_level?: number | null
          trigger_foods?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          alcohol_units?: number | null
          caffeine_mg?: number | null
          created_at?: string
          exercise_minutes?: number | null
          id?: string
          log_date?: string
          notes?: string | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          stress_level?: number | null
          trigger_foods?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      med_effects: {
        Row: {
          created_at: string
          documented_at: string
          effect_rating_0_4: number | null
          event_med_id: number
          id: number
          onset_min: number | null
          pain_after_0_10: number | null
          pain_before_0_10: number | null
          relief_duration_min: number | null
          relief_percent_0_100: number | null
          side_effects_text: string | null
        }
        Insert: {
          created_at?: string
          documented_at?: string
          effect_rating_0_4?: number | null
          event_med_id: number
          id?: number
          onset_min?: number | null
          pain_after_0_10?: number | null
          pain_before_0_10?: number | null
          relief_duration_min?: number | null
          relief_percent_0_100?: number | null
          side_effects_text?: string | null
        }
        Update: {
          created_at?: string
          documented_at?: string
          effect_rating_0_4?: number | null
          event_med_id?: number
          id?: number
          onset_min?: number | null
          pain_after_0_10?: number | null
          pain_before_0_10?: number | null
          relief_duration_min?: number | null
          relief_percent_0_100?: number | null
          side_effects_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "med_effects_event_med_id_fkey"
            columns: ["event_med_id"]
            isOneToOne: false
            referencedRelation: "event_meds"
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
      reminder_queue: {
        Row: {
          created_at: string
          event_med_id: number
          id: number
          reminder_type: string
          retry_count: number | null
          scheduled_for: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_med_id: number
          id?: number
          reminder_type?: string
          retry_count?: number | null
          scheduled_for: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          event_med_id?: number
          id?: number
          reminder_type?: string
          retry_count?: number | null
          scheduled_for?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_queue_event_med_id_fkey"
            columns: ["event_med_id"]
            isOneToOne: false
            referencedRelation: "event_meds"
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
      user_consents: {
        Row: {
          consent_date: string
          consent_given: boolean
          consent_type: string
          created_at: string
          id: string
          ip_address: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consent_date?: string
          consent_given?: boolean
          consent_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consent_date?: string
          consent_given?: boolean
          consent_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_medication_limits: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          limit_count: number
          medication_name: string
          period_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          limit_count: number
          medication_name: string
          period_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          limit_count?: number
          medication_name?: string
          period_type?: string
          updated_at?: string
          user_id?: string
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
          default_symptoms: string[] | null
          latitude: number | null
          longitude: number | null
          notes_layout: string | null
          quick_entry_mode: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          default_symptoms?: string[] | null
          latitude?: number | null
          longitude?: number | null
          notes_layout?: string | null
          quick_entry_mode?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          default_symptoms?: string[] | null
          latitude?: number | null
          longitude?: number | null
          notes_layout?: string | null
          quick_entry_mode?: boolean | null
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
          pressure_trend_24h: number | null
          snapshot_date: string | null
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
          pressure_trend_24h?: number | null
          snapshot_date?: string | null
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
          pressure_trend_24h?: number | null
          snapshot_date?: string | null
          temperature_c?: number | null
          user_id?: string | null
          wind_kph?: number | null
        }
        Relationships: []
      }
      weather_logs_dups_backup: {
        Row: {
          condition_icon: string | null
          condition_text: string | null
          created_at: string | null
          humidity: number | null
          id: number | null
          latitude: number | null
          location: string | null
          longitude: number | null
          moon_phase: number | null
          moonrise: number | null
          moonset: number | null
          pressure_change_24h: number | null
          pressure_mb: number | null
          snapshot_date: string | null
          temperature_c: number | null
          user_id: string | null
          wind_kph: number | null
        }
        Insert: {
          condition_icon?: string | null
          condition_text?: string | null
          created_at?: string | null
          humidity?: number | null
          id?: number | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          moon_phase?: number | null
          moonrise?: number | null
          moonset?: number | null
          pressure_change_24h?: number | null
          pressure_mb?: number | null
          snapshot_date?: string | null
          temperature_c?: number | null
          user_id?: string | null
          wind_kph?: number | null
        }
        Update: {
          condition_icon?: string | null
          condition_text?: string | null
          created_at?: string | null
          humidity?: number | null
          id?: number | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          moon_phase?: number | null
          moonrise?: number | null
          moonset?: number | null
          pressure_change_24h?: number | null
          pressure_mb?: number | null
          snapshot_date?: string | null
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
      create_quick_pain_event: {
        Args: {
          p_intensity_0_10: number
          p_medications?: Json
          p_notes?: string
        }
        Returns: number
      }
      delete_user_account: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      invoke_auto_weather: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      record_med_effect: {
        Args: {
          p_effect_rating_0_4: number
          p_event_med_id: number
          p_onset_min?: number
          p_pain_after_0_10?: number
          p_pain_before_0_10?: number
          p_relief_duration_min?: number
          p_side_effects_text?: string
        }
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
