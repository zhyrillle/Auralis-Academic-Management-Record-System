import db from './db';

const listeners = new Set();
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isSyncing = false;
let lastSyncedAt = null;

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('[SyncManager] Listener error:', err);
    }
  });
}

// Network event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    notify();
    // Automatically trigger outbox flush when connectivity returns
    processOutbox().catch((err) => console.warn('[SyncManager] Auto-sync failed:', err));
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    notify();
  });
}

/**
 * Subscribe to sync state changes (online/offline, pending count, syncing state)
 */
export function subscribeSyncStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Get current sync state snapshot
 */
export async function getSyncSnapshot() {
  const pendingCount = await db.outbox.where('status').equals('pending').count();
  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncedAt,
  };
}

/**
 * Save an API response to persistent IndexedDB cache
 */
export async function setPersistentCache(key, data, ttlMs = 24 * 60 * 60 * 1000) {
  try {
    await db.cache.put({
      key,
      data,
      updatedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  } catch (err) {
    console.warn('[SyncManager] Failed to cache data:', err.message);
  }
}

/**
 * Read cached API response from persistent IndexedDB
 */
export async function getPersistentCache(key) {
  try {
    const entry = await db.cache.get(key);
    if (!entry) return undefined;
    return entry.data;
  } catch (err) {
    console.warn('[SyncManager] Failed to read cached data:', err.message);
    return undefined;
  }
}

/**
 * Queue a mutation (save score, mark attendance, update record) to be sent when online
 */
export async function enqueueMutation({ url, method = 'POST', headers = {}, body = null, label = '' }) {
  try {
    const serializedBody = typeof body === 'object' && body !== null ? JSON.stringify(body) : body;
    const finalHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

    await db.outbox.add({
      url,
      method: method.toUpperCase(),
      headers: finalHeaders,
      body: serializedBody,
      label: label || `${method} ${url}`,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
    });

    notify();
    console.log(`[SyncManager] Mutation queued offline: ${method} ${url}`);
  } catch (err) {
    console.error('[SyncManager] Failed to enqueue mutation:', err);
  }
}

/**
 * Flush all pending mutations to the backend server in FIFO order
 */
export async function processOutbox() {
  if (isSyncing || !isOnline) return;

  isSyncing = true;
  notify();

  try {
    const pendingItems = await db.outbox
      .where('status')
      .equals('pending')
      .sortBy('timestamp');

    if (pendingItems.length === 0) {
      isSyncing = false;
      notify();
      return;
    }

    console.log(`[SyncManager] Syncing ${pendingItems.length} queued offline mutations...`);

    for (const item of pendingItems) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });

        if (response.ok || response.status === 409) {
          // Success or already applied conflict
          await db.outbox.delete(item.id);
          console.log(`[SyncManager] Successfully synced: ${item.label}`);
        } else if (response.status >= 400 && response.status < 500) {
          // Client error - record failure
          const errText = await response.text().catch(() => '');
          console.error(`[SyncManager] Server rejected mutation (${response.status}):`, errText);
          if (item.retryCount >= 3) {
            await db.outbox.update(item.id, { status: 'failed', error: errText });
          } else {
            await db.outbox.update(item.id, { retryCount: item.retryCount + 1 });
          }
        } else {
          // Server error 5xx - keep pending to retry later
          break;
        }
      } catch (networkErr) {
        // Still no connectivity or backend is temporarily down
        console.warn('[SyncManager] Connection interrupted during sync:', networkErr.message);
        break;
      }
    }

    lastSyncedAt = Date.now();
    await db.syncMeta.put({ key: 'lastSyncedAt', value: lastSyncedAt });
  } catch (err) {
    console.error('[SyncManager] Process outbox unexpected error:', err);
  } finally {
    isSyncing = false;
    notify();
  }
}

export default {
  subscribeSyncStatus,
  getSyncSnapshot,
  setPersistentCache,
  getPersistentCache,
  enqueueMutation,
  processOutbox,
};
