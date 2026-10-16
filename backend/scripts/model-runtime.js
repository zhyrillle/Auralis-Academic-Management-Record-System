const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  backendDirectory, modelDirectory, environmentDirectory, toolsDirectory,
  environmentPython, pythonExecutable,
} = require('../services/ModelRuntime');

require('dotenv').config({ path: path.join(backendDirectory, '.env'), quiet: true });

const UV_VERSION = '0.13.1';
const metadata = JSON.parse(fs.readFileSync(path.join(modelDirectory, 'model_metadata.json'), 'utf8'));

function checkModel() {
  const python = pythonExecutable();
  console.log(`Checking prediction Python: ${python}`);
  let output;
  try {
    output = execFileSync(python, [path.join(modelDirectory, 'predict.py')], {
      cwd: backendDirectory, input: JSON.stringify({ records: [] }), encoding: 'utf8',
      windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    let detail;
    try { detail = JSON.parse(String(error.stdout)).error; } catch { /* Import errors use stderr. */ }
    detail ||= String(error.stderr || '').trim() || error.message;
    throw new Error(`${detail}\nRun npm run model:setup in backend. If AURALIS_MODEL_PYTHON is set, check that override too.`);
  }
  const result = JSON.parse(output);
  if (result.error || result.modelVersion !== metadata.version || !Array.isArray(result.predictions) || result.predictions.length) {
    throw new Error(result.error || 'The prediction worker returned an unexpected model response.');
  }
  console.log(`Prediction model ready: ${result.modelVersion} (Python ${metadata.python_version}).`);
}

async function setupModel() {
  if (!fs.existsSync(path.join(modelDirectory, 'english-model.joblib'))) {
    throw new Error('Missing backend/ml/english-model.joblib. Pull the model file and its metadata from the repository together.');
  }
  // All downloads and environments stay inside this checkout; no global PATH changes.
  const toolEnvironment = {
    ...process.env,
    UV_UNMANAGED_INSTALL: toolsDirectory,
    UV_CACHE_DIR: path.join(toolsDirectory, 'cache'),
    UV_PYTHON_INSTALL_DIR: path.join(toolsDirectory, 'python'),
    UV_PYTHON_DOWNLOADS: 'automatic',
    UV_NO_PROGRESS: '1',
  };
  const uv = path.join(toolsDirectory, process.platform === 'win32' ? 'uv.exe' : 'uv');
  if (!fs.existsSync(uv)) {
    if (typeof fetch !== 'function') throw new Error('Model setup needs Node.js 18 or newer.');
    console.log(`Downloading the project-local Python installer (uv ${UV_VERSION})...`);
    const scriptName = process.platform === 'win32' ? 'install.ps1' : 'install.sh';
    const response = await fetch(`https://astral.sh/uv/${UV_VERSION}/${scriptName}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`Could not download the uv installer: HTTP ${response.status}. Check the internet connection.`);
    const installer = await response.text();
    fs.mkdirSync(toolsDirectory, { recursive: true });
    const installerPath = path.join(toolsDirectory, `install-uv.${process.platform === 'win32' ? 'ps1' : 'sh'}`);
    fs.writeFileSync(installerPath, installer);
    const command = process.platform === 'win32' ? 'powershell.exe' : 'sh';
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', installerPath]
      : [installerPath];
    const installerEnvironment = { ...toolEnvironment };
    // PowerShell 7's module path can prevent Windows PowerShell from loading its own modules.
    if (process.platform === 'win32') delete installerEnvironment.PSModulePath;
    execFileSync(command, args, {
      cwd: backendDirectory, env: installerEnvironment,
      stdio: 'inherit', windowsHide: true, timeout: 180000,
    });
    if (!fs.existsSync(uv)) throw new Error('The project-local uv installation did not complete. Check the installer output above.');
  }

  const managedPython = environmentPython();
  if (!fs.existsSync(managedPython)) {
    if (fs.existsSync(environmentDirectory)) {
      throw new Error('backend/.venv-model is incomplete. Rename that folder, then run npm run model:setup again.');
    }
    console.log(`Creating the private Python ${metadata.python_version} environment...`);
    execFileSync(uv, ['venv', '--no-config', '--managed-python', '--python', metadata.python_version, environmentDirectory], {
      cwd: backendDirectory, env: toolEnvironment, stdio: 'inherit', windowsHide: true, timeout: 300000,
    });
  }
  const actualVersion = execFileSync(managedPython, ['-c', 'import platform; print(platform.python_version())'], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
  }).trim();
  if (actualVersion !== metadata.python_version) {
    throw new Error(`backend/.venv-model uses Python ${actualVersion}, but the saved model requires ${metadata.python_version}. Rename the environment folder and rerun setup.`);
  }

  console.log('Installing the saved model\'s required package versions...');
  execFileSync(uv, ['pip', 'install', '--no-config', '--python', managedPython,
    '--only-binary', ':all:', '--requirements', path.join(modelDirectory, 'requirements.txt')], {
    cwd: backendDirectory, env: toolEnvironment, stdio: 'inherit', windowsHide: true, timeout: 300000,
  });
  if (process.env.AURALIS_MODEL_PYTHON?.trim()) {
    console.log('AURALIS_MODEL_PYTHON is set and takes priority over the private environment. Remove an outdated override from backend/.env or your shell if the check below fails.');
  }
  checkModel();
  console.log('Setup complete. Restart the backend normally. No Python server or environment activation is needed.');
}

async function main() {
  const action = process.argv[2];
  if (action === 'setup') await setupModel();
  else if (action === 'check') checkModel();
  else throw new Error('Use npm run model:setup or npm run model:check in backend.');
}

main().catch(error => {
  console.error(`Model ${process.argv[2] || 'setup'} failed: ${error.message}`);
  process.exitCode = 1;
});
