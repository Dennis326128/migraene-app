import { useEffect, useState, useCallback } from 'react';
import { WifiOff, Wifi, RefreshCw, CloudOff, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncPendingEntries, getPendingEntries } from '@/lib/offlineQueue';
import { toast } from 'sonner';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  const updatePendingCount = useCallback(async () => {
    try {
      const pending = await getPendingEntries();
      setPendingCount(pending.length);
    } catch (e) {
      // IndexedDB might not be available
      console.warn('Could not get pending entries:', e);
    }
  }, []);

  const handleSync = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    
    setSyncing(true);
    try {
      const result = await syncPendingEntries();
      await updatePendingCount();
      
      if (result.success > 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3000);
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error("Sync-Fehler", {
        description: "Synchronisierung fehlgeschlagen. Bitte erneut versuchen."
      });
    } finally {
      setSyncing(false);
    }
  }, [syncing, updatePendingCount]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync nach kurzer Verzögerung
      setTimeout(() => {
        updatePendingCount().then(() => {
          if (navigator.onLine) {
            handleSync();
          }
        });
      }, 500);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Initial check
    updatePendingCount();
    
    // Periodisches Update
    const interval = setInterval(updatePendingCount, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [updatePendingCount, handleSync]);

  // Nichts anzeigen wenn alles OK
  if (isOnline && pendingCount === 0 && !justSynced) return null;

  // Success-State nach Sync
  if (justSynced && pendingCount === 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white px-4 py-2 shadow-lg animate-in slide-in-from-top duration-300">
        <div className="container mx-auto flex items-center justify-center gap-2">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">Alle Einträge synchronisiert</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 ${
      isOnline 
        ? 'bg-amber-500 dark:bg-amber-600' 
        : 'bg-red-500 dark:bg-red-600'
    } text-white px-4 py-2 shadow-lg transition-colors duration-300`}>
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {isOnline ? (
            <CloudOff className="h-4 w-4 flex-shrink-0" />
          ) : (
            <WifiOff className="h-4 w-4 flex-shrink-0" />
          )}
          <span className="text-sm font-medium truncate">
            {isOnline 
              ? `${pendingCount} ${pendingCount === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Sync`
              : 'Offline – Einträge werden lokal gespeichert'
            }
          </span>
        </div>
        
        {isOnline && pendingCount > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSync}
            disabled={syncing}
            className="flex-shrink-0 bg-white/20 hover:bg-white/30 text-white border-0"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Jetzt </span>Sync
          </Button>
        )}
        
        {!isOnline && (
          <div className="flex items-center gap-1.5 text-white/80 text-xs flex-shrink-0">
            <Wifi className="h-3 w-3" />
            <span className="hidden sm:inline">Warte auf Verbindung...</span>
          </div>
        )}
      </div>
    </div>
  );
}
