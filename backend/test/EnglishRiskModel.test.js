const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function service(execFile) {
  const filename = path.join(__dirname, '../services/EnglishRiskModel.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    require: name => {
      if (name === 'node:child_process') return { execFile };
      if (name === './ModelRuntime') return { modelDirectory: '/model', pythonExecutable: () => '/private/python' };
      return require(name);
    },
  }, { filename });
  return module.exports;
}

test('the worker launches the resolved interpreter and sends the batch through stdin', async () => {
  let payload;
  const model = service((python, args, options, callback) => {
    assert.equal(python, '/private/python');
    assert.equal(args[0], path.join('/model', 'predict.py'));
    assert.equal(options.windowsHide, true);
    return { stdin: { on() {}, end(value) {
      payload = JSON.parse(value);
      callback(null, JSON.stringify({ predictions: [{ riskLevel: 'low', score: 0.1 }] }));
    } } };
  });
  const result = await model.predict([{ ww_pct: 80 }]);
  assert.deepEqual(payload, { records: [{ ww_pct: 80 }] });
  assert.equal(result.predictions[0].riskLevel, 'low');
});

test('runtime and import failures remain unavailable instead of producing risk labels', async () => {
  for (const [error, output] of [
    [Object.assign(new Error('missing interpreter'), { code: 'ENOENT' }), ''],
    [new Error('worker exited'), JSON.stringify({ error: 'Model runtime does not match.' })],
    [null, 'invalid worker output'],
  ]) {
    const model = service((python, args, options, callback) => ({ stdin: { on() {}, end() { callback(error, output); } } }));
    await assert.rejects(model.predict([]), failure => failure.status === 503
      && failure.code === 'MODEL_UNAVAILABLE' && failure.message.includes('npm run model:check'));
  }
});
