# Make Runners Always-On (Persist Across Reboots)

## On FX Mac

1. Create persistent start script:
```bash
cd ~/agent-runner
cat > start-persistent.sh << 'EOF'
#!/bin/bash
cd ~/agent-runner
REDIS_URL=redis://192.168.0.60:6379 \
  /Users/mattserletic/.local/bin/node remote-agent-runner.js \
  --name fx-mac \
  --model llama3.2:3b \
  --ollama http://localhost:11434 \
  >> runner.log 2>&1 &
echo $! > runner.pid
EOF
chmod +x start-persistent.sh
```

2. Add to crontab:
```bash
crontab -e
```

Add this line:
```
@reboot sleep 30 && ~/agent-runner/start-persistent.sh
```

Save and exit.

## On Show Mac

1. Create persistent start script:
```bash
cd ~/agent-runner
cat > start-persistent.sh << 'EOF'
#!/bin/bash
cd ~/agent-runner
REDIS_URL=redis://192.168.0.60:6379 \
  /Users/mattserletic/.local/bin/node remote-agent-runner.js \
  --name show-mac \
  --model llama3.2:3b \
  --ollama http://localhost:11434 \
  >> runner.log 2>&1 &
echo $! > runner.pid
EOF
chmod +x start-persistent.sh
```

2. Add to crontab:
```bash
crontab -e
```

Add this line:
```
@reboot sleep 30 && ~/agent-runner/start-persistent.sh
```

Save and exit.

## Verify

Check crontab:
```bash
crontab -l
```

Should see:
```
@reboot sleep 30 && ~/agent-runner/start-persistent.sh
```

## Test

Reboot the machine and check after 1 minute:
```bash
tail ~/agent-runner/runner.log
```

Should see the runner connected.
