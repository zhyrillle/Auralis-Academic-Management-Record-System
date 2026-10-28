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

// Cached reads can be rebuilt. Older unsent work must never be deleted or
// attributed to whoever happens to sign in during this upgrade.
db.version(3).stores({
  cache: 'key, sessionId, updatedAt, expiresAt',
  outbox: '++id, ownerId, [ownerId+status], endpoint, method, timestamp, status',
  syncMeta: 'key',
  offlineScores: '++id, ownerId, mutationId, [subject_offering_id+term], student_id, assessment_id, timestamp, status',
}).upgrade(async transaction => {
  await transaction.table('cache').clear();
  await transaction.table('outbox').toCollection().modify(item => {
    if (!item.ownerId) {
      item.status = 'requires-review';
      item.error = 'This older offline change has no recorded account owner.';
    }
  });
});

db.version(4).stores({
  cache: 'key, sessionId, updatedAt, expiresAt',
  outbox: '++id, ownerId, [ownerId+status], endpoint, method, timestamp, status',
  syncMeta: 'key',
  offlineScores: '++id, ownerId, mutationId, [subject_offering_id+term], student_id, assessment_id, timestamp, status',
  offlineAttendance: '++id, ownerId, mutationId, section_id, [section_id+attendance_date], student_section_id, timestamp, status',
});


export default db;

