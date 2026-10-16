const fs = require('node:fs');
const path = require('node:path');

const backendDirectory = path.resolve(__dirname, '..');
const modelDirectory = path.join(backendDirectory, 'ml');
const environmentDirectory = path.join(backendDirectory, '.venv-model');
const toolsDirectory = path.join(backendDirectory, '.model-tools');

function environmentPython(platform = process.platform) {
  return platform === 'win32'
    ? path.join(environmentDirectory, 'Scripts', 'python.exe')
    : path.join(environmentDirectory, 'bin', 'python');
}

function pythonExecutable({ env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  if (env.AURALIS_MODEL_PYTHON?.trim()) return env.AURALIS_MODEL_PYTHON.trim();
  const managedPython = environmentPython(platform);
  if (exists(managedPython)) return managedPython;
  // Preserve the original development setup for existing installations.
  const installedPython = path.join(env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python314', 'python.exe');
  return platform === 'win32' && exists(installedPython) ? installedPython : 'python3';
}

module.exports = { backendDirectory, modelDirectory, environmentDirectory, toolsDirectory, environmentPython, pythonExecutable };
