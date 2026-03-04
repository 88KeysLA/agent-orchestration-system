/**
 * Authentication middleware with bcrypt, Redis sessions, and rate limiting
 */
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const Redis = require('ioredis');
const rateLimit = require('express-rate-limit');

const SALT_ROUNDS = 10;
const SESSION_TTL = 86400; // 24 hours in seconds
const SESSION_PREFIX = 'session:';

const redis = new Redis({
  host: process.env.REDIS_HOST || '192.168.0.60',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true
});

redis.connect().catch(() => {});

const USERNAME = process.env.VILLA_USERNAME;
const PASSWORD_HASH = process.env.VILLA_PASSWORD;

async function createHashedPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(username) {
  const sessionId = generateSessionId();
  await redis.set(
    SESSION_PREFIX + sessionId,
    JSON.stringify({ username, createdAt: Date.now() }),
    'EX',
    SESSION_TTL
  );
  return sessionId;
}

async function validateSession(sessionId) {
  if (!sessionId) return null;
  const data = await redis.get(SESSION_PREFIX + sessionId);
  if (!data) return null;
  return JSON.parse(data);
}

async function deleteSession(sessionId) {
  if (sessionId) await redis.del(SESSION_PREFIX + sessionId);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later' }
});

function authMiddleware(req, res, next) {
  if (req.path === '/api/auth/login' || req.path === '/login') return next();

  const sessionId = req.cookies?.villa_session;
  validateSession(sessionId).then(session => {
    if (!session) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.redirect('/login');
    }
    req.user = session.username;
    next();
  }).catch(() => res.status(500).json({ error: 'Session error' }));
}

function setupAuthRoutes(app) {
  const isProduction = process.env.NODE_ENV === 'production';

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (username !== USERNAME || !PASSWORD_HASH) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, PASSWORD_HASH);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionId = await createSession(username);
    res.cookie('villa_session', sessionId, {
      httpOnly: true,
      maxAge: SESSION_TTL * 1000,
      sameSite: 'strict',
      secure: isProduction
    });

    res.json({ success: true, username });
  });

  app.post('/api/auth/logout', async (req, res) => {
    await deleteSession(req.cookies?.villa_session);
    res.clearCookie('villa_session');
    res.json({ success: true });
  });

  app.get('/api/auth/status', async (req, res) => {
    const session = await validateSession(req.cookies?.villa_session);
    res.json({ authenticated: !!session, username: session?.username });
  });
}

module.exports = { authMiddleware, setupAuthRoutes, createHashedPassword };
