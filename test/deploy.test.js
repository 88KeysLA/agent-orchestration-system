'use strict';

const assert = require('assert');
const { describe, it, beforeEach } = require('node:test');
const {
  checkPortAvailable,
  waitForHealth,
  buildDeployCommands
} = require('../src/deploy-utils');

describe('deploy-utils', () => {
  describe('checkPortAvailable', () => {
    it('when port is free, returns true', async () => {
      const exec = async () => ({ stdout: '', stderr: '' });
      const result = await checkPortAvailable(8406, exec);
      assert.strictEqual(result, true);
    });

    it('when port is occupied, returns false', async () => {
      const exec = async () => ({ stdout: '1234', stderr: '' });
      const result = await checkPortAvailable(8406, exec);
      assert.strictEqual(result, false);
    });

    it('when lsof fails (port free), returns true', async () => {
      const exec = async () => { throw new Error('exit code 1'); };
      const result = await checkPortAvailable(8406, exec);
      assert.strictEqual(result, true);
    });
  });

  describe('waitForHealth', () => {
    it('when health returns 200 immediately, resolves true', async () => {
      const fetch = async () => ({ ok: true });
      const result = await waitForHealth('http://localhost:8406/api/health', { fetch, timeout: 5000, interval: 100 });
      assert.strictEqual(result, true);
    });

    it('when health never returns 200, resolves false after timeout', async () => {
      const fetch = async () => { throw new Error('ECONNREFUSED'); };
      const result = await waitForHealth('http://localhost:8406/api/health', { fetch, timeout: 300, interval: 100 });
      assert.strictEqual(result, false);
    });

    it('when health succeeds after retries, resolves true', async () => {
      let calls = 0;
      const fetch = async () => {
        calls++;
        if (calls < 3) throw new Error('not ready');
        return { ok: true };
      };
      const result = await waitForHealth('http://localhost:8406/api/health', { fetch, timeout: 5000, interval: 50 });
      assert.strictEqual(result, true);
      assert.ok(calls >= 3);
    });
  });

  describe('buildDeployCommands', () => {
    const config = {
      remoteDir: '/Users/villaromanzamech/agent-orchestration-system',
      port: 8406,
      appName: 'agent-orchestration',
      repo: 'https://github.com/88KeysLA/agent-orchestration-system.git'
    };

    it('when setup mode, includes git clone and pm2 start', () => {
      const cmds = buildDeployCommands({ ...config, setup: true });
      assert.ok(cmds.includes('git clone'));
      assert.ok(cmds.includes('pm2 start'));
      assert.ok(!cmds.includes('pm2 reload'));
    });

    it('when update mode, uses pm2 reload for zero-downtime', () => {
      const cmds = buildDeployCommands({ ...config, setup: false });
      assert.ok(cmds.includes('pm2 reload'));
      assert.ok(!cmds.includes('git clone'));
    });

    it('when update mode, includes git pull', () => {
      const cmds = buildDeployCommands({ ...config, setup: false });
      assert.ok(cmds.includes('git pull'));
    });

    it('includes npm install in both modes', () => {
      const setup = buildDeployCommands({ ...config, setup: true });
      const update = buildDeployCommands({ ...config, setup: false });
      assert.ok(setup.includes('npm install'));
      assert.ok(update.includes('npm install'));
    });
  });
});
