import Dexie from 'dexie';

/**
 * Client-Side IndexedDB Database for Auralis
 * Stores:
 * - cache: Cached API responses for instant offline reading (0ms loading)
 * - outbox: Queued mutations (grades, attendance, scores) performed while offline
 * - offlineScores: Dedicated offline score tracking for Class Record
 * - syncMeta: Metadata such as last sync timestamps
 */
export const db = new Dexie('AuralisOfflineDB');

db.version(1).stores({
  cache: 'key, updatedAt, expiresAt',
  outbox: '++id, endpoint, method, timestamp, status',
  syncMeta: 'key',
});

db.version(2).stores({
  cache: 'key, updatedAt, expiresAt',
  outbox: '++id, endpoint, method, timestamp, status',
  syncMeta: 'key',
  offlineScores: '++id, [subject_offering_id+term], student_id, assessment_id, timestamp, status',
});

export default db;
