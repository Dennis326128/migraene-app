import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * Hook für optimierte Cache-Strategien
 */
export function useOptimizedCache() {
  const queryClient = useQueryClient();

  // Prefetch häufig verwendete Daten
  const prefetchEssentials = useCallback(async () => {
    // User profile und settings vorladen
    queryClient.prefetchQuery({
      queryKey: ['user-profile'],
      staleTime: 5 * 60 * 1000, // 5 Minuten fresh
    });

    queryClient.prefetchQuery({
      queryKey: ['user-settings'],
      staleTime: 10 * 60 * 1000, // 10 Minuten fresh
    });

    // Medikamente prefetchen
    queryClient.prefetchQuery({
      queryKey: ['medications'],
      staleTime: 30 * 60 * 1000, // 30 Minuten fresh
    });

    // Symptom catalog prefetchen
    queryClient.prefetchQuery({
      queryKey: ['symptom_catalog'],
      staleTime: 60 * 60 * 1000, // 1 Stunde fresh
    });
  }, [queryClient]);

  // Cache-Invalidierung für verwandte Queries
  const invalidateRelated = useCallback((baseKey: string) => {
    switch (baseKey) {
      case 'events':
        // Wenn Events geändert werden, auch Statistiken invalidieren
        queryClient.invalidateQueries({ queryKey: ['events'] });
        queryClient.invalidateQueries({ queryKey: ['statistics'] });
        queryClient.invalidateQueries({ queryKey: ['migration-status'] });
        break;
        
      case 'pain_entries':
        // Legacy entries beeinflussen Migration status
        queryClient.invalidateQueries({ queryKey: ['pain_entries'] });
        queryClient.invalidateQueries({ queryKey: ['migration-status'] });
        queryClient.invalidateQueries({ queryKey: ['statistics'] });
        break;
        
      case 'medications':
        queryClient.invalidateQueries({ queryKey: ['medications'] });
        // Evt. auch Events invalidieren falls Medikament gelöscht wurde
        queryClient.invalidateQueries({ queryKey: ['events'] });
        break;
        
      default:
        queryClient.invalidateQueries({ queryKey: [baseKey] });
    }
  }, [queryClient]);

  // Optimistisches Update für bessere UX
  const optimisticUpdate = useCallback((
    queryKey: string[], 
    updater: (oldData: any) => any
  ) => {
    queryClient.setQueryData(queryKey, updater);
  }, [queryClient]);

  // Hintergrund-Refresh für wichtige Daten
  const backgroundRefresh = useCallback(() => {
    // Nur bei aktiver Verbindung
    if (navigator.onLine) {
      queryClient.refetchQueries({ 
        queryKey: ['events'],
        type: 'active' 
      });
      
      queryClient.refetchQueries({ 
        queryKey: ['migration-status'],
        type: 'active'
      });
    }
  }, [queryClient]);

  return {
    prefetchEssentials,
    invalidateRelated,
    optimisticUpdate,
    backgroundRefresh
  };
}

/**
 * Service Worker für Offline-Unterstützung
 */
export function registerOfflineSupport() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  }
}