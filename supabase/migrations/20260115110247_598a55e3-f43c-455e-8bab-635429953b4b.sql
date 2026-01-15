-- Update delete_user_account function to include all tables
CREATE OR REPLACE FUNCTION public.delete_user_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_entry_ids integer[];
  v_voice_note_ids uuid[];
  v_medication_ids uuid[];
BEGIN
  -- Verify user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Log the deletion request FIRST (for compliance)
  INSERT INTO audit_logs (user_id, action, table_name)
  VALUES (v_user_id, 'DELETE_ACCOUNT_REQUEST', 'all_user_data');

  -- Collect IDs for linked tables
  SELECT array_agg(id) INTO v_entry_ids FROM pain_entries WHERE user_id = v_user_id;
  SELECT array_agg(id) INTO v_voice_note_ids FROM voice_notes WHERE user_id = v_user_id;
  SELECT array_agg(id) INTO v_medication_ids FROM user_medications WHERE user_id = v_user_id;

  -- ========================================
  -- DELETE IN CORRECT DEPENDENCY ORDER
  -- ========================================

  -- 1. voice_note_segments (FK → voice_notes)
  IF v_voice_note_ids IS NOT NULL THEN
    DELETE FROM voice_note_segments WHERE voice_note_id = ANY(v_voice_note_ids);
  END IF;

  -- 2. medication_effects (FK → pain_entries via entry_id)
  IF v_entry_ids IS NOT NULL THEN
    DELETE FROM medication_effects WHERE entry_id = ANY(v_entry_ids);
  END IF;

  -- 3. entry_symptoms (FK → pain_entries)
  IF v_entry_ids IS NOT NULL THEN
    DELETE FROM entry_symptoms WHERE entry_id = ANY(v_entry_ids);
  END IF;

  -- 4. medication_intakes (FK → pain_entries)
  IF v_entry_ids IS NOT NULL THEN
    DELETE FROM medication_intakes WHERE entry_id = ANY(v_entry_ids);
  END IF;

  -- 5. pain_entries (has FK to voice_notes and weather_logs)
  DELETE FROM pain_entries WHERE user_id = v_user_id;

  -- 6. voice_notes (now safe to delete after pain_entries)
  DELETE FROM voice_notes WHERE user_id = v_user_id;

  -- 7. voice_entries_debug
  DELETE FROM voice_entries_debug WHERE user_id = v_user_id;

  -- 8. medication_phases (FK → user_medications)
  IF v_medication_ids IS NOT NULL THEN
    DELETE FROM medication_phases WHERE medication_id = ANY(v_medication_ids);
  END IF;

  -- 9. medication_courses (FK → user_medications optional)
  DELETE FROM medication_courses WHERE user_id = v_user_id;

  -- 10. user_medication_limits (FK → user_medications optional)
  DELETE FROM user_medication_limits WHERE user_id = v_user_id;

  -- 11. user_medications (now safe after courses, limits, phases)
  DELETE FROM user_medications WHERE user_id = v_user_id;

  -- 12. reminders
  DELETE FROM reminders WHERE user_id = v_user_id;

  -- 13. push_subscriptions
  DELETE FROM push_subscriptions WHERE user_id = v_user_id;

  -- 14. doctors
  DELETE FROM doctors WHERE user_id = v_user_id;

  -- 15. patient_data
  DELETE FROM patient_data WHERE user_id = v_user_id;

  -- 16. user_report_settings
  DELETE FROM user_report_settings WHERE user_id = v_user_id;

  -- 17. user_ai_usage
  DELETE FROM user_ai_usage WHERE user_id = v_user_id;

  -- 18. ai_reports (NEW)
  DELETE FROM ai_reports WHERE user_id = v_user_id;

  -- 19. hit6_assessments (NEW)
  DELETE FROM hit6_assessments WHERE user_id = v_user_id;

  -- 20. ai_analysis_cache (cache, can be deleted)
  DELETE FROM ai_analysis_cache WHERE user_id = v_user_id;

  -- 21. user_feedback
  DELETE FROM user_feedback WHERE user_id = v_user_id;

  -- 22. user_consents
  DELETE FROM user_consents WHERE user_id = v_user_id;

  -- 23. weather_logs
  DELETE FROM weather_logs WHERE user_id = v_user_id;

  -- 24. user_profiles (last, as it's the main profile)
  DELETE FROM user_profiles WHERE user_id = v_user_id;

  -- Final audit log (kept for 30-day compliance record)
  INSERT INTO audit_logs (user_id, action, table_name, old_data)
  VALUES (
    v_user_id, 
    'DELETE_ACCOUNT_COMPLETED', 
    'all_user_data',
    jsonb_build_object(
      'deleted_at', now(),
      'tables_cleaned', ARRAY[
        'voice_note_segments', 'medication_effects', 'entry_symptoms',
        'medication_intakes', 'pain_entries', 'voice_notes', 'voice_entries_debug',
        'medication_phases', 'medication_courses', 'user_medication_limits', 
        'user_medications', 'reminders', 'push_subscriptions', 'doctors', 
        'patient_data', 'user_report_settings', 'user_ai_usage', 'ai_reports',
        'hit6_assessments', 'ai_analysis_cache', 'user_feedback',
        'user_consents', 'weather_logs', 'user_profiles'
      ]
    )
  );

END;
$function$;