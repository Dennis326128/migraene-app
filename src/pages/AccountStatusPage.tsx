import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  AlertTriangle, 
  PauseCircle, 
  Trash2, 
  RefreshCw, 
  XCircle,
  Calendar,
  LogOut
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  getAccountStatus, 
  reactivateAccount, 
  cancelAccountDeletion,
  AccountStatus 
} from "@/features/account/api/accountStatus.api";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function AccountStatusPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const accountStatus = await getAccountStatus();
      setStatus(accountStatus);
      
      // If account is active, redirect to main app
      if (accountStatus.status === 'active') {
        navigate('/');
      }
    } catch (error) {
      console.error('Error loading status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await reactivateAccount();
      toast({
        title: "Account reaktiviert",
        description: "Willkommen zurück! Ihr Account ist wieder aktiv."
      });
      navigate('/');
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Reaktivierung fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelDeletion = async () => {
    setActionLoading(true);
    try {
      await cancelAccountDeletion();
      toast({
        title: "Löschung abgebrochen",
        description: "Ihr Account wird nicht mehr gelöscht."
      });
      navigate('/');
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Abbruch fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (status?.status === 'deactivated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <PauseCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Account deaktiviert</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground">
              Ihr Account ist derzeit pausiert. Alle Ihre Daten sind sicher gespeichert 
              und warten auf Ihre Rückkehr.
            </p>
            
            {status.deactivated_at && (
              <p className="text-center text-sm text-muted-foreground">
                Deaktiviert am: {format(new Date(status.deactivated_at), 'dd. MMMM yyyy', { locale: de })}
              </p>
            )}

            <div className="space-y-2 pt-4">
              <Button 
                onClick={handleReactivate} 
                className="w-full"
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Account reaktivieren
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleLogout}
                className="w-full"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Abmelden
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status?.status === 'deletion_requested') {
    const scheduledDate = status.deletion_scheduled_for 
      ? new Date(status.deletion_scheduled_for)
      : null;
    const daysRemaining = scheduledDate 
      ? Math.ceil((scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-destructive/50">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <Trash2 className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl text-destructive">
              Account-Löschung beantragt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ihr Account und alle Gesundheitsdaten werden in{' '}
                <strong>{daysRemaining} Tagen</strong> endgültig gelöscht.
              </AlertDescription>
            </Alert>

            {scheduledDate && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  Geplante Löschung: {format(scheduledDate, 'dd. MMMM yyyy', { locale: de })}
                </span>
              </div>
            )}

            <p className="text-center text-sm text-muted-foreground">
              Sie können die Löschung noch abbrechen und Ihren Account behalten.
            </p>

            <div className="space-y-2 pt-4">
              <Button 
                onClick={handleCancelDeletion}
                className="w-full"
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Löschung abbrechen & Account behalten
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleLogout}
                className="w-full"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Abmelden
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground pt-4">
              Nach Ablauf der Frist werden alle Daten unwiderruflich gelöscht. 
              Bitte exportieren Sie Ihre Daten vorher, falls gewünscht.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback - redirect to auth
  navigate('/auth');
  return null;
}
