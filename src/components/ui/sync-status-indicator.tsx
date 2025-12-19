/**
 * Sync Status Indicator
 * Shows a subtle indicator when there are pending saves
 */

import React from "react";
import { useSyncStatus } from "@/lib/performance/optimisticSave";
import { Loader2, AlertCircle, Check, Cloud, CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncStatusIndicatorProps {
  className?: string;
  showWhenIdle?: boolean;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  className,
  showWhenIdle = false,
}) => {
  const { pendingCount, hasFailed, isSyncing, retryFailed } = useSyncStatus();
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Don't show if idle and showWhenIdle is false
  if (!isSyncing && !hasFailed && !showWhenIdle && isOnline) {
    return null;
  }

  // Offline indicator
  if (!isOnline) {
    return (
      <div className={cn(
        "flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400",
        className
      )}>
        <CloudOff className="w-3.5 h-3.5" />
        <span>Offline</span>
        {pendingCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded text-[10px] font-medium">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  // Failed state
  if (hasFailed) {
    return (
      <button
        onClick={retryFailed}
        className={cn(
          "flex items-center gap-1.5 text-xs text-destructive hover:underline",
          className
        )}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Sync fehlgeschlagen</span>
        <span className="text-[10px]">(Klick zum Wiederholen)</span>
      </button>
    );
  }

  // Syncing state
  if (isSyncing) {
    return (
      <div className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Synchronisiere...</span>
        {pendingCount > 1 && (
          <span className="text-[10px]">({pendingCount})</span>
        )}
      </div>
    );
  }

  // Idle/synced state (only if showWhenIdle)
  if (showWhenIdle) {
    return (
      <div className={cn(
        "flex items-center gap-1.5 text-xs text-success",
        className
      )}>
        <Cloud className="w-3.5 h-3.5" />
        <span>Synchronisiert</span>
      </div>
    );
  }

  return null;
};

export default SyncStatusIndicator;
