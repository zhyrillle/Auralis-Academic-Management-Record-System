const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const testingWindow = require('../config/feedbackTestingWindow');

// All dependencies are replaced: these checks never connect to school databases.
function harness({ now = '2026-10-29T12:00:00+08:00', config = testingWindow,
  status = 'ONGOING', existing = false, noSchoolYear = false } = {}) {
  const routes = new Map();
  const state = { created: 0, duplicateChecks: 0, queries: [] };
  const year = { school_year_id: 3, starts_on: '2026-06-01', ends_on: '2027-03-31', status };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const router = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method,
    (url, handler) => routes.set(`${method} ${url}`, handler)]));
  const database = { async execute(sql) {
    state.queries.push(sql);
    assert.match(sql, /^SELECT\b/, 'Calendar lookup must not change school records.');
    if (sql.includes('FROM SCHOOL_YEAR')) return [noSchoolYear ? [] : [year]];
    if (sql.includes('FROM ACADEMIC_TERM')) return [[{ ends_at: '2027-03-31T15:59:59.999Z' }]];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const feedback = {
    async getEvalueeStats() { return {}; },
    async checkExistingFeedback(...args) {
      state.duplicateChecks++;
      state.duplicateArguments = args;
      return existing;
    },
    async create() { state.created++; return 999; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/feedbackRoutes.js'), 'utf8'), {
    Date: Clock, module: { exports: {} }, console: { error() {} },
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === '../config/db') return database;
      if (name === '../models/Feedback') return feedback;
      if (name === '../config/feedbackTestingWindow') return config;
      if (name === '../services/cloudSyncService') return {
        async syncFeedbackFromCloud() {}, async forwardFeedbackToCloud() {},
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { state, year, async run(method = 'get', url = '/window-status') {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await routes.get(`${method} ${url}`)({
      query: {}, params: { userId: 10 }, body: { evaluator_id: 10, evaluee_id: 20 },
    }, res);
    return res;
  } };
}

test('shows the approved Philippine testing dates without changing school calendar dates', async () => {
  const h = harness();
  const { body } = await h.run();
  assert.equal(body.status, 'OPEN');
  assert.equal(body.can_submit, true);
  assert.equal(body.is_testing_window, true);
  assert.equal(body.time_zone, 'Asia/Manila');
  assert.equal(body.window_opens_at, '2026-10-28T16:00:00.000Z');
  assert.equal(body.deadline_at, '2026-11-05T15:59:59.999Z');
  assert.equal(body.formatted_window_open, 'October 29, 2026');
  assert.equal(body.formatted_deadline, 'November 5, 2026');
  assert.equal(body.formatted_deadline_time, '11:59 PM');
  assert.equal(body.school_year_starts_on, '2026-06-01T00:00:00.000Z');
  assert.equal(body.school_year_ends_on, '2027-03-31T15:59:59.999Z');
});

for (const [now, status, allowed] of [
  ['2026-10-28T23:59:59.999+08:00', 'UPCOMING', false],
  ['2026-10-29T00:00:00.000+08:00', 'OPEN', true],
  ['2026-11-05T23:59:59.999+08:00', 'OPEN', true],
  ['2026-11-06T00:00:00.000+08:00', 'CLOSED', false],
]) {
  test(`display and submission enforce ${status} at ${now}`, async () => {
    const h = harness({ now });
    const display = await h.run();
    assert.equal(display.body.status, status);
    assert.equal(display.body.can_submit, allowed);
    const submission = await h.run('post', '/');
    assert.equal(submission.statusCode, allowed ? 201 : 403);
    assert.equal(h.state.created, allowed ? 1 : 0);
  });
}

test('stats and the status endpoint use the same testing calendar', async () => {
  const h = harness();
  const display = await h.run();
  const stats = await h.run('get', '/stats/:userId');
  assert.equal(stats.body.window_status.deadline_at, display.body.deadline_at);
  assert.equal(stats.body.window_status.can_submit, display.body.can_submit);
});

test('testing keeps the once-per-school-year duplicate check', async () => {
  const h = harness({ existing: true });
  const result = await h.run('post', '/');
  assert.equal(result.statusCode, 400);
  assert.match(result.body.error, /already submitted feedback/);
  assert.equal(h.state.duplicateChecks, 1);
  assert.equal(h.state.created, 0);
  assert.equal(h.state.duplicateArguments[2], '2026-06-01T00:00:00.000Z');
  assert.equal(h.state.duplicateArguments[3], '2027-03-31T15:59:59.999Z');
});

test('turning testing off restores the annual schedule', async () => {
  const result = await harness({ config: { ...testingWindow, enabled: false } }).run();
  assert.equal(result.body.is_testing_window, false);
  assert.equal(result.body.status, 'UPCOMING');
  assert.equal(result.body.can_submit, false);
  assert.equal(result.body.formatted_deadline, 'March 17, 2027');
});

test('completed school years do not use the testing schedule', async () => {
  const result = await harness({ status: 'COMPLETED' }).run();
  assert.equal(result.body.is_testing_window, false);
  assert.equal(result.body.can_submit, false);
});

test('missing school years and invalid testing dates do not allow submissions', async () => {
  const missing = await harness({ noSchoolYear: true }).run('post', '/');
  assert.equal(missing.statusCode, 403);
  for (const config of [
    { ...testingWindow, opensAt: 'invalid' },
    { ...testingWindow, opensAt: testingWindow.deadlineAt, deadlineAt: testingWindow.opensAt },
  ]) {
    const h = harness({ config });
    const result = await h.run('post', '/');
    assert.equal(result.statusCode, 500);
    assert.equal(h.state.created, 0);
  }
});
