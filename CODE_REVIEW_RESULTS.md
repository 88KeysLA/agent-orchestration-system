# Code Review Results - Port Checking & Deployment

**Reviewer:** prreddy-auditor  
**Date:** 2026-03-04  
**Status:** CRITICAL ISSUES FOUND

---

## Critical Issues (Fix Before Deployment)

### 1. Hardcoded Default Credentials ❌
**Risk:** HIGH - Anyone can guess default password  
**Fix:** Require environment variables, no defaults
```bash
export VILLA_USERNAME=your_username
export VILLA_PASSWORD=strong_random_password
```

### 2. In-Memory Sessions ❌
**Risk:** HIGH - Sessions lost on restart  
**Fix:** Use Redis (already running on port 6379)

### 3. Plaintext Passwords ❌
**Risk:** CRITICAL - Passwords not hashed  
**Fix:** Use bcrypt for password hashing

### 4. No Rate Limiting ❌
**Risk:** HIGH - Brute force attacks possible  
**Fix:** Add express-rate-limit to login endpoint

### 5. Port Check Race Condition ❌
**Risk:** MEDIUM - TOCTOU vulnerability  
**Fix:** Atomic port check + start in deploy.sh

---

## Recommendations

### Before Deploying to Mech Mac

**DO NOT DEPLOY YET** - Fix critical issues first:

1. ✅ Port checking works
2. ❌ Remove hardcoded credentials
3. ❌ Add Redis session storage
4. ❌ Hash passwords with bcrypt
5. ❌ Add rate limiting
6. ❌ Use PM2 instead of nohup

### Quick Fixes (30 minutes)

```bash
# 1. Install dependencies
npm install bcrypt express-rate-limit ioredis pm2 -g

# 2. Set environment variables on Mech Mac
ssh villaromanzamech@192.168.0.60
echo 'export VILLA_USERNAME=admin' >> ~/.bashrc
echo 'export VILLA_PASSWORD=<generate-strong-password>' >> ~/.bashrc
echo 'export REDIS_URL=redis://127.0.0.1:6379' >> ~/.bashrc
source ~/.bashrc

# 3. Deploy with PM2
cd ~/agent-orchestration-system
git pull
npm install
pm2 start server.js --name agent-orchestration
pm2 save
```

---

## Security Score

**Current:** 3/10 (not production ready)  
**After Fixes:** 8/10 (production ready)

---

## Action Plan

### Phase 1: Critical Fixes (Do Now)
- [ ] Remove hardcoded credentials
- [ ] Add Redis session storage
- [ ] Hash passwords with bcrypt
- [ ] Add rate limiting

### Phase 2: Deployment Safety (Before Deploy)
- [ ] Fix port check race condition
- [ ] Add health check with timeout
- [ ] Use PM2 instead of nohup
- [ ] Add rollback mechanism

### Phase 3: Production Hardening (After Deploy)
- [ ] Add HTTPS with nginx
- [ ] Implement structured logging
- [ ] Add monitoring
- [ ] Split auth.js (SOLID compliance)

---

## Recommendation

**DO NOT deploy to Mech Mac yet.**

Fix Phase 1 (critical security) first, then Phase 2 (deployment safety), then deploy.

Estimated time: 1-2 hours to fix all critical issues.

---

**Full Review:** See auditor output above for detailed fixes and code examples.
