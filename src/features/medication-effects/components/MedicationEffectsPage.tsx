import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  useUnratedMedicationEntries, 
  useCreateMedicationEffect 
} from '../hooks/useMedicationEffects';
import { getRatedMedicationEntries, type RecentMedicationEntry } from '../api/medicationEffects.api';
import { UnratedEffectCard } from './UnratedEffectCard';
import { RatedEffectCard } from './RatedEffectCard';
import { useQuery } from '@tanstack/react-query';
import type { MedicationEffectPayload } from '../api/medicationEffects.api';

const PAGE_SIZE = 30;

export function MedicationEffectsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'open' | 'history'>('open');
  const [historyPage, setHistoryPage] = useState(0);
  const [allRatedEntries, setAllRatedEntries] = useState<RecentMedicationEntry[]>([]);
  const [hasMore, setHasMore] = useState(true);

  // Query for unrated entries
  const { 
    data: unratedEntries, 
    isLoading: isLoadingUnrated,
    error: unratedError 
  } = useUnratedMedicationEntries();

  // Query for rated entries (history)
  const { 
    data: ratedEntries, 
    isLoading: isLoadingRated,
    error: ratedError,
  } = useQuery({
    queryKey: ['ratedMedicationEntries', historyPage],
    queryFn: async () => {
      const offset = historyPage * PAGE_SIZE;
      return getRatedMedicationEntries(PAGE_SIZE, offset);
    },
    enabled: activeTab === 'history',
  });

  // Accumulate rated entries when new page is loaded
  useEffect(() => {
    if (ratedEntries) {
      if (historyPage === 0) {
        setAllRatedEntries(ratedEntries);
      } else {
        setAllRatedEntries(prev => [...prev, ...ratedEntries]);
      }
      setHasMore(ratedEntries.length === PAGE_SIZE);
    }
  }, [ratedEntries, historyPage]);

  const createEffect = useCreateMedicationEffect();

  // Flatten unrated medications
  const unratedMeds = (unratedEntries || []).flatMap(entry => 
    entry.medications
      .filter(med => !entry.rated_medications.includes(med))
      .map(med => ({ entry, medName: med }))
  );

  const handleSaveEffect = async (
    entryId: number,
    medName: string,
    data: {
      effectScore: number;
      sideEffects: string[];
      notes: string;
      method: 'ui' | 'voice';
    }
  ) => {
    const payload: MedicationEffectPayload = {
      entry_id: entryId,
      med_name: medName,
      effect_rating: 'moderate', // Fallback text rating (legacy)
      effect_score: data.effectScore,
      side_effects: data.sideEffects,
      notes: data.notes,
      method: data.method,
      confidence: data.method === 'voice' ? 'medium' : 'high'
    };

    try {
      await createEffect.mutateAsync(payload);
      
      // Calculate remaining open effects after this save
      // Current unratedMeds minus the one we just saved
      const remainingOpenEffects = unratedMeds.filter(
        item => !(item.entry.id === entryId && item.medName === medName)
      );
      
      if (remainingOpenEffects.length === 0) {
        // No more open effects - navigate to home
        toast({
          title: '✅ Alle Bewertungen erledigt',
          description: 'Du bist wieder auf der Startseite.'
        });
        navigate('/');
      } else {
        toast({
          title: '✅ Bewertung gespeichert',
          description: `${medName} wurde bewertet.`
        });
      }
    } catch (error) {
      toast({
        title: 'Fehler beim Speichern',
        description: 'Die Bewertung konnte nicht gespeichert werden.',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleLoadMore = () => {
    setHistoryPage(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold flex-1">💊 Medikamenten-Wirkung</h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'open' | 'history')} className="px-4 pt-4">
        <TabsList className="w-full grid grid-cols-2 mb-4">
          <TabsTrigger value="open" className="relative">
            Offen
            {unratedMeds.length > 0 && (
              <Badge variant="default" className="ml-2 h-5 min-w-5 px-1">
                {unratedMeds.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            Verlauf
          </TabsTrigger>
        </TabsList>

        {/* Tab: Offen (Unrated) */}
        <TabsContent value="open" className="space-y-3 mt-0">
          {isLoadingUnrated && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {unratedError && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                Fehler beim Laden der offenen Bewertungen.
              </AlertDescription>
            </Alert>
          )}

          {!isLoadingUnrated && unratedMeds.length === 0 && (
            <Alert>
              <AlertDescription className="text-center py-8">
                <div className="text-4xl mb-2">✅</div>
                <div className="font-medium">Alle Medikamente bewertet!</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Du hast keine offenen Bewertungen mehr.
                </div>
              </AlertDescription>
            </Alert>
          )}

          {!isLoadingUnrated && unratedMeds.map(({ entry, medName }) => (
            <UnratedEffectCard
              key={`${entry.id}-${medName}`}
              entry={entry}
              medName={medName}
              onSave={(data) => handleSaveEffect(entry.id, medName, data)}
              isSaving={createEffect.isPending}
            />
          ))}
        </TabsContent>

        {/* Tab: Verlauf (History) */}
        <TabsContent value="history" className="space-y-3 mt-0">
          {isLoadingRated && historyPage === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {ratedError && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                Fehler beim Laden des Verlaufs.
              </AlertDescription>
            </Alert>
          )}

          {!isLoadingRated && allRatedEntries.length === 0 && historyPage === 0 && (
            <Alert>
              <AlertDescription className="text-center py-8">
                <div className="text-4xl mb-2">📋</div>
                <div className="font-medium">Noch keine Bewertungen</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Bewerte deine Medikamente unter "Offen".
                </div>
              </AlertDescription>
            </Alert>
          )}

          {allRatedEntries.flatMap(entry =>
            entry.medication_effects.map(effect => (
              <RatedEffectCard
                key={effect.id}
                entry={entry}
                effect={effect}
              />
            ))
          )}

          {/* Load More Button */}
          {hasMore && allRatedEntries.length > 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleLoadMore}
              disabled={isLoadingRated}
            >
              {isLoadingRated ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Lädt...
                </>
              ) : (
                'Ältere Einträge laden'
              )}
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
