import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, Clock } from 'lucide-react';
import { getEffectLabel, getEffectEmoji, getEffectiveScore } from '@/lib/utils/medicationEffects';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MedicationEffectSlider } from '@/components/ui/medication-effect-slider';
import { normalizePainLevel } from '@/lib/utils/pain';
import type { RecentMedicationEntry, MedicationEffect } from '../api/medicationEffects.api';

interface RatedEffectCardProps {
  entry: RecentMedicationEntry;
  effect: MedicationEffect;
}

/** Format date/time to German format: "12.12.2025, 12:05 Uhr" */
function formatGermanDateTime(date: string | null, time: string | null): string {
  if (!date) return '';
  
  // Parse date (expected: YYYY-MM-DD)
  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year}`;
  
  // Format time without seconds
  let formattedTime = '';
  if (time) {
    const timeParts = time.split(':');
    formattedTime = `${timeParts[0]}:${timeParts[1]}`;
  }
  
  return formattedTime ? `${formattedDate}, ${formattedTime} Uhr` : formattedDate;
}

/** Get pain severity level for color coding */
function getPainSeverityLevel(score: number): 'mild' | 'moderate' | 'severe' {
  if (score <= 3) return 'mild';
  if (score <= 6) return 'moderate';
  return 'severe';
}

/** Get pain dot color based on severity */
function getPainDotColor(level: 'mild' | 'moderate' | 'severe'): string {
  switch (level) {
    case 'mild':
      return 'bg-emerald-400';
    case 'moderate':
      return 'bg-amber-400';
    case 'severe':
      return 'bg-rose-400';
  }
}

export function RatedEffectCard({ entry, effect }: RatedEffectCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Get score from effect_score or convert from effect_rating for backwards compatibility
  const effectScore = getEffectiveScore(effect.effect_score, effect.effect_rating);
  
  // Normalize pain level to numeric (0-10)
  const painScore = normalizePainLevel(entry.pain_level);
  const painSeverity = getPainSeverityLevel(painScore);

  return (
    <>
      <Card 
        className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setDetailsOpen(true)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Row 1: Medication Name */}
            <div className="font-medium truncate mb-1.5">💊 {effect.med_name}</div>
            
            {/* Row 2: Effect Badge + Pain Badge side by side */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge 
                variant={effectScore !== null && effectScore >= 7 ? 'default' : 'secondary'}
                className="text-xs shrink-0"
              >
                {getEffectEmoji(effectScore)} {getEffectLabel(effectScore)}
              </Badge>
              <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 bg-slate-800 text-slate-100 text-xs font-medium shrink-0 whitespace-nowrap">
                <span className={`h-2 w-2 rounded-full ${getPainDotColor(painSeverity)}`} />
                <span>Schmerz {painScore}/10</span>
              </div>
            </div>
            
            {/* Row 3: Date/Time */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatGermanDateTime(entry.selected_date, entry.selected_time)}
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
                  {formatGermanDateTime(entry.selected_date, entry.selected_time)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-muted-foreground">Schmerzstärke:</span>
                  <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 bg-slate-800 text-slate-100 text-xs font-medium">
                    <span className={`h-2 w-2 rounded-full ${getPainDotColor(painSeverity)}`} />
                    <span>{painScore}/10</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Effect Score (Read-only) */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Wirkung</div>
              <MedicationEffectSlider
                value={effectScore ?? 0}
                onValueChange={() => {}} // Read-only
                disabled
              />
              <div className="text-center text-sm text-muted-foreground">
                {getEffectLabel(effectScore)}
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
              <div>Erfasst: {new Date(effect.created_at).toLocaleDateString('de-DE')} um {new Date(effect.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</div>
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
