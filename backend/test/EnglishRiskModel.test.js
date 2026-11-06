const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const children = [], timers = new Set(), module = { exports: {} };
  const spawn = (python, args, options) => {
    assert.equal(python, '/private/python');
    assert.deepEqual(Array.from(args), ['-u', path.join('/model', 'predict.py'), '--serve']);
    assert.equal(options.windowsHide, true);
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
    child.stderr = { resume() {} };
    child.stdin = new EventEmitter(); child.requests = [];
    child.stdin.write = text => child.requests.push(JSON.parse(text));
    child.kill = () => { child.killed = true; };
    child.reply = (index, result) => child.stdout.emit('data', JSON.stringify({ id: child.requests[index].id,
      modelVersion: 'fixture', threshold: 0.35, ...result }) + '\n');
    children.push(child); return child;
  };
  const filename = path.join(__dirname, '../services/EnglishRiskModel.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, Buffer,
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
    require: name => {
      if (name === 'node:child_process') return { spawn };
      if (name === './ModelRuntime') return { modelDirectory: '/model', pythonExecutable: () => '/private/python' };
      return require(name);
    },
  }, { filename });
  return { model: module.exports, children, timers };
}
const prediction = { riskLevel: 'low', score: 0.1, predictedAtRisk: false };
const failure = error => error.status === 503 && error.code === 'MODEL_UNAVAILABLE';

test('concurrent and later batches reuse one worker with independent response identities', async () => {
  const h = harness();
  const first = h.model.predict([{ ww_pct: 80 }]), second = h.model.predict([]);
  assert.equal(h.children.length, 1);
  const child = h.children[0];
  assert.deepEqual(child.requests[0].records, [{ ww_pct: 80 }]);
  child.reply(1, { predictions: [] });
  child.reply(0, { predictions: [prediction] });
  assert.equal((await first).predictions[0].score, 0.1);
  assert.equal((await second).threshold, 0.35);
  const later = h.model.predict([{ ww_pct: 70 }]);
  child.reply(2, { predictions: [prediction] }); await later;
  assert.equal(h.children.length, 1); assert.equal(h.timers.size, 0);
  h.model.close();
});

test('split stdout lines are buffered and empty batches still check the live model', async () => {
  const h = harness(), pending = h.model.predict([]), child = h.children[0];
  const response = JSON.stringify({ id: child.requests[0].id, predictions: [] }) + '\n';
  child.stdout.emit('data', response.slice(0, 8));
  child.stdout.emit('data', response.slice(8));
  assert.equal((await pending).predictions.length, 0);
  h.model.close();
});

test('crashes and timeouts reject all pending batches, then the next read starts a fresh worker', async () => {
  for (const crash of [h => h.children[0].emit('error', new Error('missing interpreter')),
    h => h.children[0].emit('close'), h => [...h.timers][0]()]) {
    const h = harness();
    const first = h.model.predict([]), second = h.model.predict([]);
    const assertions = [assert.rejects(first, failure), assert.rejects(second, failure)];
    crash(h); await Promise.all(assertions);
    assert.equal(h.children[0].killed, true);
    const retry = h.model.predict([]);
    h.children[1].reply(0, { predictions: [] }); await retry;
    assert.equal(h.timers.size, 0); h.model.close();
  }
});

test('invalid worker responses never turn into labels', async () => {
  for (const output of ['not json\n', 'null\n', JSON.stringify({ error: 'runtime mismatch' }) + '\n', 'x'.repeat(4 * 1024 * 1024 + 1)]) {
    const h = harness(), pending = h.model.predict([]);
    const assertion = assert.rejects(pending, failure);
    h.children[0].stdout.emit('data', output); await assertion;
    assert.equal(h.children[0].killed, true);
  }
});

test('bad input and incorrect row counts reject their batch without reusing another response', async () => {
  const h = harness();
  for (const result of [{ error: 'Invalid input.' }, { predictions: [] }]) {
    const pending = h.model.predict([{ ww_pct: 80 }]);
    const assertion = assert.rejects(pending, failure);
    h.children[0].reply(h.children[0].requests.length - 1, result); await assertion;
  }
  const valid = h.model.predict([]);
  h.children[0].reply(2, { predictions: [] }); await valid;
  assert.equal(h.children.length, 1); h.model.close();
});
