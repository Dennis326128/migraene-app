import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, TrendingUp, Clock, Star, AlertTriangle, Pill } from "lucide-react";
import { useEvents } from "@/features/events/hooks/useEvents";

interface MedicationEffectsViewProps {
  onBack: () => void;
}

export const MedicationEffectsView: React.FC<MedicationEffectsViewProps> = ({ onBack }) => {
  const { data: events = [] } = useEvents();

  // Analyze medication effectiveness
  const medicationStats = React.useMemo(() => {
    const stats: Record<string, {
      name: string;
      totalUses: number;
      effectiveUses: number;
      avgEffectRating: number;
      avgOnsetMinutes: number;
      avgReliefDuration: number;
      avgReliefPercent: number;
      recentEffects: Array<{
        date: string;
        rating: number;
        reliefPercent: number;
      }>;
    }> = {};

    events.forEach(event => {
      if (!event.event_meds) return;
      
      event.event_meds.forEach((eventMed: any) => {
        const medName = eventMed.user_medications?.name;
        if (!medName) return;
        
        if (!stats[medName]) {
          stats[medName] = {
            name: medName,
            totalUses: 0,
            effectiveUses: 0,
            avgEffectRating: 0,
            avgOnsetMinutes: 0,
            avgReliefDuration: 0,
            avgReliefPercent: 0,
            recentEffects: []
          };
        }
        
        stats[medName].totalUses++;
        
        if (eventMed.med_effects && eventMed.med_effects.length > 0) {
          const effect = eventMed.med_effects[0];
          const isEffective = effect.effect_rating_0_4 >= 2;
          
          if (isEffective) {
            stats[medName].effectiveUses++;
          }
          
          // Calculate averages
          const existingRating = stats[medName].avgEffectRating;
          const existingOnset = stats[medName].avgOnsetMinutes;
          const existingDuration = stats[medName].avgReliefDuration;
          const existingPercent = stats[medName].avgReliefPercent;
          
          stats[medName].avgEffectRating = (existingRating + effect.effect_rating_0_4) / 2;
          stats[medName].avgOnsetMinutes = effect.onset_min ? (existingOnset + effect.onset_min) / 2 : existingOnset;
          stats[medName].avgReliefDuration = effect.relief_duration_min ? (existingDuration + effect.relief_duration_min) / 2 : existingDuration;
          stats[medName].avgReliefPercent = effect.relief_percent_0_100 ? (existingPercent + effect.relief_percent_0_100) / 2 : existingPercent;
          
          // Add to recent effects
          stats[medName].recentEffects.push({
            date: event.started_at,
            rating: effect.effect_rating_0_4,
            reliefPercent: effect.relief_percent_0_100 || 0
          });
        }
      });
    });

    // Sort recent effects and keep only last 5
    Object.values(stats).forEach(stat => {
      stat.recentEffects.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      stat.recentEffects = stat.recentEffects.slice(0, 5);
    });

    return stats;
  }, [events]);

  const sortedMedications = Object.values(medicationStats).sort((a, b) => {
    const aEffectiveness = a.totalUses > 0 ? (a.effectiveUses / a.totalUses) : 0;
    const bEffectiveness = b.totalUses > 0 ? (b.effectiveUses / b.totalUses) : 0;
    return bEffectiveness - aEffectiveness;
  });

  const getEffectivenessColor = (rating: number) => {
    if (rating >= 3) return "text-success";
    if (rating >= 2) return "text-warning";
    return "text-destructive";
  };

  const getEffectivenessLabel = (rating: number) => {
    if (rating >= 3.5) return "Sehr effektiv";
    if (rating >= 2.5) return "Effektiv";
    if (rating >= 1.5) return "Mäßig effektiv";
    return "Wenig effektiv";
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Medikamenten-Wirksamkeit</h1>
            <p className="text-muted-foreground">Analyse der Medikamentenwirkung</p>
          </div>
        </div>

        {sortedMedications.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-muted-foreground">
                <Pill className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Noch keine Wirkungsdaten verfügbar</p>
                <p className="text-sm mt-2">
                  Verwenden Sie den Schnelleintrag und dokumentieren Sie die Wirkung Ihrer Medikamente
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Pill className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{sortedMedications.length}</p>
                      <p className="text-sm text-muted-foreground">Medikamente getestet</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-warning" />
                    <div>
                      <p className="text-2xl font-bold">
                        {sortedMedications.length > 0 ? 
                          Math.round(sortedMedications.reduce((sum, med) => sum + med.avgEffectRating, 0) / sortedMedications.length * 10) / 10 
                          : 0}/4
                      </p>
                      <p className="text-sm text-muted-foreground">Ø Wirksamkeit</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-info" />
                    <div>
                      <p className="text-2xl font-bold">
                        {sortedMedications.length > 0 ? 
                          Math.round(sortedMedications.reduce((sum, med) => sum + med.avgOnsetMinutes, 0) / sortedMedications.length) 
                          : 0}min
                      </p>
                      <p className="text-sm text-muted-foreground">Ø Wirkungseintritt</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Medication Details */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Medikamenten-Ranking
              </h2>
              
              {sortedMedications.map((med, index) => {
                const effectivenessPercent = med.totalUses > 0 ? (med.effectiveUses / med.totalUses) * 100 : 0;
                
                return (
                  <Card key={med.name}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <span className="text-2xl">#{index + 1}</span>
                          {med.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={med.avgEffectRating >= 2.5 ? "default" : "secondary"}
                            className={getEffectivenessColor(med.avgEffectRating)}
                          >
                            {getEffectivenessLabel(med.avgEffectRating)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {med.totalUses} Einnahme{med.totalUses !== 1 ? 'n' : ''}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Wirksamkeit</p>
                          <div className="flex items-center gap-2">
                            <Progress value={effectivenessPercent} className="flex-1" />
                            <span className="text-sm font-medium">{Math.round(effectivenessPercent)}%</span>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-sm text-muted-foreground">Ø Bewertung</p>
                          <p className="font-medium">{Math.round(med.avgEffectRating * 10) / 10}/4</p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-muted-foreground">Wirkungseintritt</p>
                          <p className="font-medium">{Math.round(med.avgOnsetMinutes)} Min</p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-muted-foreground">Wirkdauer</p>
                          <p className="font-medium">
                            {Math.round(med.avgReliefDuration / 60 * 10) / 10}h
                          </p>
                        </div>
                      </div>
                      
                      {/* Recent Effects */}
                      {med.recentEffects.length > 0 && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Letzte Wirkungen:</p>
                          <div className="flex gap-2 flex-wrap">
                            {med.recentEffects.map((effect, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {effect.rating}/4 ({effect.reliefPercent}%)
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {med.avgEffectRating < 1.5 && med.totalUses >= 3 && (
                        <div className="mt-3 p-3 bg-destructive/10 rounded-lg flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                          <p className="text-sm text-destructive">
                            Dieses Medikament zeigt konsistent geringe Wirksamkeit. 
                            Sprechen Sie mit Ihrem Arzt über Alternativen.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
