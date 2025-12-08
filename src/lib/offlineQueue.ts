import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { toast } from 'sonner';

interface OfflineQueueDB extends DBSchema {
  'pending-entries': {
    key: string;
    value: {
      id: string;
      type: 'pain_entry' | 'medication' | 'voice_note';
      data: any;
      timestamp: number;
      retries: number;
    };
  };
  'sync-status': {
    key: 'main';
    value: {
      key: 'main';
      lastSync: number;
      pendingCount: number;
    };
  };
}

let db: IDBPDatabase<OfflineQueueDB> | null = null;

export async function initOfflineDB() {
  if (db) return db;
  
  db = await openDB<OfflineQueueDB>('migraine-offline', 1, {
    upgrade(db) {
      // Queue für unsyncte Einträge
      if (!db.objectStoreNames.contains('pending-entries')) {
        db.createObjectStore('pending-entries', { keyPath: 'id' });
      }
      
      // Sync-Status
      if (!db.objectStoreNames.contains('sync-status')) {
        db.createObjectStore('sync-status', { keyPath: 'key' });
      }
    },
  });
  
  return db;
}

export async function addToOfflineQueue(type: string, data: any) {
  const database = await initOfflineDB();
  const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await database.add('pending-entries', {
    id,
    type: type as any,
    data,
    timestamp: Date.now(),
    retries: 0,
  });
  
  // Update pending count
  await updateSyncStatus();
  
  toast.info("Offline-Modus", {
    description: "Eintrag wird synchronisiert, sobald Sie wieder online sind.",
  });
  
  return id;
}

export async function getPendingEntries() {
  const database = await initOfflineDB();
  return await database.getAll('pending-entries');
}

export async function removePendingEntry(id: string) {
  const database = await initOfflineDB();
  await database.delete('pending-entries', id);
  await updateSyncStatus();
}

export async function updateSyncStatus() {
  const database = await initOfflineDB();
  const pending = await database.getAll('pending-entries');
  
  await database.put('sync-status', {
    key: 'main',
    lastSync: Date.now(),
    pendingCount: pending.length,
  });
}

export async function syncPendingEntries() {
  if (!navigator.onLine) {
    console.log('Offline - skipping sync');
    return { success: 0, failed: 0 };
  }
  
  const pending = await getPendingEntries();
  let success = 0;
  let failed = 0;
  
  for (const entry of pending) {
    try {
      // Hier je nach Type entsprechende API aufrufen
      if (entry.type === 'pain_entry') {
        const { supabase } = await import('@/lib/supabaseClient');
        const { error } = await supabase
          .from('pain_entries')
          .insert(entry.data);
        
        if (error) throw error;
      }
      
      await removePendingEntry(entry.id);
      success++;
      
    } catch (error) {
      console.error('Sync failed for entry:', entry.id, error);
      failed++;
      
      // Max 3 Retries
      if (entry.retries >= 3) {
        await removePendingEntry(entry.id);
        toast.error("Sync fehlgeschlagen", {
          description: "Eintrag konnte nicht synchronisiert werden"
        });
      } else {
        const database = await initOfflineDB();
        await database.put('pending-entries', {
          ...entry,
          retries: entry.retries + 1
        });
      }
    }
  }
  
  if (success > 0) {
    toast.success("Synchronisiert", {
      description: `${success} Einträge erfolgreich hochgeladen`
    });
  }
  
  return { success, failed };
}
