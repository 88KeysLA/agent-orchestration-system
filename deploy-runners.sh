#!/bin/bash
# Deploy remote agent runners to FX Mac and Show Mac

set -e

MECH_MAC="Matt Serletic@192.168.0.60"
FX_MAC="Matt Serletic@192.168.0.61"
SHOW_MAC="Matt Serletic@192.168.0.62"
SSH_KEY="$HOME/.ssh/villa_mech"

echo "=== Deploying Remote Agent Runners ==="

# Function to deploy to a machine
deploy_to_machine() {
  local HOST=$1
  local NAME=$2
  local IP=$3
  
  echo ""
  echo "Deploying to $NAME ($IP)..."
  
  # Create directory
  ssh -i "$SSH_KEY" "$HOST" "mkdir -p ~/agent-runner" || {
    echo "Failed to create directory on $NAME"
    return 1
  }
  
  # Copy files
  scp -i "$SSH_KEY" \
    src/remote-agent-runner.js \
    src/redis-bus.js \
    "$HOST:~/agent-runner/" || {
    echo "Failed to copy files to $NAME"
    return 1
  }
  
  # Install dependencies
  ssh -i "$SSH_KEY" "$HOST" "cd ~/agent-runner && npm install ioredis" || {
    echo "Failed to install dependencies on $NAME"
    return 1
  }
  
  # Find node path
  NODE_PATH=$(ssh -i "$SSH_KEY" "$HOST" "find /Users -name node -type f 2>/dev/null | grep -v node_modules | head -1")
  
  if [ -z "$NODE_PATH" ]; then
    echo "Node not found on $NAME"
    return 1
  fi
  
  echo "Node path: $NODE_PATH"
  
  # Create startup script
  ssh -i "$SSH_KEY" "$HOST" "cat > ~/agent-runner/start.sh << 'EOF'
#!/bin/bash
cd ~/agent-runner
REDIS_URL=redis://192.168.0.60:6379 \\
  $NODE_PATH remote-agent-runner.js \\
  --name $NAME \\
  --model llama3.2:3b \\
  --ollama http://localhost:11434 \\
  > runner.log 2>&1 &
echo \\\$! > runner.pid
echo \"Runner started (PID: \\\$(cat runner.pid))\"
EOF
chmod +x ~/agent-runner/start.sh"
  
  # Create stop script
  ssh -i "$SSH_KEY" "$HOST" "cat > ~/agent-runner/stop.sh << 'EOF'
#!/bin/bash
if [ -f ~/agent-runner/runner.pid ]; then
  kill \\\$(cat ~/agent-runner/runner.pid) 2>/dev/null
  rm ~/agent-runner/runner.pid
  echo \"Runner stopped\"
else
  echo \"No runner PID file found\"
fi
EOF
chmod +x ~/agent-runner/stop.sh"
  
  # Stop any existing runner
  ssh -i "$SSH_KEY" "$HOST" "~/agent-runner/stop.sh" 2>/dev/null || true
  
  # Start runner
  ssh -i "$SSH_KEY" "$HOST" "~/agent-runner/start.sh"
  
  echo "✓ $NAME deployed and running"
}

# Deploy to FX Mac
deploy_to_machine "$FX_MAC" "fx-mac" "192.168.0.61"

# Deploy to Show Mac
deploy_to_machine "$SHOW_MAC" "show-mac" "192.168.0.62"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Check status:"
echo "  ssh -i $SSH_KEY $FX_MAC 'tail ~/agent-runner/runner.log'"
echo "  ssh -i $SSH_KEY $SHOW_MAC 'tail ~/agent-runner/runner.log'"
echo ""
echo "Stop runners:"
echo "  ssh -i $SSH_KEY $FX_MAC '~/agent-runner/stop.sh'"
echo "  ssh -i $SSH_KEY $SHOW_MAC '~/agent-runner/stop.sh'"
