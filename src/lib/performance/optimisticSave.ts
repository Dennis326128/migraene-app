/**
 * Optimistic Save System
 * 
 * Provides non-blocking saves with:
 * - Immediate UI updates (optimistic)
 * - Background persistence to Supabase
 * - Automatic retry on failure
 * - Offline queue integration
 * - User-visible sync status
 */

import { toast } from "sonner";
import { addToOfflineQueue, syncPendingEntries } from "@/lib/offlineQueue";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SaveOperation = {
  id: string;
  type: 'pain_entry' | 'medication' | 'reminder' | 'voice_note' | 'effect_rating';
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  data: any;
  createdAt: number;
  lastError?: string;
  retryCount: number;
};

export type OptimisticSaveOptions = {
  /** Show toast on success (default: true) */
  showSuccessToast?: boolean;
  /** Success toast message */
  successMessage?: string;
  /** Show toast on error (default: true) */
  showErrorToast?: boolean;
  /** Error toast message */
  errorMessage?: string;
  /** Callback on success */
  onSuccess?: (result: any) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY PENDING OPERATIONS (for UI status)
// ═══════════════════════════════════════════════════════════════════════════

const pendingOperations = new Map<string, SaveOperation>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(fn => fn());
}

/**
 * Subscribe to pending operations changes
 */
export function subscribeToPendingOps(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Get count of pending operations
 */
export function getPendingCount(): number {
  return Array.from(pendingOperations.values()).filter(
    op => op.status === 'pending' || op.status === 'syncing'
  ).length;
}

/**
 * Get all pending operations (for debug/status UI)
 */
export function getPendingOperations(): SaveOperation[] {
  return Array.from(pendingOperations.values());
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTIMISTIC SAVE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Perform an optimistic save that doesn't block the UI
 * 
 * @param type - Type of operation
 * @param saveFn - Async function that performs the actual save
 * @param options - Configuration options
 * @returns Generated operation ID
 * 
 * @example
 * ```ts
 * // In a save handler:
 * const opId = await optimisticSave(
 *   'pain_entry',
 *   async () => {
 *     return await supabase.from('pain_entries').insert(data);
 *   },
 *   { 
 *     successMessage: 'Eintrag gespeichert',
 *     onSuccess: () => closeModal()
 *   }
 * );
 * ```
 */
export async function optimisticSave<T>(
  type: SaveOperation['type'],
  saveFn: () => Promise<T>,
  options: OptimisticSaveOptions = {}
): Promise<string> {
  const {
    showSuccessToast = true,
    successMessage = 'Gespeichert',
    showErrorToast = true,
    errorMessage = 'Speichern fehlgeschlagen',
    onSuccess,
    onError,
    maxRetries = 3,
  } = options;

  // Generate unique operation ID
  const opId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  // Create pending operation
  const operation: SaveOperation = {
    id: opId,
    type,
    status: 'pending',
    data: null,
    createdAt: Date.now(),
    retryCount: 0,
  };
  
  pendingOperations.set(opId, operation);
  notifyListeners();

  // Execute save in background
  executeSave(opId, saveFn, {
    showSuccessToast,
    successMessage,
    showErrorToast,
    errorMessage,
    onSuccess,
    onError,
    maxRetries,
  });

  return opId;
}

async function executeSave<T>(
  opId: string,
  saveFn: () => Promise<T>,
  options: Required<Omit<OptimisticSaveOptions, 'onSuccess' | 'onError'>> & Pick<OptimisticSaveOptions, 'onSuccess' | 'onError'>
): Promise<void> {
  const operation = pendingOperations.get(opId);
  if (!operation) return;

  operation.status = 'syncing';
  notifyListeners();

  try {
    // Check if online
    if (!navigator.onLine) {
      throw new Error('OFFLINE');
    }

    const result = await saveFn();
    
    // Success
    operation.status = 'synced';
    notifyListeners();
    
    if (options.showSuccessToast) {
      toast.success(options.successMessage);
    }
    
    options.onSuccess?.(result);
    
    // Remove from pending after short delay
    setTimeout(() => {
      pendingOperations.delete(opId);
      notifyListeners();
    }, 2000);
    
  } catch (error: any) {
    console.error(`[OptimisticSave] Failed for ${opId}:`, error);
    
    operation.lastError = error.message || 'Unknown error';
    operation.retryCount++;
    
    // Check if should retry
    const isOffline = error.message === 'OFFLINE' || !navigator.onLine;
    const isNetworkError = error.message?.includes('fetch') || error.message?.includes('network');
    
    if (isOffline || isNetworkError) {
      // Add to offline queue for later sync
      operation.status = 'pending';
      notifyListeners();
      
      // Queue for background sync
      await addToOfflineQueue(operation.type, operation.data || {});
      
      toast.info('Offline-Modus', {
        description: 'Wird synchronisiert, sobald Sie wieder online sind.',
      });
      
    } else if (operation.retryCount < options.maxRetries) {
      // Retry with exponential backoff
      operation.status = 'pending';
      notifyListeners();
      
      const delay = Math.min(1000 * Math.pow(2, operation.retryCount - 1), 10000);
      setTimeout(() => executeSave(opId, saveFn, options), delay);
      
    } else {
      // Final failure
      operation.status = 'failed';
      notifyListeners();
      
      if (options.showErrorToast) {
        toast.error(options.errorMessage, {
          description: 'Bitte versuchen Sie es erneut.',
          action: {
            label: 'Wiederholen',
            onClick: () => {
              operation.retryCount = 0;
              executeSave(opId, saveFn, options);
            },
          },
        });
      }
      
      options.onError?.(error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK SAVE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Non-blocking save that immediately returns
 * Use when you don't need to wait for the save result
 */
export function saveInBackground<T>(
  type: SaveOperation['type'],
  saveFn: () => Promise<T>,
  options: OptimisticSaveOptions = {}
): void {
  // Fire and forget
  optimisticSave(type, saveFn, options);
}

/**
 * Retry all failed operations
 */
export async function retryFailedOperations(): Promise<void> {
  // First, sync any items in offline queue
  await syncPendingEntries();
  
  // Clear failed operations from memory
  for (const [id, op] of pendingOperations) {
    if (op.status === 'failed') {
      pendingOperations.delete(id);
    }
  }
  notifyListeners();
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC STATUS HOOK
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';

/**
 * React hook to get sync status
 */
export function useSyncStatus() {
  const [pendingCount, setPendingCount] = useState(getPendingCount());
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    const update = () => {
      setPendingCount(getPendingCount());
      setHasFailed(
        Array.from(pendingOperations.values()).some(op => op.status === 'failed')
      );
    };

    const unsubscribe = subscribeToPendingOps(update);
    return unsubscribe;
  }, []);

  return {
    pendingCount,
    hasFailed,
    isSyncing: pendingCount > 0,
    retryFailed: retryFailedOperations,
  };
}
