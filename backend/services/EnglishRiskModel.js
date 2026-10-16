const { execFile } = require('node:child_process');
const path = require('node:path');
const { modelDirectory, pythonExecutable } = require('./ModelRuntime');

function predict(records) {
  return new Promise((resolve, reject) => {
    const child = execFile(pythonExecutable(), [path.join(modelDirectory, 'predict.py')], {
      timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    }, (error, stdout) => {
      let result;
      try { result = JSON.parse(stdout); } catch { /* Missing runtime or invalid worker output. */ }
      if (error || !result || result.error || result.predictions?.length !== records.length) {
        const failure = new Error('Prediction unavailable. Run npm run model:check in backend to check the local model setup.');
        failure.status = 503;
        failure.code = 'MODEL_UNAVAILABLE';
        return reject(failure);
      }
      resolve(result);
    });
    child.stdin.on('error', () => {}); // Early worker exit is handled by execFile.
    child.stdin.end(JSON.stringify({ records }));
  });
}

module.exports = { predict };
