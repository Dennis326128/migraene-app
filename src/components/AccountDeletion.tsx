import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Trash2, Download, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

export function AccountDeletion() {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [agreedToConsequences, setAgreedToConsequences] = useState(false);
  const [downloadedData, setDownloadedData] = useState(false);

  const handleExportData = async () => {
    try {
      // Get all user data for GDPR-compliant export (Art. 20 DSGVO)
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
        
        // Core profile data
        profile: profile.data,
        patientData: patientData.data,
        
        // Health data
        painEntries: painEntries.data || [],
        entrySymptoms: userEntrySymptoms,
        
        // Medication data
        medications: medications.data || [],
        medicationCourses: medicationCourses.data || [],
        medicationLimits: medicationLimits.data || [],
        medicationEffects: userMedicationEffects,
        
        // Reminders & Doctors
        reminders: reminders.data || [],
        doctors: doctors.data || [],
        
        // Voice notes
        voiceNotes: voiceNotes.data || [],
        voiceNoteSegments: userVoiceNoteSegments,
        
        // Weather & Settings
        weatherLogs: weatherLogs.data || [],
        reportSettings: reportSettings.data,
        
        // Consent records
        consents: userConsents.data || [],
        feedback: userFeedback.data || []
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `migraine-vollstaendiger-datenexport-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadedData(true);
      toast({
        title: "Vollständiger Datenexport",
        description: "Alle Ihre Daten wurden DSGVO-konform als JSON exportiert."
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Exportfehler",
        description: "Beim Exportieren der Daten ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== 'ACCOUNT LÖSCHEN' || !agreedToConsequences) {
      toast({
        title: "Bestätigung erforderlich",
        description: "Bitte bestätigen Sie alle Schritte zur Account-Löschung.",
        variant: "destructive"
      });
      return;
    }

    setIsDeleting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht angemeldet');

      // Call the delete account function
      const { error } = await supabase.rpc('delete_user_account' as any);
      
      if (error) throw error;

      // Sign out the user
      await supabase.auth.signOut();

      toast({
        title: "Account gelöscht",
        description: "Ihr Account und alle Daten wurden dauerhaft gelöscht."
      });

      navigate('/auth');
    } catch (error: any) {
      toast({
        title: "Löschfehler",
        description: error.message || "Beim Löschen des Accounts ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Account dauerhaft löschen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-destructive/10 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <h3 className="font-medium text-destructive">
                  Wichtige Warnung - Diese Aktion ist unwiderruflich!
                </h3>
                <ul className="text-sm space-y-1">
                  <li>• Alle Ihre Gesundheitsdaten werden dauerhaft gelöscht</li>
                  <li>• Schmerzeinträge, Medikamente und Analysen gehen verloren</li>
                  <li>• PDF-Berichte können nicht mehr erstellt werden</li>
                  <li>• Eine Wiederherstellung ist nicht möglich</li>
                  <li>• Der Account kann nicht reaktiviert werden</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-3">Schritt 1: Daten exportieren (empfohlen)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Laden Sie Ihre Daten herunter, bevor Sie den Account löschen. 
                Dies ist Ihr Recht nach Art. 20 DSGVO.
              </p>
              <Button 
                onClick={handleExportData} 
                variant="outline"
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Meine Daten exportieren (JSON)
              </Button>
            </div>

            <div>
              <h3 className="font-medium mb-3">Schritt 2: Konsequenzen bestätigen</h3>
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="consequences" 
                  checked={agreedToConsequences}
                  onCheckedChange={(checked) => setAgreedToConsequences(!!checked)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="consequences" className="text-sm font-medium">
                    Ich verstehe die Konsequenzen
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Mir ist bewusst, dass alle meine Daten unwiderruflich gelöscht werden 
                    und eine Wiederherstellung nicht möglich ist.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-3">Schritt 3: Bestätigungstext eingeben</h3>
              <Label htmlFor="confirm-deletion">
                Tippen Sie <strong>"ACCOUNT LÖSCHEN"</strong> ein:
              </Label>
              <Input
                id="confirm-deletion"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="ACCOUNT LÖSCHEN"
                className="mt-2"
              />
            </div>

            <Button
              onClick={handleDeleteAccount}
              disabled={
                isDeleting || 
                confirmText !== 'ACCOUNT LÖSCHEN' || 
                !agreedToConsequences
              }
              variant="destructive"
              className="w-full"
            >
              {isDeleting ? (
                "Wird gelöscht..."
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Account dauerhaft löschen
                </>
              )}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>DSGVO-Hinweis:</strong> Nach der Löschung werden alle personenbezogenen 
              Daten gemäß Art. 17 DSGVO innerhalb von 30 Tagen vollständig entfernt.
            </p>
            <p>
              <strong>Support:</strong> Bei Problemen wenden Sie sich an datenschutz@[domain].de
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}