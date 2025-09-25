import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Activity, Clock, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRecordMedEffect } from "@/features/events/hooks/useEvents";

interface EffectDocumentationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder?: {
    id: number;
    event_med_id: number;
    event_meds?: {
      user_medications?: { name: string };
      events?: { started_at: string; intensity_0_10: number };
    };
  } | null;
}

const effectRatings = [
  { value: 0, label: "Keine Wirkung", desc: "Schmerz unverändert", emoji: "😞", color: "text-destructive" },
  { value: 1, label: "Geringe Wirkung", desc: "Etwas Linderung", emoji: "😐", color: "text-orange-500" },
  { value: 2, label: "Mittlere Wirkung", desc: "Deutliche Besserung", emoji: "🙂", color: "text-yellow-500" },
  { value: 3, label: "Gute Wirkung", desc: "Starke Linderung", emoji: "😊", color: "text-lime-500" },
  { value: 4, label: "Sehr gute Wirkung", desc: "Fast schmerzfrei", emoji: "😄", color: "text-success" },
];

export const EffectDocumentationModal: React.FC<EffectDocumentationModalProps> = ({
  open,
  onOpenChange,
  reminder
}) => {
  const { toast } = useToast();
  const recordEffect = useRecordMedEffect();

  const [effectRating, setEffectRating] = useState<number>(2);
  const [painBefore, setPainBefore] = useState<number>(reminder?.event_meds?.events?.intensity_0_10 || 7);
  const [painAfter, setPainAfter] = useState<number>(3);
  const [onsetMinutes, setOnsetMinutes] = useState<number>(30);
  const [reliefDuration, setReliefDuration] = useState<number>(240); // 4 hours default
  const [sideEffects, setSideEffects] = useState<string>("");

  const medName = reminder?.event_meds?.user_medications?.name || "Medikament";
  const eventTime = reminder?.event_meds?.events?.started_at;
  const timeAgo = eventTime ? Math.round((Date.now() - new Date(eventTime).getTime()) / (1000 * 60 * 60)) : 0;

  const handleSave = async () => {
    if (!reminder?.event_med_id) return;

    try {
      await recordEffect.mutateAsync({
        event_med_id: reminder.event_med_id,
        effect_rating_0_4: effectRating,
        pain_before_0_10: painBefore,
        pain_after_0_10: painAfter,
        onset_min: onsetMinutes > 0 ? onsetMinutes : undefined,
        relief_duration_min: reliefDuration > 0 ? reliefDuration : undefined,
        side_effects_text: sideEffects.trim() || undefined
      });

      toast({
        title: "✅ Wirkung dokumentiert",
        description: `${medName}: ${effectRatings[effectRating].label}`,
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: "❌ Fehler beim Speichern",
        description: "Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    }
  };

  const reliefPercent = painBefore > 0 ? Math.round(((painBefore - painAfter) / painBefore) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Wirkung dokumentieren
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Medikament Info */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{medName}</h4>
                  <p className="text-sm text-muted-foreground">
                    Eingenommen vor {timeAgo}h
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl">💊</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wirkung bewerten */}
          <Card>
            <CardContent className="pt-6">
              <Label className="text-base font-medium mb-4 block">
                ⭐ Wie stark hat es geholfen?
              </Label>
              
              <div className="grid gap-2">
                {effectRatings.map((rating) => (
                  <Button
                    key={rating.value}
                    type="button"
                    variant={effectRating === rating.value ? "default" : "outline"}
                    className="h-auto p-4 text-left justify-start"
                    onClick={() => setEffectRating(rating.value)}
                  >
                    <div className="flex items-center w-full">
                      <span className="text-2xl mr-3">{rating.emoji}</span>
                      <div className="flex-1">
                        <div className="font-medium">{rating.label}</div>
                        <div className="text-sm text-muted-foreground">{rating.desc}</div>
                      </div>
                      <div className="text-sm font-bold">{rating.value}/4</div>
                    </div>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Schmerz vorher/nachher */}
          <Card>
            <CardContent className="pt-6">
              <Label className="text-base font-medium mb-4 block">
                📊 Schmerzlevel vorher/nachher
              </Label>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    Schmerz vorher (0-10)
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={painBefore}
                      onChange={(e) => setPainBefore(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-8 text-center font-mono">{painBefore}</span>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    Schmerz nachher (0-10)
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={painAfter}
                      onChange={(e) => setPainAfter(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-8 text-center font-mono">{painAfter}</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-3 p-3 bg-muted/30 rounded-lg text-center">
                <div className="text-lg font-semibold">
                  {reliefPercent > 0 ? `${reliefPercent}% Linderung` : "Keine Linderung"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {painBefore} → {painAfter}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timing */}
          <Card>
            <CardContent className="pt-6">
              <Label className="text-base font-medium mb-4 block flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Zeitverlauf
              </Label>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    Wirkung nach (Minuten)
                  </Label>
                  <input
                    type="number"
                    min="0"
                    max="480"
                    step="15"
                    value={onsetMinutes}
                    onChange={(e) => setOnsetMinutes(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    Dauer der Linderung (Minuten)
                  </Label>
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    step="30"
                    value={reliefDuration}
                    onChange={(e) => setReliefDuration(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Nebenwirkungen */}
          <Card>
            <CardContent className="pt-6">
              <Label className="text-base font-medium mb-3 block">
                ⚠️ Nebenwirkungen (optional)
              </Label>
              <Textarea
                value={sideEffects}
                onChange={(e) => setSideEffects(e.target.value)}
                placeholder="z.B. Übelkeit, Müdigkeit, Schwindel..."
                className="min-h-[80px]"
                maxLength={300}
              />
              <div className="text-xs text-muted-foreground mt-1">
                {sideEffects.length}/300 Zeichen
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Aktionsbuttons */}
          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={recordEffect.isPending}
            >
              Später
            </Button>
            
            <Button
              onClick={handleSave}
              disabled={recordEffect.isPending}
              className="min-w-32"
            >
              {recordEffect.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Speichern...
                </>
              ) : (
                <>
                  💾 Dokumentieren
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};