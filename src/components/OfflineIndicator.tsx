import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncPendingEntries, getPendingEntries } from '@/lib/offlineQueue';
import { toast } from 'sonner';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    const updatePendingCount = async () => {
      const pending = await getPendingEntries();
      setPendingCount(pending.length);
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);

    // Auto-Sync wenn wieder online
    const handleOnline = async () => {
      setIsOnline(true);
      const pending = await getPendingEntries();
      if (pending.length > 0) {
        await handleSync();
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncPendingEntries();
      if (result.success > 0) {
        setPendingCount(0);
      }
    } catch (error) {
      toast.error("Sync-Fehler", {
        description: "Synchronisierung fehlgeschlagen"
      });
    } finally {
      setSyncing(false);
    }
  };

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 ${
      isOnline ? 'bg-orange-500' : 'bg-red-500'
    } text-white px-4 py-2 shadow-lg`}>
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">
            {isOnline 
              ? `${pendingCount} Einträge warten auf Synchronisierung`
              : 'Offline-Modus aktiv'
            }
          </span>
        </div>
        
        {isOnline && pendingCount > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Jetzt synchronisieren
          </Button>
        )}
      </div>
    </div>
  );
}
