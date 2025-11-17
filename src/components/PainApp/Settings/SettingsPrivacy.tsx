import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AccountDeletion } from "@/components/AccountDeletion";
import { ExternalLink, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export const SettingsPrivacy = () => {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4">
      <Card className={cn("p-6", isMobile && "p-4")}>
        <h2 className={cn("text-lg font-medium mb-4 flex items-center gap-2", isMobile && "text-base")}>
          <Shield className="h-5 w-5" />
          Datenschutz
        </h2>
        <p className={cn("text-sm text-muted-foreground mb-4", isMobile && "text-xs")}>
          Informationen zum Datenschutz und zur Datensicherheit.
        </p>
        
        <Button
          variant="outline"
          className="w-full justify-between"
          size={isMobile ? "sm" : "default"}
          onClick={() => window.open('/privacy', '_blank')}
        >
          <span>Datenschutzerklärung öffnen</span>
          <ExternalLink className="h-4 w-4" />
        </Button>
      </Card>

      <Card className={cn("p-6", isMobile && "p-4")}>
        <h2 className={cn("text-lg font-medium mb-4", isMobile && "text-base")}>
          Account-Verwaltung
        </h2>
        <AccountDeletion />
      </Card>
    </div>
  );
};
