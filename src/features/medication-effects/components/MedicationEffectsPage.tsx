import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppHeader } from '@/components/ui/app-header';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast as sonnerToast } from 'sonner';
import { 
  useUnratedMedicationEntries, 
  useCreateMedicationEffect,
  useDeleteMedicationFromEntry,
  useRestoreMedicationToEntry
} from '../hooks/useMedicationEffects';
import { getRatedMedicationEntries, type RecentMedicationEntry } from '../api/medicationEffects.api';
import { UnratedEffectCard } from './UnratedEffectCard';
import { RatedEffectCard } from './RatedEffectCard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MedicationEffectPayload } from '../api/medicationEffects.api';

const PAGE_SIZE = 30;
const UNDO_TIMEOUT_MS = 8000;

export function MedicationEffectsPage() {
  const navigate = useNavigate();
  
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'open' | 'history'>('open');
  const [historyPage, setHistoryPage] = useState(0);
  const [allRatedEntries, setAllRatedEntries] = useState<RecentMedicationEntry[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [deletingItem, setDeletingItem] = useState<{ entryId: number; medName: string } | null>(null);
  
  // Ref for undo timeout
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Cleanup undo timeout on unmount
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const createEffect = useCreateMedicationEffect();
  const deleteEntry = useDeleteMedicationFromEntry();
  const restoreEntry = useRestoreMedicationToEntry();

  // Flatten unrated medications
  const unratedMeds = (unratedEntries || []).flatMap(entry => 
    entry.medications
      .filter(med => !entry.rated_medications.includes(med))
      .map(med => ({ entry, medName: med }))
  );

  /** Convert slider value (0-5) to effect_rating for backwards compatibility */
  const sliderToEffectRating = (sliderValue: number): 'none' | 'poor' | 'moderate' | 'good' | 'very_good' => {
    if (sliderValue <= 0) return 'none';
    if (sliderValue <= 1) return 'poor';
    if (sliderValue <= 2) return 'moderate';
    if (sliderValue <= 3) return 'good';
    return 'very_good';
  };

  const handleSaveEffect = async (
    entryId: number,
    medName: string,
    data: {
      effectScore: number; // 0-5 slider scale
      sideEffects: string[];
      notes: string;
      method: 'ui' | 'voice';
    }
  ) => {
    // Convert slider scale (0-5) to DB scale (0-10)
    const dbScore = data.effectScore * 2;
    
    const payload: MedicationEffectPayload = {
      entry_id: entryId,
      med_name: medName,
      effect_rating: sliderToEffectRating(data.effectScore),
      effect_score: dbScore,
      side_effects: data.sideEffects,
      notes: data.notes,
      method: data.method,
      confidence: data.method === 'voice' ? 'medium' : 'high'
    };

    try {
      await createEffect.mutateAsync(payload);
      
      // Calculate remaining open effects after this save
      const remainingOpenEffects = unratedMeds.filter(
        item => !(item.entry.id === entryId && item.medName === medName)
      );
      
      if (remainingOpenEffects.length === 0) {
        sonnerToast('Alle Bewertungen erledigt', {
          description: 'Du bist wieder auf der Startseite.',
          duration: 2000
        });
        navigate('/');
      } else {
        sonnerToast('Bewertung gespeichert', {
          description: `${medName} wurde bewertet.`,
          duration: 2000
        });
      }
    } catch (error) {
      sonnerToast.error('Fehler beim Speichern', {
        description: 'Die Bewertung konnte nicht gespeichert werden.',
        duration: 4000
      });
      throw error;
    }
  };

  const handleDeleteEntry = async (entryId: number, medName: string) => {
    setDeletingItem({ entryId, medName });
    
    try {
      await deleteEntry.mutateAsync({ entryId, medName });
      
      // Show toast with undo action using sonner directly
      sonnerToast(`${medName} gelöscht`, {
        description: 'Einnahme wurde entfernt.',
        duration: UNDO_TIMEOUT_MS,
        action: {
          label: 'Rückgängig',
          onClick: () => handleUndoDelete(entryId, medName)
        }
      });
      
      // Calculate remaining open effects
      const remainingOpenEffects = unratedMeds.filter(
        item => !(item.entry.id === entryId && item.medName === medName)
      );
      
      if (remainingOpenEffects.length === 0) {
        // Navigate to home after a short delay
        setTimeout(() => navigate('/'), 500);
      }
    } catch (error) {
      sonnerToast.error('Fehler beim Löschen', {
        description: 'Die Einnahme konnte nicht gelöscht werden.',
        duration: 4000
      });
    } finally {
      setDeletingItem(null);
    }
  };

  const handleUndoDelete = async (entryId: number, medName: string) => {
    try {
      await restoreEntry.mutateAsync({ entryId, medName });
      sonnerToast('Rückgängig gemacht', {
        description: `${medName} wurde wiederhergestellt.`,
        duration: 2000
      });
    } catch (error) {
      sonnerToast.error('Fehler', {
        description: 'Konnte nicht rückgängig gemacht werden.',
        duration: 4000
      });
    }
  };

  const handleLoadMore = () => {
    setHistoryPage(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="💊 Medikamenten-Wirkung" onBack={() => navigate('/')} sticky />
      <div className="max-w-4xl mx-auto p-4">

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'open' | 'history')} className="mb-6">
          <TabsList className="grid w-full grid-cols-2 h-14">
            <TabsTrigger value="open" className="flex items-center gap-2 text-base px-6 py-3 relative">
              Offen
              {unratedMeds.length > 0 && (
                <Badge variant="default" className="ml-2 h-5 min-w-5 px-1">
                  {unratedMeds.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2 text-base px-6 py-3">
              Verlauf
            </TabsTrigger>
          </TabsList>

          {/* Tab: Offen (Unrated) */}
          <TabsContent value="open" className="space-y-3 mt-6">
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
              <div className="text-center py-12">
                <div className="text-4xl mb-2">✅</div>
                <div className="font-medium">Alle Medikamente bewertet!</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Du hast keine offenen Bewertungen mehr.
                </div>
              </div>
            )}

            {!isLoadingUnrated && unratedMeds.map(({ entry, medName }) => (
              <UnratedEffectCard
                key={`${entry.id}-${medName}`}
                entry={entry}
                medName={medName}
                onSave={(data) => handleSaveEffect(entry.id, medName, data)}
                onDelete={handleDeleteEntry}
                isSaving={createEffect.isPending}
                isDeleting={deletingItem?.entryId === entry.id && deletingItem?.medName === medName}
              />
            ))}
          </TabsContent>

          {/* Tab: Verlauf (History) */}
          <TabsContent value="history" className="space-y-3 mt-6">
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
              <div className="text-center py-12">
                <div className="text-4xl mb-2">📋</div>
                <div className="font-medium">Noch keine Bewertungen</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Bewerte deine Medikamente unter "Offen".
                </div>
              </div>
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
    </div>
  );
}
