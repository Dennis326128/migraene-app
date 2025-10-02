import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CloudSun, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const WeatherImportButton = () => {
  const [isImporting, setIsImporting] = useState(false);
  const queryClient = useQueryClient();

  const checkMissingData = async (): Promise<number> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count, error } = await supabase
      .from("pain_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("weather_id", null)
      .gte("timestamp_created", thirtyDaysAgo.toISOString());

    if (error) throw error;
    return count || 0;
  };

  const { data: missingCount = 0, refetch } = useQuery({
    queryKey: ["missing-weather"],
    queryFn: checkMissingData,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetch]);

  const handleImport = async () => {
    setIsImporting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('batch-weather-import', {
        body: {}
      });

      if (error) throw error;

      if (data.successCount > 0) {
        toast.success("Wetterdaten erfolgreich ergänzt");
        queryClient.invalidateQueries({ queryKey: ["missing-weather"] });
      } else {
        toast.error("Fehler beim Import");
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Fehler beim Import");
    } finally {
      setIsImporting(false);
    }
  };

  if (missingCount === 0) return null;

  return (
    <Button 
      onClick={handleImport}
      disabled={isImporting}
      size="sm"
      variant="outline"
      className="w-full"
    >
      {isImporting ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Wetterdaten werden importiert...
        </>
      ) : (
        <>
          <CloudSun className="w-4 h-4 mr-2" />
          Fehlende Wetterdaten ergänzen ({missingCount} {missingCount === 1 ? 'Eintrag' : 'Einträge'})
        </>
      )}
    </Button>
  );
};