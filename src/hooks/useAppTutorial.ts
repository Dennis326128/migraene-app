import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useAppTutorial() {
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialCompleted, setTutorialCompleted] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkTutorialStatus();
  }, []);

  const checkTutorialStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setTutorialCompleted(true);
        setIsLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('tutorial_completed')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking tutorial status:', error);
        setTutorialCompleted(true);
      } else if (!profile || !profile.tutorial_completed) {
        setTutorialCompleted(false);
      } else {
        setTutorialCompleted(true);
      }
    } catch (error) {
      console.error('Error in tutorial check:', error);
      setTutorialCompleted(true);
    } finally {
      setIsLoading(false);
    }
  };

  const completeTutorial = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_profiles')
        .update({
          tutorial_completed: true,
          tutorial_completed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) {
        console.error('Error completing tutorial:', error);
      } else {
        setTutorialCompleted(true);
        setShowTutorial(false);
      }
    } catch (error) {
      console.error('Error in completeTutorial:', error);
    }
  };

  const resetTutorial = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_profiles')
        .update({
          tutorial_completed: false,
          tutorial_completed_at: null,
        })
        .eq('user_id', user.id);

      if (error) {
        console.error('Error resetting tutorial:', error);
      } else {
        setTutorialCompleted(false);
        setShowTutorial(true);
      }
    } catch (error) {
      console.error('Error in resetTutorial:', error);
    }
  };

  const startTutorial = () => {
    setShowTutorial(true);
  };

  return {
    showTutorial,
    tutorialCompleted,
    isLoading,
    completeTutorial,
    resetTutorial,
    startTutorial,
    setShowTutorial,
  };
}
