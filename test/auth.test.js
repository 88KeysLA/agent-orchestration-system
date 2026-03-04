const { authMiddleware, setupAuthRoutes } = require('../src/auth');
const express = require('express');
const cookieParser = require('cookie-parser');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    failed++;
  }
}

console.log('Testing Authentication...\n');

// Test 1: Auth module exports
test('Auth module exports functions', () => {
  if (typeof authMiddleware !== 'function') throw new Error('authMiddleware not a function');
  if (typeof setupAuthRoutes !== 'function') throw new Error('setupAuthRoutes not a function');
});

// Test 2: Setup routes
test('Can setup auth routes', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  setupAuthRoutes(app);
  // Should not throw
});

// Test 3: Login endpoint exists
test('Login endpoint configured', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  setupAuthRoutes(app);
  
  // Check route is registered
  const routes = app._router.stack
    .filter(r => r.route)
    .map(r => ({ path: r.route.path, methods: Object.keys(r.route.methods) }));
  
  const loginRoute = routes.find(r => r.path === '/api/auth/login');
  if (!loginRoute) throw new Error('Login route not found');
  if (!loginRoute.methods.includes('post')) throw new Error('Login route not POST');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
