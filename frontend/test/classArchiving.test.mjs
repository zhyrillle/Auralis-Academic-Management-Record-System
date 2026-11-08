import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Load the actual service with isolated auth and transport dependencies.
function harness({ user = { user_id: 7 }, status = 200, data = [] } = {}) {
  const calls = [];
  let source = fs.readFileSync(new URL('../src/services/sectionService.js', import.meta.url), 'utf8');
  const names = [...source.matchAll(/export const (\w+)/g)].map(match => match[1]);
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/export const /g, 'const ');
  const module = { exports: {} };
  vm.runInNewContext(`${source}\nmodule.exports = { ${names.join(',')} };`, {
    module, console, URLSearchParams, API_BASE_URL: 'https://test.invalid/api',
    getStoredUser: () => user,
    cachedApiFetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: status >= 200 && status < 300, status, json: async () => data };
    },
  });
  return { calls, service: module.exports };
}

test('archive and restore send the current user header and omit body identity', async () => {
  const { calls, service } = harness({ data: { success: true } });
  for (const action of [service.archiveClass, service.restoreClass]) {
    await action({ userId: 999, assignmentType: 'teaching', assignmentId: 21, sectionId: 3 });
  }
  assert.equal(calls.length, 2);
  for (const { options } of calls) {
    assert.equal(options.headers['X-Auralis-User-Id'], '7');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.queueOffline, false);
    const body = JSON.parse(options.body);
    assert.equal(body.userId, undefined);
    assert.equal(body.assignmentId, 21);
  }
});

test('signed-out users cannot queue archive or restore requests', async () => {
  const { calls, service } = harness({ user: null });
  await assert.rejects(service.archiveClass({}), /sign in/);
  await assert.rejects(service.restoreClass({}), /sign in/);
  assert.equal(calls.length, 0);
});

test('failed class reads surface an error instead of returning unfiltered directory assignments', async () => {
  for (const status of [401, 403, 500]) {
    const { calls, service } = harness({ status, data: { error: 'Classes unavailable' } });
    await assert.rejects(service.getArchivedSections(7), /Classes unavailable/);
    assert.equal(calls.length, 1);
    assert(!calls[0].url.includes('/users'));
  }
});

test('active, archived, and all-class reads preserve archive filters and assignment identities', async () => {
  const fixture = { id: 'teaching-21', assignmentType: 'teaching', assignmentId: 21,
    section_id: 3, school_year_id: 1, grade_level_name: 'Grade 7', is_archived: true };
  const { calls, service } = harness({ data: [fixture] });
  for (const [options, expected] of [[{}, 'false'], [{ archived: true }, 'true'], [{ archived: 'all' }, 'all']]) {
    const [row] = await service.getAdviserSections(7, options);
    assert.equal(row.id, fixture.id);
    assert.equal(row.school_year_id, 1);
    assert.equal(row.is_archived, true);
    assert.equal(row.gradeLevel, 'G7');
    assert.equal(new URL(calls.at(-1).url).searchParams.get('archived'), expected);
  }
});

test('an invalid classes response is not reported as an empty successful result', async () => {
  const { service } = harness({ data: { message: 'Malformed response' } });
  await assert.rejects(service.getAdviserSections(7), /could not be loaded/);
});
