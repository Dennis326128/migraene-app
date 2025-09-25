import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOnboarding() {
  const [needsOnboarding, setNeedsOnboarding] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setNeedsOnboarding(false);
        setIsLoading(false);
        return;
      }

      // Check if user has completed onboarding by checking if they have a profile with default_symptoms
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('default_symptoms, quick_entry_mode, notes_layout')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking onboarding status:', error);
        setNeedsOnboarding(true);
      } else if (!profile || profile.default_symptoms === null) {
        // No profile or incomplete profile = needs onboarding
        setNeedsOnboarding(true);
      } else {
        // Profile exists with settings = onboarding completed
        setNeedsOnboarding(false);
      }
    } catch (error) {
      console.error('Error in onboarding check:', error);
      setNeedsOnboarding(true);
    } finally {
      setIsLoading(false);
    }
  };

  const completeOnboarding = () => {
    setNeedsOnboarding(false);
  };

  const resetOnboarding = () => {
    setNeedsOnboarding(true);
  };

  return {
    needsOnboarding,
    isLoading,
    completeOnboarding,
    resetOnboarding,
    checkOnboardingStatus
  };
}