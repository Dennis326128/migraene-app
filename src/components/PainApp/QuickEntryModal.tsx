import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { X, Clock, Save, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useCreateEntry } from "@/features/entries/hooks/useEntryMutations";
import { logAndSaveWeatherAt, logAndSaveWeatherAtCoords } from "@/utils/weatherLogger";

interface QuickEntryModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const timeOptions = [
  { value: "now", label: "🔴 Jetzt", minutes: 0 },
  { value: "15min", label: "🟠 Vor 15 Min", minutes: 15 },
  { value: "30min", label: "🟡 Vor 30 Min", minutes: 30 },
  { value: "custom", label: "⏰ Zeitpunkt wählen", minutes: null },
];

const painLevels = [
  { value: "leicht", label: "💚 Leicht (2/10)", color: "bg-green-500" },
  { value: "mittel", label: "💛 Mittel (5/10)", color: "bg-yellow-500" },
  { value: "stark", label: "🟠 Stark (7/10)", color: "bg-orange-500" },
  { value: "sehr_stark", label: "🔴 Sehr stark (9/10)", color: "bg-red-500" },
];

export const QuickEntryModal: React.FC<QuickEntryModalProps> = ({ 
  open, 
  onClose, 
  onSuccess 
}) => {
  const { toast } = useToast();
  const { data: medOptions = [] } = useMeds();
  const createMut = useCreateEntry();

  const [painLevel, setPainLevel] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("now");
  const [customTime, setCustomTime] = useState<string>("");
  const [customDate, setCustomDate] = useState<string>("");
  const [medicationStates, setMedicationStates] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Initialize dates
  useEffect(() => {
    if (open) {
      const now = new Date();
      setCustomDate(now.toISOString().slice(0, 10));
      setCustomTime(now.toTimeString().slice(0, 5));
      
      // Reset form
      setPainLevel("");
      setSelectedTime("now");
      setMedicationStates({});
    }
  }, [open]);

  const calculateTimestamp = () => {
    const now = new Date();
    
    if (selectedTime === "now") return now;
    
    if (selectedTime === "15min" || selectedTime === "30min") {
      const minutes = selectedTime === "15min" ? 15 : 30;
      return new Date(now.getTime() - minutes * 60 * 1000);
    }
    
    if (selectedTime === "custom" && customDate && customTime) {
      return new Date(`${customDate}T${customTime}:00`);
    }
    
    return now;
  };

  const getSelectedMedications = () => {
    return Object.entries(medicationStates)
      .filter(([_, taken]) => taken === true)
      .map(([name]) => name);
  };

  const handleSave = async () => {
    if (!painLevel) {
      toast({ 
        title: "Fehler", 
        description: "Bitte Schmerzstärke auswählen", 
        variant: "destructive" 
      });
      return;
    }

    setSaving(true);
    
    try {
      const timestamp = calculateTimestamp();
      const selectedDate = timestamp.toISOString().slice(0, 10);
      const selectedTimeStr = timestamp.toTimeString().slice(0, 5);
      
      // Background GPS capture
      let latitude = null;
      let longitude = null;
      
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ 
          enableHighAccuracy: true, 
          timeout: 8000 
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        console.log('📍 Quick Entry: GPS coordinates captured');
      } catch (gpsError) {
        console.warn('📍 Quick Entry: GPS failed, will use fallback', gpsError);
        
        // Fallback to user profile coordinates
        try {
          const { supabase } = await import('@/integrations/supabase/client');
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('latitude, longitude')
            .single();
            
          if (profile?.latitude && profile?.longitude) {
            latitude = Number(profile.latitude);
            longitude = Number(profile.longitude);
            console.log('📍 Quick Entry: Using stored profile coordinates');
          }
        } catch (profileError) {
          console.warn('📍 Quick Entry: Profile fallback failed', profileError);
        }
      }

      // Weather data (background fetch)
      let weatherId = null;
      try {
        const atISO = timestamp.toISOString();
        if (latitude && longitude) {
          weatherId = await logAndSaveWeatherAtCoords(atISO, latitude, longitude);
        } else {
          weatherId = await logAndSaveWeatherAt(atISO);
        }
      } catch (weatherError) {
        console.warn('⛅ Quick Entry: Weather fetch failed', weatherError);
      }

      // Create entry
      const payload = {
        selected_date: selectedDate,
        selected_time: selectedTimeStr,
        pain_level: painLevel as "leicht" | "mittel" | "stark" | "sehr_stark",
        aura_type: "keine" as const,
        pain_location: null,
        medications: getSelectedMedications(),
        notes: "📱 Schnelleintrag",
        weather_id: weatherId,
        latitude,
        longitude,
      };

      await createMut.mutateAsync(payload as any);
      
      toast({ 
        title: "🚀 Schnelleintrag gespeichert", 
        description: `${painLevels.find(p => p.value === painLevel)?.label} erfasst` 
      });
      
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);
      
    } catch (error) {
      console.error("Quick Entry save error:", error);
      toast({ 
        title: "❌ Fehler beim Speichern", 
        description: "Bitte versuchen Sie es erneut.", 
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-y-auto bg-card border-quick-entry">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-quick-entry">
            <Zap className="h-5 w-5" />
            🔴 Migräne Schnelleintrag
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pain Level Selection */}
          <Card className="p-4 border-quick-entry/20">
            <Label className="text-base font-medium mb-3 block text-quick-entry">
              🩺 Schmerzstärke *
            </Label>
            <div className="grid gap-2">
              {painLevels.map((level) => (
                <Button
                  key={level.value}
                  type="button"
                  variant={painLevel === level.value ? "default" : "outline"}
                  className={`h-auto p-3 text-left justify-start transition-all ${
                    painLevel === level.value 
                      ? "bg-quick-entry text-quick-entry-foreground ring-2 ring-quick-entry/50" 
                      : "hover:border-quick-entry/50"
                  }`}
                  onClick={() => setPainLevel(level.value)}
                >
                  <span className="font-medium">{level.label}</span>
                </Button>
              ))}
            </div>
          </Card>

          {/* Time Selection */}
          <Card className="p-4">
            <Label className="text-base font-medium mb-3 block">
              <Clock className="inline h-4 w-4 mr-1" />
              Zeitpunkt
            </Label>
            <div className="grid gap-2 mb-3">
              {timeOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={selectedTime === option.value ? "secondary" : "outline"}
                  className="h-auto p-3 text-left justify-start"
                  onClick={() => setSelectedTime(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            
            {selectedTime === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-sm">Datum</Label>
                  <input 
                    type="date" 
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm">Zeit</Label>
                  <input 
                    type="time" 
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                  />
                </div>
              </div>
            )}
          </Card>

          {/* Medications */}
          {medOptions.length > 0 && (
            <Card className="p-4">
              <Label className="text-base font-medium mb-3 block">💊 Medikamente</Label>
              <div className="space-y-3">
                {medOptions.map((med) => (
                  <div key={med.id} className="flex items-center justify-between py-1">
                    <span className="text-sm font-medium">{med.name}</span>
                    <Switch
                      checked={medicationStates[med.name] || false}
                      onCheckedChange={(checked) => 
                        setMedicationStates(prev => ({ 
                          ...prev, 
                          [med.name]: checked 
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
              disabled={saving}
            >
              <X className="h-4 w-4 mr-1" />
              Abbrechen
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!painLevel || saving}
              className="flex-1 bg-quick-entry hover:bg-quick-entry-hover text-quick-entry-foreground"
            >
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Speichere..." : "Speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};