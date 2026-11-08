const { spawn } = require('node:child_process');
const path = require('node:path');
const { modelDirectory, pythonExecutable } = require('./ModelRuntime');

let worker = null;
let nextId = 0;
const TIMEOUT_MS = 60000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const unavailable = () => Object.assign(new Error(
  'Prediction unavailable. Run npm run model:check in backend to check the local model setup.',
), { status: 503, code: 'MODEL_UNAVAILABLE' });

function reference(current, active) {
  // Idle model pipes should not keep a CLI/check process alive after its work.
  for (const handle of [current.child, current.child.stdin, current.child.stdout, current.child.stderr]) {
    if (active) handle?.ref?.();
    else handle?.unref?.();
  }
}

function stop(current) {
  if (worker !== current) return;
  worker = null;
  for (const request of current.pending.values()) {
    clearTimeout(request.timer);
    request.reject(unavailable());
  }
  current.pending.clear();
  current.child.kill();
}

function start() {
  const child = spawn(pythonExecutable(), ['-u', path.join(modelDirectory, 'predict.py'), '--serve'], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const current = { child, pending: new Map(), buffer: '' };
  worker = current;
  child.on('error', () => stop(current));
  child.on('close', () => stop(current));
  child.stdin.on('error', () => stop(current));
  child.stderr.resume(); // Never expose learner data or runtime output in API errors.
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    if (worker !== current) return;
    current.buffer += chunk;
    if (Buffer.byteLength(current.buffer) > MAX_RESPONSE_BYTES) return stop(current);
    let boundary;
    while ((boundary = current.buffer.indexOf('\n')) !== -1) {
      const line = current.buffer.slice(0, boundary);
      current.buffer = current.buffer.slice(boundary + 1);
      let result;
      try { result = JSON.parse(line); } catch { return stop(current); }
      const request = result && current.pending.get(result.id);
      if (!request) return stop(current);
      current.pending.delete(result.id);
      clearTimeout(request.timer);
      if (result.error || !Array.isArray(result.predictions) || result.predictions.length !== request.count) {
        request.reject(unavailable());
      } else {
        const { id: _id, ...prediction } = result;
        request.resolve(prediction);
      }
    }
    if (!current.pending.size) reference(current, false);
  });
  return current;
}

function predict(records) {
  if (!Array.isArray(records) || records.length > 5000) return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    let current;
    try {
      const id = ++nextId;
      const payload = JSON.stringify({ id, records });
      current = worker || start();
      reference(current, true);
      const timer = setTimeout(() => stop(current), TIMEOUT_MS);
      current.pending.set(id, { resolve, reject, timer, count: records.length });
      current.child.stdin.write(`${payload}\n`);
    } catch {
      if (current) stop(current);
      reject(unavailable());
    }
  });
}

function close() { if (worker) stop(worker); }

module.exports = { predict, close };

// Import and verify the model once per backend process, before the first page read.
if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') predict([]).catch(() => {});

