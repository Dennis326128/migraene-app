import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAUpdate } from '@/hooks/usePWAUpdate';
import { cn } from '@/lib/utils';

export function PWAUpdateBanner() {
  const { needRefresh, updateServiceWorker } = usePWAUpdate();

  if (!needRefresh) return null;

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-[60] bg-primary text-primary-foreground",
      "px-4 py-3 shadow-lg animate-in slide-in-from-top duration-300",
      "safe-area-top"
    )}>
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Neue Version verfügbar
          </p>
          <p className="text-xs opacity-90">
            Aktualisieren für die neuesten Verbesserungen
          </p>
        </div>
        
        <Button
          size="sm"
          variant="secondary"
          onClick={updateServiceWorker}
          className="flex-shrink-0 bg-white/20 hover:bg-white/30 text-white border-0"
        >
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Aktualisieren
        </Button>
      </div>
    </div>
  );
}
