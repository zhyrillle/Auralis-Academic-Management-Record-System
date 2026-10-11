const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(failure) {
  const routes = new Map(), middleware = [], calls = [];
  const resolveCurrentUser = () => {};
  const model = new Proxy({}, { get: (_, name) => async query => {
    calls.push({ name, query });
    if (failure) throw failure;
    return { mode: 'preview', students: [], unavailable: [], automaticAlertsEnabled: false };
  } });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/atRiskPredictionRoutes.js'), 'utf8'), {
    module: { exports: {} }, console,
    require: name => {
      if (name === 'express') return { Router: () => ({ use: fn => middleware.push(fn), get: (url, fn) => routes.set(url, fn) }) };
      if (name === '../models/AtRiskPrediction') return model;
      if (name === '../middleware/resolveCurrentUser') return { resolveCurrentUser };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const res = () => ({ statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  return { routes, middleware, calls, resolveCurrentUser, res };
}

test('all preview routes use identity middleware and deny non-principal roles', () => {
  const h = harness(); assert.equal(h.middleware[0], h.resolveCurrentUser);
  const response = h.res(); let passed = false;
  h.middleware[1]({ currentUser: { normalized_role: 'subject_teacher' } }, response, () => { passed = true; });
  assert.equal(response.statusCode, 403); assert.equal(passed, false);
  h.middleware[1]({ currentUser: { normalized_role: 'principal' } }, h.res(), () => { passed = true; });
  assert.equal(passed, true);
});

test('preview endpoint is read-only, no-store, and preserves period filters', async () => {
  const h = harness(), response = h.res();
  const query = { schoolYear: '2026-2027', term: 'T2' };
  await h.routes.get('/preview')({ query }, response);
  assert.equal(response.body.automaticAlertsEnabled, false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(h.calls[0].query, query);
});

test('source failures are 503, never an empty success or sample learners', async () => {
  const h = harness(new Error('SQL problem')), response = h.res();
  await h.routes.get('/preview')({ query: {} }, response);
  assert.equal(response.statusCode, 503); assert.equal(response.body.code, 'PREDICTION_UNAVAILABLE');
  assert.equal(response.body.students, undefined);
});

test('bad risk filters fail before invoking the model', async () => {
  const h = harness(), response = h.res();
  await h.routes.get('/students')({ query: { riskLevel: 'danger' } }, response);
  assert.equal(response.statusCode, 400); assert.equal(h.calls.length, 0);
});
