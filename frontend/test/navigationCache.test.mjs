import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, cacheKey, clearNavigationCache, getCachedData, loadCached } from '../src/services/navigationCache.js';
import { filterRiskPreview } from '../src/utils/filterRiskPreview.js';

let user = { user_id: 1, role: 'principal' };
const storage = new Map();
globalThis.localStorage = { getItem: key => key === 'user' ? JSON.stringify(user) : storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };

test('loaded terms are reused, filters have distinct keys and concurrent reads are shared', async () => {
  clearNavigationCache();
  let calls = 0;
  const loader = async () => { calls += 1; return { count: calls }; };
  const key = cacheKey('risk', { year: '2026', term: 'T2' });
  const [a, b] = await Promise.all([loadCached(key, loader), loadCached(key, loader)]);
  assert.deepEqual(a, b);
  await loadCached(key, loader);
  assert.equal(calls, 1);
  await loadCached(cacheKey('risk', { term: 'T3', year: '2026' }), loader);
  assert.equal(calls, 2);
  assert.equal(key, cacheKey('risk', { term: 'T2', year: '2026' }));
  await loadCached(key, loader, { force: true });
  assert.equal(calls, 3);
});

test('expired results remain displayable but refresh when requested', async () => {
  clearNavigationCache();
  const originalNow = Date.now;
  let clock = 1000, calls = 0;
  Date.now = () => clock;
  try {
    await loadCached('expires', async () => ++calls);
    clock += 120_001;
    assert.equal(getCachedData('expires'), 1);
    await loadCached('expires', async () => ++calls);
    assert.equal(calls, 2);
  } finally { Date.now = originalNow; }
});

test('errors are not successful cache entries and retry can recover', async () => {
  clearNavigationCache();
  await assert.rejects(loadCached('failure', async () => { throw new Error('offline'); }), /offline/);
  assert.equal(getCachedData('failure'), undefined);
  assert.equal(await loadCached('failure', async () => 'recovered'), 'recovered');
});

test('switching user or role clears previously loaded records', async () => {
  clearNavigationCache();
  await loadCached('private', async () => 'first-user');
  user = { user_id: 2, role: 'principal' };
  assert.equal(getCachedData('private'), undefined);
  await loadCached('private', async () => 'second-user');
  user = { user_id: 2, role: 'system_admin' };
  assert.equal(getCachedData('private'), undefined);
});

test('successful saves invalidate views; reads and failed saves do not', async () => {
  clearNavigationCache();
  const originalFetch = globalThis.fetch;
  try {
    await loadCached('records', async () => [1]);
    globalThis.fetch = async () => ({ ok: true });
    await apiFetch('/records');
    assert.deepEqual(getCachedData('records'), [1]);
    globalThis.fetch = async () => ({ ok: false });
    await apiFetch('/records', { method: 'PUT' });
    assert.deepEqual(getCachedData('records'), [1]);
    globalThis.fetch = async () => ({ ok: true });
    await apiFetch('/records', { method: 'PUT' });
    assert.equal(getCachedData('records'), undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('a save during an in-flight read prevents its old data from entering the cache', async () => {
  clearNavigationCache();
  let finish, started, calls = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const loader = () => ++calls === 1 ? new Promise(resolve => { finish = resolve; started(); }) : Promise.resolve('new');
  const pending = loadCached('racing', loader);
  await ready;
  clearNavigationCache();
  finish('old');
  assert.equal(await pending, 'new');
  assert.equal(getCachedData('racing'), 'new');
});

test('grade filtering recalculates counts without treating unscored learners as low risk', () => {
  const data = {
    students: [{ grade: 8, riskLevel: 'low' }, { grade: 9, riskLevel: 'high' }],
    unavailable: [{ grade: 8 }], summary: {}, gradeBreakdown: [{ grade: 'Grade 8' }, { grade: 'Grade 9' }],
  };
  const grade8 = filterRiskPreview(data, '8');
  assert.equal(grade8.summary.lowRisk, 1);
  assert.equal(grade8.summary.highRisk, 0);
  assert.equal(grade8.summary.total, 1);
  assert.equal(grade8.summary.totalEnglish, 2);
  assert.equal(grade8.summary.unavailable, 1);
  assert.equal(grade8.gradeBreakdown.length, 1);
  assert.equal(filterRiskPreview(data, 'all'), data);
  assert.equal(data.students.length, 2);
});

test('late responses from a previous session are cancelled without publishing a page error', async () => {
  await clearNavigationCache();
  let finish, started;
  const ready = new Promise(resolve => { started = resolve; });
  const obsolete = loadCached('session-change', () => new Promise(resolve => { finish = resolve; started(); }));
  await ready;
  user = { user_id: 3, role: 'principal' };
  await loadCached('session-change', async () => 'current-account');
  finish('previous-account');
  await assert.rejects(obsolete, error => error.name === 'AbortError' && error.code === 'SESSION_CHANGED');
  assert.equal(getCachedData('session-change'), 'current-account');
});
