'use strict';

async function checkPortAvailable(port, exec) {
  try {
    const { stdout } = await exec(`lsof -ti :${port}`);
    return !stdout.trim();
  } catch {
    return true; // lsof exits non-zero when port is free
  }
}

async function waitForHealth(url, { fetch: fetchFn, timeout = 30000, interval = 1000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetchFn(url);
      if (res.ok) return true;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

function buildDeployCommands({ remoteDir, port, appName, repo, setup }) {
  const lines = [];
  lines.push('set -e');

  if (setup) {
    lines.push(`[ -d "${remoteDir}" ] || git clone ${repo} "${remoteDir}"`);
  }

  lines.push(`cd "${remoteDir}"`);
  lines.push('git pull origin main');
  lines.push('npm install --production');

  if (setup) {
    lines.push(`PORT=${port} pm2 start server.js --name "${appName}" --update-env`);
  } else {
    lines.push(`PORT=${port} pm2 reload "${appName}" --update-env`);
  }

  return lines.join('\n');
}

module.exports = { checkPortAvailable, waitForHealth, buildDeployCommands };
