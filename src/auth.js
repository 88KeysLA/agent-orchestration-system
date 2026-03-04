/**
 * Simple authentication middleware
 */
const crypto = require('crypto');

// In-memory sessions (use Redis in production)
const sessions = new Map();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Default credentials (override with env vars)
const USERS = {
  [process.env.VILLA_USERNAME || 'admin']: process.env.VILLA_PASSWORD || 'villa2026'
};

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(username) {
  const sessionId = generateSessionId();
  sessions.set(sessionId, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION
  });
  return sessionId;
}

function validateSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function authMiddleware(req, res, next) {
  // Allow login endpoint
  if (req.path === '/api/auth/login' || req.path === '/login') return next();
  
  // Check session cookie
  const sessionId = req.cookies?.villa_session;
  const session = validateSession(sessionId);
  
  if (!session) {
    // For API requests, return 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // For page requests, redirect to login
    return res.redirect('/login');
  }
  
  req.user = session.username;
  next();
}

function setupAuthRoutes(app) {
  // Login
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    if (USERS[username] !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const sessionId = createSession(username);
    res.cookie('villa_session', sessionId, {
      httpOnly: true,
      maxAge: SESSION_DURATION,
      sameSite: 'strict'
    });
    
    res.json({ success: true, username });
  });
  
  // Logout
  app.post('/api/auth/logout', (req, res) => {
    const sessionId = req.cookies?.villa_session;
    if (sessionId) sessions.delete(sessionId);
    res.clearCookie('villa_session');
    res.json({ success: true });
  });
  
  // Check auth status
  app.get('/api/auth/status', (req, res) => {
    const sessionId = req.cookies?.villa_session;
    const session = validateSession(sessionId);
    res.json({ authenticated: !!session, username: session?.username });
  });
}

module.exports = { authMiddleware, setupAuthRoutes };
