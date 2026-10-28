const { execFile } = require('node:child_process');
const path = require('node:path');
const { modelDirectory, pythonExecutable } = require('./ModelRuntime');

let cachedEmptyResult = null;

function predict(records) {
  if (records.length === 0 && cachedEmptyResult) {
    return Promise.resolve(cachedEmptyResult);
  }

  return new Promise((resolve, reject) => {
    const child = execFile(pythonExecutable(), [path.join(modelDirectory, 'predict.py')], {
      timeout: 35000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    }, (error, stdout) => {
      let result;
      try { result = JSON.parse(stdout); } catch { /* Missing runtime or invalid worker output. */ }
      if (error || !result || result.error || result.predictions?.length !== records.length) {
        const failure = new Error('Prediction unavailable. Run npm run model:check in backend to check the local model setup.');
        failure.status = 503;
        failure.code = 'MODEL_UNAVAILABLE';
        return reject(failure);
      }
      if (records.length === 0) {
        cachedEmptyResult = result;
      }
      resolve(result);
    });
    child.stdin.on('error', () => {}); // Early worker exit is handled by execFile.
    child.stdin.end(JSON.stringify({ records }));
  });
}

// Background warmup: verify model in advance so empty/initial queries respond instantly
if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
  predict([]).then((res) => { cachedEmptyResult = res; }).catch(() => {});
}

module.exports = { predict };

