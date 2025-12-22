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
      doctors: {
        Row: {
          city: string | null
          created_at: string | null
          email: string | null
          fax: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          postal_code: string | null
          salutation: string | null
          specialty: string | null
          street: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          email?: string | null
          fax?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          postal_code?: string | null
          salutation?: string | null
          specialty?: string | null
          street?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string | null
          email?: string | null
          fax?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          postal_code?: string | null
          salutation?: string | null
          specialty?: string | null
          street?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
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
      hit6_assessments: {
        Row: {
          answers: Json
          created_at: string
          id: string
          pdf_last_generated_at: string | null
          period_end_date: string
          period_start_date: string
          score: number
          user_id: string
        }
        Insert: {
          answers: Json
          created_at?: string
          id?: string
          pdf_last_generated_at?: string | null
          period_end_date?: string
          period_start_date?: string
          score: number
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          pdf_last_generated_at?: string | null
          period_end_date?: string
          period_start_date?: string
          score?: number
          user_id?: string
        }
        Relationships: []
      }
      medication_courses: {
        Row: {
          baseline_acute_med_days: string | null
          baseline_impairment_level: string | null
          baseline_migraine_days: string | null
          baseline_triptan_doses_per_month: number | null
          created_at: string
          discontinuation_details: string | null
          discontinuation_reason: string | null
          dose_text: string | null
          end_date: string | null
          had_side_effects: boolean | null
          id: string
          is_active: boolean
          medication_id: string | null
          medication_name: string
          note_for_physician: string | null
          side_effects_text: string | null
          start_date: string | null
          subjective_effectiveness: number | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_acute_med_days?: string | null
          baseline_impairment_level?: string | null
          baseline_migraine_days?: string | null
          baseline_triptan_doses_per_month?: number | null
          created_at?: string
          discontinuation_details?: string | null
          discontinuation_reason?: string | null
          dose_text?: string | null
          end_date?: string | null
          had_side_effects?: boolean | null
          id?: string
          is_active?: boolean
          medication_id?: string | null
          medication_name: string
          note_for_physician?: string | null
          side_effects_text?: string | null
          start_date?: string | null
          subjective_effectiveness?: number | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_acute_med_days?: string | null
          baseline_impairment_level?: string | null
          baseline_migraine_days?: string | null
          baseline_triptan_doses_per_month?: number | null
          created_at?: string
          discontinuation_details?: string | null
          discontinuation_reason?: string | null
          dose_text?: string | null
          end_date?: string | null
          had_side_effects?: boolean | null
          id?: string
          is_active?: boolean
          medication_id?: string | null
          medication_name?: string
          note_for_physician?: string | null
          side_effects_text?: string | null
          start_date?: string | null
          subjective_effectiveness?: number | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_courses_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "user_medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_effects: {
        Row: {
          confidence: string | null
          created_at: string
          effect_rating: string
          effect_score: number | null
          entry_id: number
          id: string
          med_name: string
          medication_id: string | null
          method: string | null
          notes: string | null
          side_effects: string[] | null
          updated_at: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          effect_rating: string
          effect_score?: number | null
          entry_id: number
          id?: string
          med_name: string
          medication_id?: string | null
          method?: string | null
          notes?: string | null
          side_effects?: string[] | null
          updated_at?: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          effect_rating?: string
          effect_score?: number | null
          entry_id?: number
          id?: string
          med_name?: string
          medication_id?: string | null
          method?: string | null
          notes?: string | null
          side_effects?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_effects_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "user_medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_intakes: {
        Row: {
          created_at: string
          dose_quarters: number
          entry_id: number
          id: string
          medication_id: string | null
          medication_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dose_quarters?: number
          entry_id: number
          id?: string
          medication_id?: string | null
          medication_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dose_quarters?: number
          entry_id?: number
          id?: string
          medication_id?: string | null
          medication_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_intakes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "pain_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_intakes_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "user_medications"
            referencedColumns: ["id"]
          },
        ]
      }
      pain_entries: {
        Row: {
          aura_type: string
          id: number
          latitude: number | null
          longitude: number | null
          medication_ids: string[] | null
          medications: string[] | null
          notes: string | null
          pain_level: string
          pain_location: string | null
          selected_date: string | null
          selected_time: string | null
          timestamp_created: string | null
          user_id: string
          voice_note_id: string | null
          weather_id: number | null
        }
        Insert: {
          aura_type?: string
          id?: number
          latitude?: number | null
          longitude?: number | null
          medication_ids?: string[] | null
          medications?: string[] | null
          notes?: string | null
          pain_level: string
          pain_location?: string | null
          selected_date?: string | null
          selected_time?: string | null
          timestamp_created?: string | null
          user_id: string
          voice_note_id?: string | null
          weather_id?: number | null
        }
        Update: {
          aura_type?: string
          id?: number
          latitude?: number | null
          longitude?: number | null
          medication_ids?: string[] | null
          medications?: string[] | null
          notes?: string | null
          pain_level?: string
          pain_location?: string | null
          selected_date?: string | null
          selected_time?: string | null
          timestamp_created?: string | null
          user_id?: string
          voice_note_id?: string | null
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
            foreignKeyName: "pain_entries_voice_note_id_fkey"
            columns: ["voice_note_id"]
            isOneToOne: false
            referencedRelation: "voice_notes"
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
      patient_data: {
        Row: {
          city: string | null
          created_at: string | null
          date_of_birth: string | null
          fax: string | null
          first_name: string | null
          health_insurance: string | null
          id: string
          insurance_number: string | null
          last_name: string | null
          phone: string | null
          postal_code: string | null
          salutation: string | null
          street: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          fax?: string | null
          first_name?: string | null
          health_insurance?: string | null
          id?: string
          insurance_number?: string | null
          last_name?: string | null
          phone?: string | null
          postal_code?: string | null
          salutation?: string | null
          street?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          fax?: string | null
          first_name?: string | null
          health_insurance?: string | null
          id?: string
          insurance_number?: string | null
          last_name?: string | null
          phone?: string | null
          postal_code?: string | null
          salutation?: string | null
          street?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          date_time: string
          follow_up_enabled: boolean
          follow_up_interval_unit: string | null
          follow_up_interval_value: number | null
          id: string
          last_popup_date: string | null
          medication_id: string | null
          medications: string[] | null
          next_follow_up_date: string | null
          notes: string | null
          notification_enabled: boolean
          notify_offsets_minutes: number[] | null
          repeat: string
          series_id: string | null
          snooze_count: number | null
          snoozed_until: string | null
          status: string
          time_of_day: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_time: string
          follow_up_enabled?: boolean
          follow_up_interval_unit?: string | null
          follow_up_interval_value?: number | null
          id?: string
          last_popup_date?: string | null
          medication_id?: string | null
          medications?: string[] | null
          next_follow_up_date?: string | null
          notes?: string | null
          notification_enabled?: boolean
          notify_offsets_minutes?: number[] | null
          repeat?: string
          series_id?: string | null
          snooze_count?: number | null
          snoozed_until?: string | null
          status?: string
          time_of_day?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_time?: string
          follow_up_enabled?: boolean
          follow_up_interval_unit?: string | null
          follow_up_interval_value?: number | null
          id?: string
          last_popup_date?: string | null
          medication_id?: string | null
          medications?: string[] | null
          next_follow_up_date?: string | null
          notes?: string | null
          notification_enabled?: boolean
          notify_offsets_minutes?: number[] | null
          repeat?: string
          series_id?: string | null
          snooze_count?: number | null
          snoozed_until?: string | null
          status?: string
          time_of_day?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "user_medications"
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
      user_ai_usage: {
        Row: {
          created_at: string | null
          feature: string
          id: string
          period_start: string | null
          request_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feature: string
          id?: string
          period_start?: string | null
          request_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          feature?: string
          id?: string
          period_start?: string | null
          request_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          consent_withdrawn_at: string | null
          created_at: string
          health_data_consent: boolean | null
          health_data_consent_at: string | null
          health_data_consent_version: string | null
          id: string
          ip_address: unknown
          medical_disclaimer_accepted_at: string | null
          privacy_accepted_at: string
          privacy_version: string
          terms_accepted_at: string
          terms_version: string
          user_agent: string | null
          user_id: string
          withdrawal_reason: string | null
        }
        Insert: {
          consent_withdrawn_at?: string | null
          created_at?: string
          health_data_consent?: boolean | null
          health_data_consent_at?: string | null
          health_data_consent_version?: string | null
          id?: string
          ip_address?: unknown
          medical_disclaimer_accepted_at?: string | null
          privacy_accepted_at?: string
          privacy_version?: string
          terms_accepted_at?: string
          terms_version?: string
          user_agent?: string | null
          user_id: string
          withdrawal_reason?: string | null
        }
        Update: {
          consent_withdrawn_at?: string | null
          created_at?: string
          health_data_consent?: boolean | null
          health_data_consent_at?: string | null
          health_data_consent_version?: string | null
          id?: string
          ip_address?: unknown
          medical_disclaimer_accepted_at?: string | null
          privacy_accepted_at?: string
          privacy_version?: string
          terms_accepted_at?: string
          terms_version?: string
          user_agent?: string | null
          user_id?: string
          withdrawal_reason?: string | null
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          app_version: string | null
          build: string | null
          category: string | null
          contact_email: string | null
          created_at: string
          extra: Json | null
          id: string
          include_tech_info: boolean
          locale: string | null
          message: string | null
          platform: string | null
          route: string | null
          screen: Json | null
          severity: string | null
          timezone: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          build?: string | null
          category?: string | null
          contact_email?: string | null
          created_at?: string
          extra?: Json | null
          id?: string
          include_tech_info?: boolean
          locale?: string | null
          message?: string | null
          platform?: string | null
          route?: string | null
          screen?: Json | null
          severity?: string | null
          timezone?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          build?: string | null
          category?: string | null
          contact_email?: string | null
          created_at?: string
          extra?: Json | null
          id?: string
          include_tech_info?: boolean
          locale?: string | null
          message?: string | null
          platform?: string | null
          route?: string | null
          screen?: Json | null
          severity?: string | null
          timezone?: string | null
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
          medication_id: string | null
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
          medication_id?: string | null
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
          medication_id?: string | null
          medication_name?: string
          period_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_medication_limits_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "user_medications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_medications: {
        Row: {
          anwendungsgebiet: string | null
          art: string | null
          as_needed_max_days_per_month: number | null
          as_needed_max_per_24h: number | null
          as_needed_min_interval_hours: number | null
          as_needed_notes: string | null
          as_needed_standard_dose: string | null
          created_at: string | null
          darreichungsform: string | null
          discontinued_at: string | null
          dosis_abends: string | null
          dosis_bedarf: string | null
          dosis_mittags: string | null
          dosis_morgens: string | null
          dosis_nacht: string | null
          effect_category: string | null
          einheit: string | null
          end_date: string | null
          hinweise: string | null
          id: string
          intake_type: string | null
          intolerance_flag: boolean | null
          intolerance_notes: string | null
          intolerance_reason_type: string | null
          is_active: boolean | null
          medication_status: string | null
          name: string
          raw_input: string | null
          regular_notes: string | null
          regular_weekdays: string[] | null
          staerke: string | null
          start_date: string | null
          strength_unit: string | null
          strength_value: string | null
          typical_indication: string | null
          user_id: string
          wirkstoff: string | null
        }
        Insert: {
          anwendungsgebiet?: string | null
          art?: string | null
          as_needed_max_days_per_month?: number | null
          as_needed_max_per_24h?: number | null
          as_needed_min_interval_hours?: number | null
          as_needed_notes?: string | null
          as_needed_standard_dose?: string | null
          created_at?: string | null
          darreichungsform?: string | null
          discontinued_at?: string | null
          dosis_abends?: string | null
          dosis_bedarf?: string | null
          dosis_mittags?: string | null
          dosis_morgens?: string | null
          dosis_nacht?: string | null
          effect_category?: string | null
          einheit?: string | null
          end_date?: string | null
          hinweise?: string | null
          id?: string
          intake_type?: string | null
          intolerance_flag?: boolean | null
          intolerance_notes?: string | null
          intolerance_reason_type?: string | null
          is_active?: boolean | null
          medication_status?: string | null
          name: string
          raw_input?: string | null
          regular_notes?: string | null
          regular_weekdays?: string[] | null
          staerke?: string | null
          start_date?: string | null
          strength_unit?: string | null
          strength_value?: string | null
          typical_indication?: string | null
          user_id: string
          wirkstoff?: string | null
        }
        Update: {
          anwendungsgebiet?: string | null
          art?: string | null
          as_needed_max_days_per_month?: number | null
          as_needed_max_per_24h?: number | null
          as_needed_min_interval_hours?: number | null
          as_needed_notes?: string | null
          as_needed_standard_dose?: string | null
          created_at?: string | null
          darreichungsform?: string | null
          discontinued_at?: string | null
          dosis_abends?: string | null
          dosis_bedarf?: string | null
          dosis_mittags?: string | null
          dosis_morgens?: string | null
          dosis_nacht?: string | null
          effect_category?: string | null
          einheit?: string | null
          end_date?: string | null
          hinweise?: string | null
          id?: string
          intake_type?: string | null
          intolerance_flag?: boolean | null
          intolerance_notes?: string | null
          intolerance_reason_type?: string | null
          is_active?: boolean | null
          medication_status?: string | null
          name?: string
          raw_input?: string | null
          regular_notes?: string | null
          regular_weekdays?: string[] | null
          staerke?: string | null
          start_date?: string | null
          strength_unit?: string | null
          strength_value?: string | null
          typical_indication?: string | null
          user_id?: string
          wirkstoff?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          account_status: string
          ai_draft_engine: string | null
          ai_enabled: boolean
          custom_medication_reasons: string[] | null
          deactivated_at: string | null
          default_pain_location: string | null
          default_symptoms: string[] | null
          deletion_requested_at: string | null
          deletion_scheduled_for: string | null
          latitude: number | null
          longitude: number | null
          medication_limit_warning_threshold_pct: number
          notes_layout: string | null
          quick_entry_mode: boolean | null
          track_cycle: boolean | null
          tutorial_completed: boolean | null
          tutorial_completed_at: string | null
          updated_at: string | null
          user_id: string
          voice_notes_enabled: boolean
        }
        Insert: {
          account_status?: string
          ai_draft_engine?: string | null
          ai_enabled?: boolean
          custom_medication_reasons?: string[] | null
          deactivated_at?: string | null
          default_pain_location?: string | null
          default_symptoms?: string[] | null
          deletion_requested_at?: string | null
          deletion_scheduled_for?: string | null
          latitude?: number | null
          longitude?: number | null
          medication_limit_warning_threshold_pct?: number
          notes_layout?: string | null
          quick_entry_mode?: boolean | null
          track_cycle?: boolean | null
          tutorial_completed?: boolean | null
          tutorial_completed_at?: string | null
          updated_at?: string | null
          user_id: string
          voice_notes_enabled?: boolean
        }
        Update: {
          account_status?: string
          ai_draft_engine?: string | null
          ai_enabled?: boolean
          custom_medication_reasons?: string[] | null
          deactivated_at?: string | null
          default_pain_location?: string | null
          default_symptoms?: string[] | null
          deletion_requested_at?: string | null
          deletion_scheduled_for?: string | null
          latitude?: number | null
          longitude?: number | null
          medication_limit_warning_threshold_pct?: number
          notes_layout?: string | null
          quick_entry_mode?: boolean | null
          track_cycle?: boolean | null
          tutorial_completed?: boolean | null
          tutorial_completed_at?: string | null
          updated_at?: string | null
          user_id?: string
          voice_notes_enabled?: boolean
        }
        Relationships: []
      }
      user_report_settings: {
        Row: {
          created_at: string | null
          default_report_preset: string
          include_ai_analysis: boolean | null
          include_all_medications: boolean | null
          include_chart: boolean | null
          include_doctor_data: boolean | null
          include_entries_list: boolean | null
          include_medication_summary: boolean | null
          include_patient_data: boolean | null
          include_statistics: boolean | null
          last_doctor_export_ids: string[] | null
          last_include_doctors_flag: boolean | null
          selected_medications: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          default_report_preset?: string
          include_ai_analysis?: boolean | null
          include_all_medications?: boolean | null
          include_chart?: boolean | null
          include_doctor_data?: boolean | null
          include_entries_list?: boolean | null
          include_medication_summary?: boolean | null
          include_patient_data?: boolean | null
          include_statistics?: boolean | null
          last_doctor_export_ids?: string[] | null
          last_include_doctors_flag?: boolean | null
          selected_medications?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          default_report_preset?: string
          include_ai_analysis?: boolean | null
          include_all_medications?: boolean | null
          include_chart?: boolean | null
          include_doctor_data?: boolean | null
          include_entries_list?: boolean | null
          include_medication_summary?: boolean | null
          include_patient_data?: boolean | null
          include_statistics?: boolean | null
          last_doctor_export_ids?: string[] | null
          last_include_doctors_flag?: boolean | null
          selected_medications?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      voice_entries_debug: {
        Row: {
          confidence_scores: Json | null
          created_at: string | null
          id: string
          missing_fields: string[] | null
          parsed_json: Json | null
          source_text: string
          user_id: string
        }
        Insert: {
          confidence_scores?: Json | null
          created_at?: string | null
          id?: string
          missing_fields?: string[] | null
          parsed_json?: Json | null
          source_text: string
          user_id: string
        }
        Update: {
          confidence_scores?: Json | null
          created_at?: string | null
          id?: string
          missing_fields?: string[] | null
          parsed_json?: Json | null
          source_text?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_note_segments: {
        Row: {
          confidence: number | null
          created_at: string
          effect_rating: string | null
          factor_type: string | null
          factor_value: string | null
          id: string
          is_ambiguous: boolean | null
          medication_dose: string | null
          medication_name: string | null
          medication_role: string | null
          normalized_summary: string | null
          segment_index: number
          segment_type: string
          source_text: string
          time_reference: string | null
          timing_relation: string | null
          voice_note_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          effect_rating?: string | null
          factor_type?: string | null
          factor_value?: string | null
          id?: string
          is_ambiguous?: boolean | null
          medication_dose?: string | null
          medication_name?: string | null
          medication_role?: string | null
          normalized_summary?: string | null
          segment_index: number
          segment_type?: string
          source_text: string
          time_reference?: string | null
          timing_relation?: string | null
          voice_note_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          effect_rating?: string | null
          factor_type?: string | null
          factor_value?: string | null
          id?: string
          is_ambiguous?: boolean | null
          medication_dose?: string | null
          medication_name?: string | null
          medication_role?: string | null
          normalized_summary?: string | null
          segment_index?: number
          segment_type?: string
          source_text?: string
          time_reference?: string | null
          timing_relation?: string | null
          voice_note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_note_segments_voice_note_id_fkey"
            columns: ["voice_note_id"]
            isOneToOne: false
            referencedRelation: "voice_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_notes: {
        Row: {
          captured_at: string
          context_type: string | null
          deleted_at: string | null
          extracted_facts: Json | null
          id: string
          metadata: Json | null
          nlp_processed_at: string | null
          nlp_status: string | null
          nlp_version: string | null
          occurred_at: string
          source: string
          stt_confidence: number | null
          text: string
          text_fts: unknown
          tz: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          context_type?: string | null
          deleted_at?: string | null
          extracted_facts?: Json | null
          id?: string
          metadata?: Json | null
          nlp_processed_at?: string | null
          nlp_status?: string | null
          nlp_version?: string | null
          occurred_at: string
          source?: string
          stt_confidence?: number | null
          text: string
          text_fts?: unknown
          tz?: string
          user_id: string
        }
        Update: {
          captured_at?: string
          context_type?: string | null
          deleted_at?: string | null
          extracted_facts?: Json | null
          id?: string
          metadata?: Json | null
          nlp_processed_at?: string | null
          nlp_status?: string | null
          nlp_version?: string | null
          occurred_at?: string
          source?: string
          stt_confidence?: number | null
          text?: string
          text_fts?: unknown
          tz?: string
          user_id?: string
        }
        Relationships: []
      }
      weather_logs: {
        Row: {
          condition_icon: string | null
          condition_text: string | null
          created_at: string | null
          dewpoint_c: number | null
          humidity: number | null
          id: number
          lat_rounded: number | null
          latitude: number
          location: string | null
          lon_rounded: number | null
          longitude: number
          moon_phase: number | null
          moonrise: number | null
          moonset: number | null
          pressure_change_24h: number | null
          pressure_mb: number | null
          pressure_trend_24h: number | null
          requested_at: string | null
          snapshot_date: string | null
          temperature_c: number | null
          user_id: string
          wind_kph: number | null
        }
        Insert: {
          condition_icon?: string | null
          condition_text?: string | null
          created_at?: string | null
          dewpoint_c?: number | null
          humidity?: number | null
          id?: number
          lat_rounded?: number | null
          latitude: number
          location?: string | null
          lon_rounded?: number | null
          longitude: number
          moon_phase?: number | null
          moonrise?: number | null
          moonset?: number | null
          pressure_change_24h?: number | null
          pressure_mb?: number | null
          pressure_trend_24h?: number | null
          requested_at?: string | null
          snapshot_date?: string | null
          temperature_c?: number | null
          user_id: string
          wind_kph?: number | null
        }
        Update: {
          condition_icon?: string | null
          condition_text?: string | null
          created_at?: string | null
          dewpoint_c?: number | null
          humidity?: number | null
          id?: number
          lat_rounded?: number | null
          latitude?: number
          location?: string | null
          lon_rounded?: number | null
          longitude?: number
          moon_phase?: number | null
          moonrise?: number | null
          moonset?: number | null
          pressure_change_24h?: number | null
          pressure_mb?: number | null
          pressure_trend_24h?: number | null
          requested_at?: string | null
          snapshot_date?: string | null
          temperature_c?: number | null
          user_id?: string
          wind_kph?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_account_deletion: { Args: never; Returns: undefined }
      deactivate_user_account: { Args: never; Returns: undefined }
      delete_user_account: { Args: never; Returns: undefined }
      get_account_status: { Args: never; Returns: Json }
      get_recent_medications: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          id: string
          last_used: string
          name: string
          use_count: number
        }[]
      }
      reactivate_user_account: { Args: never; Returns: undefined }
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
      request_account_deletion: { Args: never; Returns: Json }
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
          latitude: number | null
          longitude: number | null
          medication_ids: string[] | null
          medications: string[] | null
          notes: string | null
          pain_level: string
          pain_location: string | null
          selected_date: string | null
          selected_time: string | null
          timestamp_created: string | null
          user_id: string
          voice_note_id: string | null
          weather_id: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pain_entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_migraine_stats:
        | {
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
        | {
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
