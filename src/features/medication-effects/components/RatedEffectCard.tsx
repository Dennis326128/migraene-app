import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, Clock, Activity } from 'lucide-react';
import { getEffectLabel, getEffectEmoji } from '@/lib/utils/medicationEffects';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MedicationEffectSlider } from '@/components/ui/medication-effect-slider';
import type { RecentMedicationEntry, MedicationEffect } from '../api/medicationEffects.api';

interface RatedEffectCardProps {
  entry: RecentMedicationEntry;
  effect: MedicationEffect;
}

export function RatedEffectCard({ entry, effect }: RatedEffectCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <Card 
        className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setDetailsOpen(true)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium truncate">💊 {effect.med_name}</span>
              <Badge 
                variant={effect.effect_score !== null && effect.effect_score >= 7 ? 'default' : 'secondary'}
                className="text-xs shrink-0"
              >
                {getEffectEmoji(effect.effect_score)} {getEffectLabel(effect.effect_score)}
              </Badge>
            </div>
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {entry.selected_date} um {entry.selected_time}
              </div>
              <Badge variant="outline" className="text-xs h-5">
                <Activity className="w-3 h-3 mr-1" />
                Schmerz: {entry.pain_level}
              </Badge>
            </div>
          </div>

          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </div>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              💊 {effect.med_name}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-4">
            {/* Entry Info */}
            <Card className="p-3 bg-muted/50">
              <div className="text-sm">
                <div className="font-medium">
                  {entry.selected_date} um {entry.selected_time}
                </div>
                <div className="text-muted-foreground">
                  Schmerzstärke: {entry.pain_level}
                </div>
              </div>
            </Card>

            {/* Effect Score (Read-only) */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Wirkung</div>
              <MedicationEffectSlider
                value={effect.effect_score ?? 0}
                onValueChange={() => {}} // Read-only
                disabled
              />
              <div className="text-center text-sm text-muted-foreground">
                {getEffectLabel(effect.effect_score)}
              </div>
            </div>

            {/* Side Effects */}
            {effect.side_effects && effect.side_effects.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Nebenwirkungen</div>
                <div className="flex flex-wrap gap-1">
                  {effect.side_effects.map((sideEffect) => (
                    <Badge key={sideEffect} variant="secondary" className="text-xs">
                      {sideEffect}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {effect.notes && effect.notes.trim() && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Notizen</div>
                <Card className="p-3 bg-muted/30">
                  <p className="text-sm whitespace-pre-wrap">{effect.notes}</p>
                </Card>
              </div>
            )}

            {/* Metadata */}
            <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
              <div>Erfasst: {new Date(effect.created_at).toLocaleDateString('de-DE')} um {new Date(effect.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
              <div>Eingabeart: {effect.method === 'voice' ? '🎤 Sprache' : '✍️ Manuell'}</div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setDetailsOpen(false)}
            >
              Schließen
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
