import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export const SettingsAdvanced = () => {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4">
      <Card className={cn("p-6", isMobile && "p-4")}>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className={cn(isMobile && "text-xs")}>
            <strong>Automatische Wetterdaten:</strong> Die App ergänzt fehlende Wetterdaten automatisch im Hintergrund für deine Einträge der letzten 7 Tage.
          </AlertDescription>
        </Alert>
      </Card>
    </div>
  );
};
