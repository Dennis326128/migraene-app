import { Card } from "@/components/ui/card";
import { AccountDeletion } from "@/components/AccountDeletion";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { LegalLinks } from "@/components/ui/legal-links";

export const SettingsPrivacy = () => {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4">
      <Card className={cn("p-6", isMobile && "p-4")}>
        <h2 className={cn("text-lg font-medium mb-4 flex items-center gap-2", isMobile && "text-base")}>
          <Shield className="h-5 w-5" />
          Rechtliche Dokumente
        </h2>
        <p className={cn("text-sm text-muted-foreground mb-4", isMobile && "text-xs")}>
          Hier finden Sie alle rechtlichen Informationen zu dieser App.
        </p>
        
        <LegalLinks variant="buttons" />
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
