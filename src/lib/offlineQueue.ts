import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';

interface OfflineQueueDB extends DBSchema {
  'pending-entries': {
    key: string;
    value: {
      id: string;
      type: 'pain_entry' | 'medication' | 'voice_note' | 'reminder';
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
let syncInProgress = false;

export async function initOfflineDB() {
  if (db) return db;
  
  try {
    db = await openDB<OfflineQueueDB>('migraine-offline', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending-entries')) {
          db.createObjectStore('pending-entries', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync-status')) {
          db.createObjectStore('sync-status', { keyPath: 'key' });
        }
      },
    });
    
    console.log('📦 Offline DB initialized');
    return db;
  } catch (error) {
    console.error('Failed to init offline DB:', error);
    return null;
  }
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
    console.log('📴 Offline - skipping sync');
    return { success: 0, failed: 0 };
  }
  
  if (syncInProgress) {
    console.log('🔄 Sync already in progress');
    return { success: 0, failed: 0 };
  }
  
  syncInProgress = true;
  
  try {
    const pending = await getPendingEntries();
    if (pending.length === 0) {
      return { success: 0, failed: 0 };
    }
    
    console.log(`🔄 Syncing ${pending.length} pending entries...`);
    let success = 0;
    let failed = 0;
    
    for (const entry of pending) {
      try {
        if (entry.type === 'pain_entry') {
          // UPSERT um Duplikate zu vermeiden
          const { error } = await supabase
            .from('pain_entries')
            .upsert(entry.data, {
              onConflict: 'user_id,selected_date,selected_time',
              ignoreDuplicates: false
            });
          
          if (error) throw error;
        } else if (entry.type === 'medication') {
          const { error } = await supabase
            .from('user_medications')
            .insert(entry.data);
          if (error) throw error;
        } else if (entry.type === 'reminder') {
          const { error } = await supabase
            .from('reminders')
            .insert(entry.data);
          if (error) throw error;
        }
        
        await removePendingEntry(entry.id);
        success++;
        
      } catch (error: any) {
        console.error('Sync failed for entry:', entry.id, error);
        failed++;
        
        // Bei Duplikat-Fehler: als erfolgreich markieren (Eintrag existiert bereits)
        if (error?.code === '23505') {
          console.log('Entry already exists, removing from queue');
          await removePendingEntry(entry.id);
          success++;
          failed--;
          continue;
        }
        
        // Max 5 Retries
        if (entry.retries >= 5) {
          await removePendingEntry(entry.id);
          toast.error("Sync fehlgeschlagen", {
            description: "Ein Eintrag konnte nicht synchronisiert werden und wurde verworfen."
          });
        } else {
          const database = await initOfflineDB();
          if (database) {
            await database.put('pending-entries', {
              ...entry,
              retries: entry.retries + 1
            });
          }
        }
      }
    }
    
    if (success > 0) {
      toast.success("Synchronisiert", {
        description: `${success} ${success === 1 ? 'Eintrag' : 'Einträge'} erfolgreich hochgeladen`
      });
    }
    
    return { success, failed };
  } finally {
    syncInProgress = false;
  }
}

// Auto-sync bei Online-Event
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    console.log('🌐 Back online - triggering sync...');
    // Kurze Verzögerung um sicherzustellen, dass Verbindung stabil ist
    setTimeout(async () => {
      if (navigator.onLine) {
        await syncPendingEntries();
      }
    }, 1000);
  });
}
