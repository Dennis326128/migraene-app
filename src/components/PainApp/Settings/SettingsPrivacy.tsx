import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AccountDeletion } from "@/components/AccountDeletion";
import { Shield, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { LegalLinks } from "@/components/ui/legal-links";
import { ConsentManagementSection } from "@/features/consent/components/ConsentManagementSection";
import { AIConsentToggle } from "./AIConsentToggle";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

export const SettingsPrivacy = () => {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-user-data');
      
      if (error) throw error;

      // Create and download file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dsgvo-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export erfolgreich",
        description: `${data?.export_info?.total_records || 0} Datensätze exportiert.`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export fehlgeschlagen",
        description: "Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* AI Consent Toggle - DSGVO Art. 9 */}
      <AIConsentToggle />

      {/* Consent Management - Art. 9 DSGVO */}
      <ConsentManagementSection />

      {/* Data Export - Art. 20 DSGVO */}
      <Card className={cn("p-6", isMobile && "p-4")}>
        <h2 className={cn("text-lg font-medium mb-4 flex items-center gap-2", isMobile && "text-base")}>
          <Download className="h-5 w-5" />
          Datenexport (Art. 20 DSGVO)
        </h2>
        <p className={cn("text-sm text-muted-foreground mb-4", isMobile && "text-xs")}>
          Sie haben das Recht, Ihre Daten in einem maschinenlesbaren Format zu erhalten.
          Der Export enthält alle Ihre gespeicherten Daten.
        </p>
        <Button 
          onClick={handleExportData}
          disabled={isExporting}
          variant="outline"
          className="w-full sm:w-auto"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Exportiere...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Daten exportieren (JSON)
            </>
          )}
        </Button>
      </Card>

      {/* Legal Documents */}
      <Card className={cn("p-6", isMobile && "p-4")}>
        <h2 className={cn("text-lg font-medium mb-2 flex items-center gap-2", isMobile && "text-base")}>
          <Shield className="h-5 w-5" />
          Rechtliche Dokumente
        </h2>
        <p className={cn("text-sm text-muted-foreground mb-2", isMobile && "text-xs")}>
          Alle rechtlichen Informationen zu dieser App.
        </p>

        <div className="divide-y divide-border/40">
          <LegalLinks variant="buttons" />
          <Button
            variant="ghost"
            className="w-full justify-between rounded-none h-12 px-2"
            asChild
          >
            <Link to="/medical-disclaimer">
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Medizinischer Hinweis
              </span>
            </Link>
          </Button>
        </div>
      </Card>

      {/* Account Management */}
      <Card className={cn("p-6", isMobile && "p-4")}>
        <h2 className={cn("text-lg font-medium mb-4", isMobile && "text-base")}>
          Account-Verwaltung
        </h2>
        <AccountDeletion />
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-2">
            Du möchtest dein Konto und deine Daten dauerhaft löschen?
          </p>
          <Button variant="outline" asChild className="w-full">
            <Link to="/konto-loeschen">Konto und Daten löschen</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
};
