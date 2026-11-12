import test from 'node:test';
import assert from 'node:assert/strict';

// Set up mock window, navigator, and localStorage for Node test runner
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
}

const mockStorage = {};
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mockStorage, k) ? mockStorage[k] : null),
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
  };
}

test('hashCredentials produces deterministic hashes and normalizes email casing/spacing', async () => {
  const { hashCredentials } = await import('../src/utils/auth.js');

  const hash1 = await hashCredentials('Teacher@DepEd.Gov.ph ', 'SecurePass123!');
  const hash2 = await hashCredentials('teacher@deped.gov.ph', 'SecurePass123!');
  const hash3 = await hashCredentials('teacher@deped.gov.ph', 'DifferentPass');

  assert.ok(hash1, 'Hash should not be empty');
  assert.strictEqual(hash1, hash2, 'Case and whitespace variations of email must produce identical hashes');
  assert.notStrictEqual(hash1, hash3, 'Different passwords must produce different hashes');
});

test('saveOfflineCredentials and verifyOfflineCredentials allow offline authentication', async () => {
  const { saveOfflineCredentials, verifyOfflineCredentials, hasOfflineAccount } = await import('../src/utils/auth.js');

  const testUser = {
    user_id: 42,
    email: 'adviser@deped.gov.ph',
    firstName: 'Maria',
    lastName: 'Santos',
    role: 'adviser',
    is_adviser: true,
  };

  assert.strictEqual(hasOfflineAccount('adviser@deped.gov.ph'), false);

  // Save credentials
  await saveOfflineCredentials(testUser, 'adviser@deped.gov.ph', 'CorrectPassword123');

  assert.strictEqual(hasOfflineAccount('adviser@deped.gov.ph'), true);
  assert.strictEqual(hasOfflineAccount('ADVISER@DEPED.GOV.PH'), true);
  assert.strictEqual(hasOfflineAccount('stranger@deped.gov.ph'), false);

  // Verification with correct password
  const verified = await verifyOfflineCredentials('adviser@deped.gov.ph', 'CorrectPassword123');
  assert.ok(verified, 'Verification must succeed with correct credentials');
  assert.strictEqual(verified.user_id, 42);
  assert.strictEqual(verified.role, 'adviser');

  // Verification with incorrect password
  const failed = await verifyOfflineCredentials('adviser@deped.gov.ph', 'WrongPassword');
  assert.strictEqual(failed, null, 'Verification must fail with incorrect password');
});

test('classRecordApi synthesizes resilient fallback when network fails and student roster is cached', async () => {
  localStorage.setItem('user', JSON.stringify({ user_id: 42, role: 'teacher' }));
  const { getClassRecord } = await import('../src/services/classRecordApi.js');

  // Seed cached students for section 999
  const sectionId = 999;
  const mockStudents = [
    { student_id: 101, student_section_id: 501, lrn: '123456789012', first_name: 'Juan', last_name: 'Dela Cruz', sex: 'M' },
    { student_id: 102, student_section_id: 502, lrn: '123456789013', first_name: 'Ana', last_name: 'Reyes', sex: 'F' },
  ];
  localStorage.setItem(`auralis_students_section_${sectionId}`, JSON.stringify(mockStudents));

  // Mock global fetch to simulate complete network disconnection
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  try {
    const offeringId = 888;
    const record = await getClassRecord(offeringId, 'T1', sectionId);

    assert.ok(record, 'Record should be synthesized rather than throwing Failed to fetch');
    assert.ok(record.class_context, 'Record must include class_context');
    assert.strictEqual(record.class_context.term, 'T1');
    assert.strictEqual(Array.isArray(record.students), true);
    assert.strictEqual(record.students.length, 2);
    assert.strictEqual(record.students[0].first_name, 'Juan');
    assert.strictEqual(record.students[1].last_name, 'Reyes');
    assert.strictEqual(Array.isArray(record.assessments), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
