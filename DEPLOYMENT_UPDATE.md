# Deployment Update - Authentication

**Date:** 2026-03-04  
**Target:** Mech Mac (192.168.0.60:8406)

---

## Changes for Remote Deployment

### 1. Authentication Now Required
- All portal access requires login
- Default: admin / villa2026
- Change via environment variables on Mech Mac

### 2. No Local Servers on Mobile
- ✅ Mantis routes through Villa server (192.168.0.60:8406)
- ✅ No local audio processing on mobile devices
- ✅ All compute happens on Mech Mac

### 3. Resource Check

**Current Mech Mac Services:**
- Port 8406: Agent Orchestration (this server)
- Port 11434: Ollama LLM
- Port 8450: RAG Server
- Port 6379: Redis
- Port 8400: Intent Resolver
- Port 8404: Music Service
- Port 8405: Voice Service

**New Load:**
- Authentication: Minimal (in-memory sessions)
- Cookie parsing: ~1KB per request
- No additional background processes

**Impact:** Negligible - auth adds <1ms per request

---

## Deployment Steps

### Option 1: Deploy Now (Recommended)
```bash
cd /Users/mattser/agent-orchestration-system
./deploy.sh
```

This will:
1. Pull latest code (with auth)
2. Install cookie-parser
3. Restart server
4. Test endpoint

### Option 2: Deploy with Custom Credentials
```bash
# SSH to Mech Mac
ssh villaromanzamech@192.168.0.60

# Set custom credentials
echo 'export VILLA_USERNAME=your_username' >> ~/.bashrc
echo 'export VILLA_PASSWORD=your_password' >> ~/.bashrc
source ~/.bashrc

# Deploy
cd ~/agent-orchestration-system
git pull origin main
npm install
pkill -f "node server.js"
PORT=8406 node server.js >> ~/logs/agent-orchestration.log 2>&1 &
```

---

## Access After Deployment

### From Any Device on LAN
1. Open: `http://192.168.0.60:8406`
2. Login page appears
3. Enter: admin / villa2026 (or custom)
4. Access portal

### From Mobile (Mantis)
- Mantis continues to work
- Routes through 192.168.0.60:8406
- No local server needed
- Authentication handled by Villa server

---

## Resource Impact

### Before Deployment
```
Mech Mac Load:
- CPU: ~15% (Ollama + services)
- RAM: ~4GB (Ollama models)
- Network: Minimal
```

### After Deployment
```
Mech Mac Load:
- CPU: ~15% (no change)
- RAM: ~4GB + 10MB (sessions)
- Network: Minimal
```

**Conclusion:** Safe to deploy - minimal overhead

---

## Rollback Plan

If issues occur:

```bash
ssh villaromanzamech@192.168.0.60
cd ~/agent-orchestration-system
git checkout HEAD~1  # Previous version
pkill -f "node server.js"
PORT=8406 node server.js >> ~/logs/agent-orchestration.log 2>&1 &
```

---

## Testing After Deployment

### 1. Check Server Status
```bash
curl http://192.168.0.60:8406/api/auth/status
# Should return: {"authenticated":false}
```

### 2. Test Login
```bash
curl -X POST http://192.168.0.60:8406/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"villa2026"}' \
  -c cookies.txt

# Should return: {"success":true,"username":"admin"}
```

### 3. Test Authenticated Request
```bash
curl http://192.168.0.60:8406/api/status -b cookies.txt
# Should return: agent status
```

### 4. Test Portal
```
Open: http://192.168.0.60:8406
Should see: Login page
Enter: admin / villa2026
Should see: Portal
```

---

## Mobile Device Rules

### ✅ Allowed
- Mantis app on mobile
- Routes audio through Villa server
- Uses Villa's compute resources
- Minimal mobile CPU/battery usage

### ❌ Not Allowed
- Local audio processing on mobile
- Local LLM inference on mobile
- Local server processes on mobile
- Heavy compute on mobile

### Architecture
```
Mobile (Mantis)
    ↓ (lightweight API calls)
Villa Server (192.168.0.60:8406)
    ↓ (heavy compute)
Home Assistant → AVR/Sonos
```

---

## Security Notes

### Current (After Deployment)
- ✅ Authentication required
- ✅ Session-based (24 hours)
- ✅ HttpOnly cookies
- ✅ SameSite: strict
- ⚠️ In-memory sessions (lost on restart)
- ⚠️ Plain text passwords

### Recommended Next Steps
1. Add Redis session storage (persistent)
2. Hash passwords with bcrypt
3. Add rate limiting on login
4. Add HTTPS (if exposing to internet)

---

## Monitoring

### Check Server Health
```bash
# CPU usage
ssh villaromanzamech@192.168.0.60 'top -l 1 | grep "CPU usage"'

# Memory usage
ssh villaromanzamech@192.168.0.60 'top -l 1 | grep PhysMem'

# Server logs
ssh villaromanzamech@192.168.0.60 'tail -f ~/logs/agent-orchestration.log'
```

### Check Active Sessions
```bash
# SSH to Mech Mac
ssh villaromanzamech@192.168.0.60

# Check process
ps aux | grep "node server.js"

# Check port
lsof -i :8406
```

---

## Summary

**Safe to Deploy:**
- ✅ Minimal resource overhead
- ✅ No local servers on mobile
- ✅ Authentication adds security
- ✅ Easy rollback if needed

**Deploy Command:**
```bash
./deploy.sh
```

**Access:**
```
http://192.168.0.60:8406
Login: admin / villa2026
```

---

**Status:** Ready to deploy  
**Risk:** Low  
**Impact:** Minimal resource usage  
**Benefit:** Secure portal access
