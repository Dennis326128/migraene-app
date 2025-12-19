import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  AlertTriangle, 
  Trash2, 
  Download, 
  ShieldAlert, 
  PauseCircle,
  Calendar,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { deactivateAccount, requestAccountDeletion } from '@/features/account/api/accountStatus.api';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';

export function AccountDeletion() {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Deactivation state
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  
  // Deletion state
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [agreedToConsequences, setAgreedToConsequences] = useState(false);
  const [downloadedData, setDownloadedData] = useState(false);
  const [showDeleteSection, setShowDeleteSection] = useState(false);

  const handleExportData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch ALL user tables in parallel for complete data portability
      const [
        profile,
        painEntries,
        medications,
        medicationCourses,
        medicationLimits,
        medicationEffects,
        reminders,
        doctors,
        patientData,
        voiceNotes,
        voiceNoteSegments,
        weatherLogs,
        reportSettings,
        entrySymptoms,
        userConsents,
        userFeedback
      ] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('pain_entries').select('*').eq('user_id', user.id),
        supabase.from('user_medications').select('*').eq('user_id', user.id),
        supabase.from('medication_courses').select('*').eq('user_id', user.id),
        supabase.from('user_medication_limits').select('*').eq('user_id', user.id),
        supabase.from('medication_effects').select('*'),
        supabase.from('reminders').select('*').eq('user_id', user.id),
        supabase.from('doctors').select('*').eq('user_id', user.id),
        supabase.from('patient_data').select('*').eq('user_id', user.id).single(),
        supabase.from('voice_notes').select('*').eq('user_id', user.id),
        supabase.from('voice_note_segments').select('*'),
        supabase.from('weather_logs').select('*').eq('user_id', user.id),
        supabase.from('user_report_settings').select('*').eq('user_id', user.id).single(),
        supabase.from('entry_symptoms').select('*'),
        supabase.from('user_consents').select('*').eq('user_id', user.id),
        supabase.from('user_feedback').select('*').eq('user_id', user.id)
      ]);

      // Filter medication_effects to only include user's entries
      const userEntryIds = (painEntries.data || []).map(e => e.id);
      const userMedicationEffects = (medicationEffects.data || []).filter(
        me => userEntryIds.includes(me.entry_id)
      );

      // Filter voice_note_segments to only include user's voice notes
      const userVoiceNoteIds = (voiceNotes.data || []).map(v => v.id);
      const userVoiceNoteSegments = (voiceNoteSegments.data || []).filter(
        s => userVoiceNoteIds.includes(s.voice_note_id)
      );

      // Filter entry_symptoms to only include user's entries
      const userEntrySymptoms = (entrySymptoms.data || []).filter(
        es => userEntryIds.includes(es.entry_id)
      );

      const exportData = {
        exportDate: new Date().toISOString(),
        gdprArticle: 'Art. 20 DSGVO - Recht auf Datenübertragbarkeit',
        userId: user.id,
        email: user.email,
        profile: profile.data,
        patientData: patientData.data,
        painEntries: painEntries.data || [],
        entrySymptoms: userEntrySymptoms,
        medications: medications.data || [],
        medicationCourses: medicationCourses.data || [],
        medicationLimits: medicationLimits.data || [],
        medicationEffects: userMedicationEffects,
        reminders: reminders.data || [],
        doctors: doctors.data || [],
        voiceNotes: voiceNotes.data || [],
        voiceNoteSegments: userVoiceNoteSegments,
        weatherLogs: weatherLogs.data || [],
        reportSettings: reportSettings.data,
        consents: userConsents.data || [],
        feedback: userFeedback.data || []
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `migraine-datenexport-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadedData(true);
      toast({
        title: "Datenexport erfolgreich",
        description: "Alle Ihre Daten wurden DSGVO-konform exportiert."
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Exportfehler",
        description: "Beim Exportieren ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    }
  };

  const handleDeactivate = async () => {
    setIsDeactivating(true);
    try {
      await deactivateAccount();
      toast({
        title: "Account deaktiviert",
        description: "Ihr Account wurde pausiert. Sie können ihn jederzeit reaktivieren."
      });
      navigate('/account-status');
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Deaktivierung fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (confirmText !== 'LÖSCHEN' || !agreedToConsequences) {
      toast({
        title: "Bestätigung erforderlich",
        description: "Bitte bestätigen Sie alle Schritte.",
        variant: "destructive"
      });
      return;
    }

    setIsDeleting(true);
    try {
      const result = await requestAccountDeletion();
      const scheduledDate = new Date(result.deletion_scheduled_for);
      
      toast({
        title: "Löschung beantragt",
        description: `Ihr Account wird am ${format(scheduledDate, 'dd. MMMM yyyy', { locale: de })} gelöscht.`
      });
      navigate('/account-status');
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Löschanfrage fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const scheduledDeletionDate = format(addDays(new Date(), 30), 'dd. MMMM yyyy', { locale: de });

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-5 w-5" />
            Daten exportieren (DSGVO Art. 20)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Laden Sie alle Ihre Gesundheitsdaten als JSON-Datei herunter.
          </p>
          <Button onClick={handleExportData} variant="outline" className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Meine Daten exportieren
          </Button>
        </CardContent>
      </Card>

      {/* Deactivation Section */}
      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PauseCircle className="h-5 w-5" />
            Account deaktivieren (Pause)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Was passiert bei Deaktivierung?</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Ihre Daten bleiben vollständig erhalten</li>
                  <li>• Sie werden ausgeloggt und können sich nicht einloggen</li>
                  <li>• Jederzeit reaktivierbar durch erneuten Login</li>
                  <li>• Keine Erinnerungen oder Benachrichtigungen</li>
                </ul>
              </div>
            </div>
          </div>

          {!showDeactivateConfirm ? (
            <Button 
              onClick={() => setShowDeactivateConfirm(true)} 
              variant="outline"
              className="w-full"
            >
              <PauseCircle className="h-4 w-4 mr-2" />
              Account deaktivieren
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sind Sie sicher? Ihre Daten bleiben gespeichert.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleDeactivate}
                  disabled={isDeactivating}
                  className="flex-1"
                >
                  {isDeactivating ? "Wird deaktiviert..." : "Ja, deaktivieren"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDeactivateConfirm(false)}
                  className="flex-1"
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deletion Section */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Account & Daten endgültig löschen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showDeleteSection ? (
            <Button 
              onClick={() => setShowDeleteSection(true)} 
              variant="outline"
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Löschung beantragen
            </Button>
          ) : (
            <>
              <div className="bg-destructive/10 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="space-y-2">
                    <h3 className="font-medium text-destructive">
                      Warnung: Unwiderrufliche Löschung!
                    </h3>
                    <ul className="text-sm space-y-1">
                      <li>• Alle Gesundheitsdaten werden nach <strong>30 Tagen</strong> endgültig gelöscht</li>
                      <li>• Schmerzeinträge, Medikamente, Analysen gehen verloren</li>
                      <li>• Eine Wiederherstellung ist nicht möglich</li>
                      <li>• Geplante Löschung: <strong>{scheduledDeletionDate}</strong></li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    30-Tage-Frist
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Sie haben 30 Tage Zeit, die Löschung abzubrechen. 
                    Danach werden alle Daten unwiderruflich entfernt.
                  </p>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="consequences" 
                    checked={agreedToConsequences}
                    onCheckedChange={(checked) => setAgreedToConsequences(!!checked)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label htmlFor="consequences" className="text-sm font-medium cursor-pointer">
                      Ich verstehe, dass alle meine Gesundheitsdaten nach 30 Tagen 
                      unwiderruflich gelöscht werden
                    </label>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirm-deletion">
                    Tippen Sie <strong>"LÖSCHEN"</strong> zur Bestätigung:
                  </Label>
                  <Input
                    id="confirm-deletion"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="LÖSCHEN"
                    className="mt-2"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleRequestDeletion}
                    disabled={isDeleting || confirmText !== 'LÖSCHEN' || !agreedToConsequences}
                    variant="destructive"
                    className="flex-1"
                  >
                    {isDeleting ? "Wird beantragt..." : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Löschung beantragen
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteSection(false);
                      setConfirmText('');
                      setAgreedToConsequences(false);
                    }}
                    className="flex-1"
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1 pt-2">
                <p>
                  <strong>DSGVO-Hinweis:</strong> Die Löschung erfolgt gemäß Art. 17 DSGVO 
                  innerhalb von 30 Tagen nach Ablauf der Widerrufsfrist.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
