const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptLrn, decryptLrn, hashLrn, maskLrn } = require('../utils/encryption');
const Student = require('../models/Student');

test('encryption utility correctly encrypts, decrypts, hashes and masks LRN', () => {
  const sampleLrn = '123456789012';

  // 1. Encrypt
  const encrypted1 = encryptLrn(sampleLrn);
  const encrypted2 = encryptLrn(sampleLrn);

  assert.ok(encrypted1.startsWith('enc:v1:'));
  assert.ok(encrypted2.startsWith('enc:v1:'));
  // Different IVs mean different ciphertexts for the same plaintext
  assert.notEqual(encrypted1, encrypted2, 'Two encryptions should use random IVs and produce different ciphertexts');

  // 2. Decrypt
  assert.equal(decryptLrn(encrypted1), sampleLrn);
  assert.equal(decryptLrn(encrypted2), sampleLrn);

  // Legacy plaintext backwards compatibility
  assert.equal(decryptLrn('987654321012'), '987654321012');

  // 3. Blind Index Hash (HMAC-SHA256)
  const hash1 = hashLrn(sampleLrn);
  const hash2 = hashLrn(sampleLrn);
  const hashFromEncrypted = hashLrn(encrypted1);

  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2, 'Hash must be deterministic for indexing and searching');
  assert.equal(hash1, hashFromEncrypted, 'Hash from encrypted LRN must match plaintext hash');

  // 4. Masking
  assert.equal(maskLrn(sampleLrn), '123456******');
  assert.equal(maskLrn(encrypted1), '123456******');
});

test('Student model handles encrypted LRN creation and lookup', async () => {
  await Student.initTable();

  // Test findByLRN on an existing student
  const allStudents = await Student.findAll();
  assert.ok(allStudents.length > 0, 'Should find existing students');

  const firstStudent = allStudents[0];
  assert.ok(/^\d{12}$/.test(firstStudent.LRN), 'LRN must be decrypted to 12 digits');
  assert.equal(firstStudent.masked_lrn.length, 12);
  assert.ok(firstStudent.masked_lrn.endsWith('******'));

  // Lookup by LRN
  const found = await Student.findByLRN(firstStudent.LRN);
  assert.ok(found, 'Student must be found by LRN');
  assert.equal(found.student_id, firstStudent.student_id);
  assert.equal(found.LRN, firstStudent.LRN);
});
