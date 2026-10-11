const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function pythonExecutable() {
  if (process.env.AURALIS_MODEL_PYTHON) return process.env.AURALIS_MODEL_PYTHON;
  const localPython = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python314', 'python.exe');
  return process.platform === 'win32' && fs.existsSync(localPython) ? localPython : 'python3';
}

function predict(records) {
  return new Promise((resolve, reject) => {
    const child = execFile(pythonExecutable(), [path.join(__dirname, '../ml/predict.py')], {
      timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    }, (error, stdout) => {
      let result;
      try { result = JSON.parse(stdout); } catch { /* Missing runtime or invalid worker output. */ }
      if (error || !result || result.error || result.predictions?.length !== records.length) {
        const failure = new Error('Prediction unavailable. Check the local model file and matching Python runtime.');
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
