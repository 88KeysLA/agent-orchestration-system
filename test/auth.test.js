const { authMiddleware, setupAuthRoutes, createHashedPassword } = require('../src/auth');
const express = require('express');
const cookieParser = require('cookie-parser');
const http = require('http');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`✓ ${name}`);
        passed++;
      }).catch(err => {
        console.error(`✗ ${name}: ${err.message}`);
        failed++;
      });
    }
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    failed++;
  }
}

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://localhost:${server.address().port}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data ? JSON.parse(data) : null
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

console.log('Testing Authentication Security...\n');

async function runTests() {
  // Test 1: Module exports
  await test('exports authMiddleware, setupAuthRoutes, createHashedPassword', () => {
    if (typeof authMiddleware !== 'function') throw new Error('authMiddleware not a function');
    if (typeof setupAuthRoutes !== 'function') throw new Error('setupAuthRoutes not a function');
    if (typeof createHashedPassword !== 'function') throw new Error('createHashedPassword not a function');
  });

  // Test 2: No hardcoded credentials in source
  await test('no hardcoded credentials in source', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../src/auth'), 'utf8');
    if (source.includes('villa2026')) throw new Error('Hardcoded password found');
    if (source.includes("'admin'") && source.includes('USERS')) throw new Error('Hardcoded username found');
  });

  // Test 3: bcrypt is used for password hashing
  await test('createHashedPassword returns bcrypt hash', async () => {
    const hash = await createHashedPassword('testpass');
    if (!hash.startsWith('$2')) throw new Error('Not a bcrypt hash');
  });

  // Test 4: bcrypt uses 10 rounds
  await test('bcrypt uses 10 salt rounds', async () => {
    const hash = await createHashedPassword('testpass');
    // bcrypt hash format: $2b$10$...  (split gives ['', '2b', '10', ...])
    const rounds = parseInt(hash.split('$')[2], 10);
    if (rounds !== 10) throw new Error(`Expected 10 rounds, got ${rounds}`);
  });

  // Test 5: Login rejects wrong password
  await test('login rejects invalid credentials', async () => {
    const oldUser = process.env.VILLA_USERNAME;
    const oldPass = process.env.VILLA_PASSWORD;
    process.env.VILLA_USERNAME = 'testuser';
    // Pre-hash the password for the test
    const bcrypt = require('bcrypt');
    process.env.VILLA_PASSWORD = await bcrypt.hash('correctpass', 10);

    // Re-require to pick up new env
    delete require.cache[require.resolve('../src/auth')];
    const { setupAuthRoutes: setup } = require('../src/auth');

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    setup(app);

    const server = app.listen(0);
    try {
      const res = await request(server, 'POST', '/api/auth/login', {
        username: 'testuser', password: 'wrongpass'
      });
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    } finally {
      server.close();
      process.env.VILLA_USERNAME = oldUser || '';
      process.env.VILLA_PASSWORD = oldPass || '';
      delete require.cache[require.resolve('../src/auth')];
    }
  });

  // Test 6: Login accepts correct password
  await test('login accepts valid credentials', async () => {
    const bcrypt = require('bcrypt');
    const oldUser = process.env.VILLA_USERNAME;
    const oldPass = process.env.VILLA_PASSWORD;
    process.env.VILLA_USERNAME = 'testuser';
    process.env.VILLA_PASSWORD = await bcrypt.hash('correctpass', 10);

    delete require.cache[require.resolve('../src/auth')];
    const { setupAuthRoutes: setup } = require('../src/auth');

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    setup(app);

    const server = app.listen(0);
    try {
      const res = await request(server, 'POST', '/api/auth/login', {
        username: 'testuser', password: 'correctpass'
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.success) throw new Error('Expected success: true');
    } finally {
      server.close();
      process.env.VILLA_USERNAME = oldUser || '';
      process.env.VILLA_PASSWORD = oldPass || '';
      delete require.cache[require.resolve('../src/auth')];
    }
  });

  // Test 7: Rate limiting on login
  await test('rate limits login to 5 attempts per window', async () => {
    const bcrypt = require('bcrypt');
    const oldUser = process.env.VILLA_USERNAME;
    const oldPass = process.env.VILLA_PASSWORD;
    process.env.VILLA_USERNAME = 'testuser';
    process.env.VILLA_PASSWORD = await bcrypt.hash('pass', 10);

    delete require.cache[require.resolve('../src/auth')];
    const { setupAuthRoutes: setup } = require('../src/auth');

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    setup(app);

    const server = app.listen(0);
    try {
      // Make 6 requests - 6th should be rate limited
      for (let i = 0; i < 5; i++) {
        await request(server, 'POST', '/api/auth/login', {
          username: 'testuser', password: 'wrong'
        });
      }
      const res = await request(server, 'POST', '/api/auth/login', {
        username: 'testuser', password: 'wrong'
      });
      if (res.status !== 429) throw new Error(`Expected 429, got ${res.status}`);
    } finally {
      server.close();
      process.env.VILLA_USERNAME = oldUser || '';
      process.env.VILLA_PASSWORD = oldPass || '';
      delete require.cache[require.resolve('../src/auth')];
    }
  });

  // Test 8: Secure cookie in production
  await test('sets secure cookie flag in production', async () => {
    const bcrypt = require('bcrypt');
    const oldEnv = process.env.NODE_ENV;
    const oldUser = process.env.VILLA_USERNAME;
    const oldPass = process.env.VILLA_PASSWORD;
    process.env.NODE_ENV = 'production';
    process.env.VILLA_USERNAME = 'testuser';
    process.env.VILLA_PASSWORD = await bcrypt.hash('pass', 10);

    delete require.cache[require.resolve('../src/auth')];
    const { setupAuthRoutes: setup } = require('../src/auth');

    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use(cookieParser());
    setup(app);

    const server = app.listen(0);
    try {
      const res = await request(server, 'POST', '/api/auth/login', {
        username: 'testuser', password: 'pass'
      });
      const setCookie = res.headers['set-cookie'];
      if (!setCookie) throw new Error('No set-cookie header');
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
      if (!cookieStr.includes('Secure')) throw new Error('Secure flag not set');
    } finally {
      server.close();
      process.env.NODE_ENV = oldEnv || '';
      process.env.VILLA_USERNAME = oldUser || '';
      process.env.VILLA_PASSWORD = oldPass || '';
      delete require.cache[require.resolve('../src/auth')];
    }
  });

  // Test 9: Redis session storage (uses ioredis)
  await test('uses Redis for session storage', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../src/auth'), 'utf8');
    if (!source.includes('ioredis') && !source.includes('Redis')) {
      throw new Error('No Redis usage found in auth module');
    }
    if (source.includes('new Map()') && source.includes('sessions')) {
      throw new Error('Still using in-memory Map for sessions');
    }
  });

  // Test 10: Session TTL is 24 hours
  await test('session TTL is 24 hours (86400 seconds)', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../src/auth'), 'utf8');
    if (!source.includes('86400') && !source.includes('24 * 60 * 60')) {
      throw new Error('24h TTL not found');
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
