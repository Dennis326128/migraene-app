import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUserSettings } from "@/features/settings/hooks/useUserSettings";
import { WeatherBackfillTest } from "@/components/WeatherBackfillTest";
import { AccountDeletion } from "@/components/AccountDeletion";
import { Separator } from "@/components/ui/separator";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";
import { Trash2, Plus, Pill } from "lucide-react";

const SettingsPage = ({ onBack }: { onBack: () => void }) => {
  const { toast } = useToast();
  const { data: settings, isLoading } = useUserSettings();

  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [saving, setSaving] = useState(false);
  const [newMedName, setNewMedName] = useState("");
  
  // Medication management
  const { data: medications = [], isLoading: medsLoading } = useMeds();
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();

  // Initialize form with current settings
  useEffect(() => {
    if (settings) {
      // Koordinaten aus user_profiles laden
      loadUserCoordinates();
    }
  }, [settings]);

  const loadUserCoordinates = async () => {
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('latitude, longitude')
          .eq('user_id', user.id)
          .single();
          
        if (profile) {
          setLatitude(profile.latitude ? String(profile.latitude) : "");
          setLongitude(profile.longitude ? String(profile.longitude) : "");
        }
      }
    } catch (error) {
      console.warn('Error loading coordinates:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const lat = latitude ? parseFloat(latitude) : null;
      const lon = longitude ? parseFloat(longitude) : null;

      if ((lat && !lon) || (!lat && lon)) {
        toast({
          title: "Ungültige Koordinaten",
          description: "Bitte beide Werte (Breiten- und Längengrad) eingeben oder beide leer lassen",
          variant: "destructive",
        });
        return;
      }

      if (lat && (lat < -90 || lat > 90)) {
        toast({
          title: "Ungültiger Breitengrad",
          description: "Breitengrad muss zwischen -90 und 90 liegen",
          variant: "destructive",
        });
        return;
      }

      if (lon && (lon < -180 || lon > 180)) {
        toast({
          title: "Ungültiger Längengrad", 
          description: "Längengrad muss zwischen -180 und 180 liegen",
          variant: "destructive",
        });
        return;
      }

      // Save coordinates to user_profiles
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { error } = await supabase
          .from('user_profiles')
          .upsert({
            user_id: user.id,
            latitude: lat,
            longitude: lon,
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      toast({
        title: "✅ Einstellungen gespeichert",
        description: lat && lon 
          ? `Koordinaten: ${lat.toFixed(4)}, ${lon.toFixed(4)}` 
          : "Standort-Daten entfernt",
      });
    } catch (error: any) {
      toast({
        title: "Fehler beim Speichern",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Standort nicht verfügbar",
        description: "Ihr Browser unterstützt keine Standortermittlung",
        variant: "destructive",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lon = position.coords.longitude.toFixed(6);
        setLatitude(lat);
        setLongitude(lon);
        toast({
          title: "📍 Standort ermittelt",
          description: `Lat: ${lat}, Lon: ${lon}`,
        });
      },
      (error) => {
        toast({
          title: "Standort-Fehler",
          description: "Standort konnte nicht ermittelt werden. Bitte Berechtigungen prüfen.",
          variant: "destructive",
        });
      }
    );
  };

  const handleAddMedication = async () => {
    if (!newMedName.trim()) return;
    try {
      await addMed.mutateAsync(newMedName.trim());
      setNewMedName("");
      toast({
        title: "✅ Medikament hinzugefügt",
        description: `${newMedName} wurde zur Liste hinzugefügt`,
      });
    } catch (error: any) {
      toast({
        title: "Fehler beim Hinzufügen",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteMedication = async (medName: string) => {
    try {
      await deleteMed.mutateAsync(medName);
      toast({
        title: "✅ Medikament entfernt",
        description: `${medName} wurde aus der Liste entfernt`,
      });
    } catch (error: any) {
      toast({
        title: "Fehler beim Entfernen",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading || medsLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Lade Einstellungen...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-background to-secondary/20 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={onBack} className="p-2 hover:bg-secondary/80">
          ← Zurück
        </Button>
        <h1 className="text-xl font-semibold">⚙️ Einstellungen</h1>
        <div className="w-16"></div>
      </div>

      <Card className="p-6 mb-4">
        <h2 className="text-lg font-medium mb-4">📍 Standort für Wetter-Daten</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Für automatische Wetter-Erfassung werden Ihre Koordinaten benötigt. 
          Diese werden nur für Wetter-APIs verwendet und nicht weitergegeben.
        </p>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="latitude">Breitengrad (Latitude)</Label>
            <Input
              id="latitude"
              type="number"
              step="0.000001"
              placeholder="z.B. 52.520008"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="longitude">Längengrad (Longitude)</Label>
            <Input
              id="longitude"
              type="number"
              step="0.000001"
              placeholder="z.B. 13.404954"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={getCurrentLocation}
              className="flex-1"
            >
              📱 Aktuellen Standort verwenden
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1"
            >
              {saving ? "Speichere..." : "💾 Speichern"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Medication Management Section */}
      <Card className="p-6 mb-4">
        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Pill className="h-5 w-5" />
          Medikamente verwalten
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Verwalten Sie Ihre Medikamentenliste für schnelle Eingabe und Analyse.
        </p>
        
        {/* Add new medication */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Medikamentenname eingeben..."
              value={newMedName}
              onChange={(e) => setNewMedName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMedication()}
            />
            <Button
              onClick={handleAddMedication}
              disabled={!newMedName.trim() || addMed.isPending}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Medications list */}
          <div className="space-y-2">
            {medications.map((med) => (
              <div
                key={med.id}
                className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg"
              >
                <span className="font-medium">{med.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteMedication(med.name)}
                  disabled={deleteMed.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {medications.length === 0 && (
              <p className="text-center py-4 text-muted-foreground">
                Noch keine Medikamente hinzugefügt
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Privacy & GDPR Section */}
      <Card className="p-6 mb-4">
        <h2 className="text-lg font-medium mb-4">🛡️ Datenschutz & DSGVO</h2>
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => window.open('/privacy', '_blank')}
            className="w-full justify-start"
          >
            📋 Datenschutzerklärung anzeigen
          </Button>
          <Separator />
          <AccountDeletion />
        </div>
      </Card>

      {/* Test Component for Development */}
      <WeatherBackfillTest />
    </div>
  );
};

export default SettingsPage;