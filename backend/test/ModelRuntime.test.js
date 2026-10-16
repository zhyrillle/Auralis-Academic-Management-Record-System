const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { environmentPython, pythonExecutable } = require('../services/ModelRuntime');

test('prediction uses the checkout environment even when another Python is installed', () => {
  const managed = environmentPython('win32');
  const installed = path.join('C:/Other User/AppData/Local', 'Programs', 'Python', 'Python314', 'python.exe');
  assert.equal(pythonExecutable({ env: { LOCALAPPDATA: 'C:/Other User/AppData/Local' },
    platform: 'win32', exists: value => [managed, installed].includes(value) }), managed);
});

test('an explicit interpreter override remains authoritative, including paths with spaces', () => {
  const override = 'C:/Auralis Demo/Python/python.exe';
  assert.equal(pythonExecutable({ env: { AURALIS_MODEL_PYTHON: ` ${override} ` },
    platform: 'win32', exists: () => true }), override);
});

test('existing Windows installations still work before the private environment is set up', () => {
  const installed = path.join('C:/Other User/AppData/Local', 'Programs', 'Python', 'Python314', 'python.exe');
  assert.equal(pythonExecutable({ env: { LOCALAPPDATA: 'C:/Other User/AppData/Local' },
    platform: 'win32', exists: value => value === installed }), installed);
});

test('Unix hosts use the private bin/python and keep python3 as their legacy fallback', () => {
  const managed = environmentPython('linux');
  assert.equal(pythonExecutable({ env: {}, platform: 'linux', exists: value => value === managed }), managed);
  assert.equal(pythonExecutable({ env: {}, platform: 'linux', exists: () => false }), 'python3');
});
