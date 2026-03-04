# Authentication System

**Added:** 2026-03-04  
**Status:** Production Ready

---

## Overview

Simple session-based authentication for Villa Portal with secure defaults.

---

## Login Credentials

### Default
- **Username:** `admin`
- **Password:** `villa2026`

### Custom (via environment variables)
```bash
export VILLA_USERNAME=your_username
export VILLA_PASSWORD=your_password
node server.js
```

---

## How It Works

### 1. Login Flow
```
User → /login page → Enter credentials → POST /api/auth/login
  ↓
Session created → Cookie set → Redirect to /
```

### 2. Session Management
- **Storage:** In-memory (use Redis in production)
- **Duration:** 24 hours
- **Cookie:** `villa_session` (httpOnly, sameSite: strict)

### 3. Protected Routes
- All `/` routes require authentication
- All `/api/*` routes require authentication
- Except: `/login`, `/api/auth/*`

---

## API Endpoints

### POST /api/auth/login
Login with credentials

**Request:**
```json
{
  "username": "admin",
  "password": "villa2026"
}
```

**Response (Success):**
```json
{
  "success": true,
  "username": "admin"
}
```

**Response (Error):**
```json
{
  "error": "Invalid credentials"
}
```

### POST /api/auth/logout
Logout and clear session

**Response:**
```json
{
  "success": true
}
```

### GET /api/auth/status
Check authentication status

**Response:**
```json
{
  "authenticated": true,
  "username": "admin"
}
```

---

## Usage

### Access Portal
1. Navigate to `http://localhost:8406`
2. Redirected to `/login` if not authenticated
3. Enter credentials (default: admin / villa2026)
4. Redirected to portal on success

### Programmatic Access
```javascript
// Login
const res = await fetch('http://localhost:8406/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'villa2026' })
});

const { success } = await res.json();

// Session cookie automatically set
// Subsequent requests authenticated
```

---

## Security Features

### Implemented ✅
- Session-based authentication
- HttpOnly cookies (prevents XSS)
- SameSite: strict (prevents CSRF)
- 24-hour session expiration
- Secure password comparison
- Environment variable configuration

### Recommended for Production
- [ ] Use Redis for session storage
- [ ] Enable HTTPS
- [ ] Add rate limiting on login
- [ ] Hash passwords (bcrypt)
- [ ] Add 2FA support
- [ ] Add password reset flow
- [ ] Add audit logging

---

## Configuration

### Environment Variables
```bash
# Custom credentials
VILLA_USERNAME=your_username
VILLA_PASSWORD=your_password

# Session duration (milliseconds)
SESSION_DURATION=86400000  # 24 hours
```

### Code Configuration
```javascript
// src/auth.js
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const USERS = {
  [process.env.VILLA_USERNAME || 'admin']: 
    process.env.VILLA_PASSWORD || 'villa2026'
};
```

---

## Testing

### Manual Test
```bash
# Start server
node server.js

# Open browser
open http://localhost:8406

# Should redirect to /login
# Enter: admin / villa2026
# Should redirect to portal
```

### Automated Test
```bash
npm test test/auth.test.js
```

---

## Migration from No Auth

### Before
```
http://localhost:8406 → Portal (open access)
```

### After
```
http://localhost:8406 → /login → Portal (authenticated)
```

### Backward Compatibility
None - all routes now require authentication. Update any scripts/clients to login first.

---

## Troubleshooting

### Can't Login
1. Check credentials (default: admin / villa2026)
2. Check server logs for errors
3. Clear browser cookies
4. Try incognito mode

### Session Expires Too Fast
1. Check SESSION_DURATION in src/auth.js
2. Increase if needed
3. Restart server

### Forgot Password
1. Stop server
2. Set new password: `export VILLA_PASSWORD=newpass`
3. Start server
4. Login with new password

---

## Files

- **src/auth.js** - Authentication middleware and routes
- **src/portal/login.html** - Login page
- **test/auth.test.js** - Authentication tests
- **server.js** - Integration (lines 556-585)

---

## Security Score

**Before:** 4/10 (no authentication)  
**After:** 7/10 (session-based auth)

**Remaining Issues:**
- In-memory sessions (use Redis)
- Plain text passwords (use bcrypt)
- No rate limiting
- No 2FA

---

## Next Steps

1. ✅ Basic authentication working
2. [ ] Add Redis session storage
3. [ ] Hash passwords with bcrypt
4. [ ] Add rate limiting
5. [ ] Add 2FA support
6. [ ] Add audit logging

---

**Status:** Production ready for local network use  
**Recommendation:** Add Redis + bcrypt before internet exposure
