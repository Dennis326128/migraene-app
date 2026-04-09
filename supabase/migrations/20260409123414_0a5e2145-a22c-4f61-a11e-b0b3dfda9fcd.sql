
-- Add voice_events deletion to delete_user_account function
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  INSERT INTO audit_logs (user_id, action, table_name)
  VALUES (v_user_id, 'DELETE_ACCOUNT_REQUEST', 'all_user_data');

  SELECT array_agg(id) INTO v_entry_ids FROM pain_entries WHERE user_id = v_user_id;
  SELECT array_agg(id) INTO v_voice_note_ids FROM voice_notes WHERE user_id = v_user_id;
  SELECT array_agg(id) INTO v_medication_ids FROM user_medications WHERE user_id = v_user_id;

  -- 1. voice_note_segments
  IF v_voice_note_ids IS NOT NULL THEN
    DELETE FROM voice_note_segments WHERE voice_note_id = ANY(v_voice_note_ids);
  END IF;

  -- 2. medication_effects
  IF v_entry_ids IS NOT NULL THEN
    DELETE FROM medication_effects WHERE entry_id = ANY(v_entry_ids);
  END IF;

  -- 3. entry_symptoms
  IF v_entry_ids IS NOT NULL THEN
    DELETE FROM entry_symptoms WHERE entry_id = ANY(v_entry_ids);
  END IF;

  -- 4. medication_intakes
  IF v_entry_ids IS NOT NULL THEN
    DELETE FROM medication_intakes WHERE entry_id = ANY(v_entry_ids);
  END IF;

  -- 5. pain_entries
  DELETE FROM pain_entries WHERE user_id = v_user_id;

  -- 6. voice_notes
  DELETE FROM voice_notes WHERE user_id = v_user_id;

  -- 7. voice_entries_debug
  DELETE FROM voice_entries_debug WHERE user_id = v_user_id;

  -- 7b. voice_events (NEW - capture-first voice data)
  DELETE FROM voice_events WHERE user_id = v_user_id;

  -- 8. medication_phases
  IF v_medication_ids IS NOT NULL THEN
    DELETE FROM medication_phases WHERE medication_id = ANY(v_medication_ids);
  END IF;

  -- 9. medication_courses
  DELETE FROM medication_courses WHERE user_id = v_user_id;

  -- 10. user_medication_limits
  DELETE FROM user_medication_limits WHERE user_id = v_user_id;

  -- 11. user_medications
  DELETE FROM user_medications WHERE user_id = v_user_id;

  -- 12. reminders + completions
  DELETE FROM reminder_completions WHERE user_id = v_user_id;
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

  -- 18. ai_reports
  DELETE FROM ai_reports WHERE user_id = v_user_id;

  -- 19. hit6_assessments
  DELETE FROM hit6_assessments WHERE user_id = v_user_id;

  -- 20. ai_analysis_cache
  DELETE FROM ai_analysis_cache WHERE user_id = v_user_id;

  -- 21. user_feedback
  DELETE FROM user_feedback WHERE user_id = v_user_id;

  -- 22. user_consents
  DELETE FROM user_consents WHERE user_id = v_user_id;

  -- 23. weather_logs
  DELETE FROM weather_logs WHERE user_id = v_user_id;

  -- 24. user_symptom_burden
  DELETE FROM user_symptom_burden WHERE user_id = v_user_id;

  -- 25. user_settings
  DELETE FROM user_settings WHERE user_id = v_user_id;

  -- 26. daily_impact_assessments
  DELETE FROM daily_impact_assessments WHERE user_id = v_user_id;

  -- 27. user_profiles (last)
  DELETE FROM user_profiles WHERE user_id = v_user_id;

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
        'voice_events',
        'medication_phases', 'medication_courses', 'user_medication_limits', 
        'user_medications', 'reminder_completions', 'reminders', 'push_subscriptions',
        'doctors', 'patient_data', 'user_report_settings', 'user_ai_usage', 'ai_reports',
        'hit6_assessments', 'ai_analysis_cache', 'user_feedback',
        'user_consents', 'weather_logs', 'user_symptom_burden', 'user_settings',
        'daily_impact_assessments', 'user_profiles'
      ]
    )
  );
END;
$function$;
