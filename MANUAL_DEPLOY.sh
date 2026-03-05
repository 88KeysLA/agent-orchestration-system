#!/bin/bash
# Manual deployment instructions for FX and Show Mac

cat << 'EOF'
=== Manual Deployment Instructions ===

STEP 1: On FX Mac
-----------------
mkdir -p ~/agent-runner
cd ~/agent-runner

# Copy these files from mech mac:
scp villaromanzamech@192.168.0.60:~/agent-orchestration-system/src/remote-agent-runner.js .
scp villaromanzamech@192.168.0.60:~/agent-orchestration-system/src/redis-bus.js .

# Install dependencies
npm install ioredis

# Create start script
cat > start.sh << 'SCRIPT'
#!/bin/bash
cd ~/agent-runner
REDIS_URL=redis://192.168.0.60:6379 \
  /Users/mattserletic/.local/bin/node remote-agent-runner.js \
  --name fx-mac \
  --model llama3.2:3b \
  --ollama http://localhost:11434 \
  > runner.log 2>&1 &
echo $! > runner.pid
echo "FX Mac runner started (PID: $(cat runner.pid))"
SCRIPT

chmod +x start.sh

# Start the runner
./start.sh

# Check it's running
tail runner.log


STEP 2: On Show Mac
--------------------
mkdir -p ~/agent-runner
cd ~/agent-runner

# Copy files from mech mac
scp villaromanzamech@192.168.0.60:~/agent-orchestration-system/src/remote-agent-runner.js .
scp villaromanzamech@192.168.0.60:~/agent-orchestration-system/src/redis-bus.js .

# Install dependencies
npm install ioredis

# Create start script
cat > start.sh << 'SCRIPT'
#!/bin/bash
cd ~/agent-runner
REDIS_URL=redis://192.168.0.60:6379 \
  /Users/mattserletic/.local/bin/node remote-agent-runner.js \
  --name show-mac \
  --model llama3.2:3b \
  --ollama http://localhost:11434 \
  > runner.log 2>&1 &
echo $! > runner.pid
echo "Show Mac runner started (PID: $(cat runner.pid))"
SCRIPT

chmod +x start.sh

# Start the runner
./start.sh

# Check it's running
tail runner.log


STEP 3: Verify from Mech Mac
-----------------------------
# Check Redis for heartbeats
redis-cli SUBSCRIBE agent.heartbeat

# You should see messages from fx-mac and show-mac every 10 seconds

EOF
