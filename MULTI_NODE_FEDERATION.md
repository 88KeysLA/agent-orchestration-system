# Multi-Node CPU Federation

## Overview

Automatically distributes work across **multiple Mac Minis** using Redis pub/sub.

## Architecture

```
Mech Mac (192.168.0.60)
    ↓ Redis Pub/Sub
    ├─→ FX Mac (all cores)
    ├─→ Show Mac (all cores)
    └─→ Mech Mac (local cores)
```

## How It Works

### 1. Node Registration
Each Mac Mini:
- Starts worker pool (N-1 cores)
- Connects to Redis
- Broadcasts heartbeat every 5 seconds
- Reports: hostname, core count, CPU load

### 2. Task Distribution
```
Task arrives → Check all nodes → Pick least loaded → Execute → Return result
```

### 3. Automatic Failover
- Node offline? Task routes to next available
- No remote nodes? Falls back to local execution
- Task timeout? Auto-retry on different node

## Setup

### On Each Mac Mini (Mech, FX, Show)

```bash
# 1. Install dependencies
cd ~/agent-orchestration-system
git pull
npm install

# 2. Set Redis URL (same for all)
echo 'export REDIS_URL=redis://192.168.0.60:6379' >> ~/.bashrc
source ~/.bashrc

# 3. Start server
npm start
```

### Verification

```bash
# Check all nodes are connected
curl http://192.168.0.60:8406/api/workers/status

# Response shows all nodes
{
  "local": {
    "hostname": "mech",
    "cpuCores": 8,
    "busyWorkers": 2
  },
  "distributed": {
    "enabled": true,
    "nodes": [
      {"nodeId": "fx-12345", "hostname": "fx", "cores": 12, "load": 0.5},
      {"nodeId": "show-67890", "hostname": "show", "cores": 10, "load": 0.3}
    ],
    "totalCores": 30
  }
}
```

## Usage

### Automatic (Recommended)
```javascript
// Automatically picks least loaded node
const result = await orc.distributedPool.executeOnLeastLoaded({
  type: 'llm_request',
  data: { model: 'llama2', messages: [...] }
});
```

### Manual Node Selection
```javascript
// Force execution on specific node
const result = await orc.distributedPool.execute(task, 'fx-12345');
```

### Local Only
```javascript
// Skip distributed pool, use local cores only
const result = await orc.workerPool.execute(task);
```

## Load Balancing

### Strategy: Least Loaded First
1. Check all node heartbeats (last 15 seconds)
2. Calculate load average per node
3. Route task to node with lowest load
4. If all busy, queue locally

### Example
```
Mech: 8 cores, load 2.5 (busy)
FX:   12 cores, load 0.8 (available) ← Task goes here
Show: 10 cores, load 1.2 (moderate)
```

## Performance

### Single Node (Mech only)
- 8 cores
- ~8 parallel tasks

### Multi-Node (Mech + FX + Show)
- 30 cores total
- ~30 parallel tasks
- **4x throughput increase**

## Monitoring

### Real-Time Status
```bash
# Watch node status
watch -n 1 'curl -s http://192.168.0.60:8406/api/workers/status | jq'
```

### Heartbeat Check
```bash
# Check if nodes are alive
redis-cli -h 192.168.0.60 SUBSCRIBE node:heartbeat
```

### Task Flow
```bash
# Watch tasks being distributed
redis-cli -h 192.168.0.60 SUBSCRIBE task:request task:response
```

## Failure Modes

### Node Goes Offline
- Heartbeat stops
- Node removed from pool after 15 seconds
- Tasks auto-route to remaining nodes

### Redis Goes Down
- Distributed pool disabled
- Falls back to local worker pool
- No task failures

### Task Timeout
- 30 second timeout per task
- Returns error to caller
- Caller can retry on different node

## Configuration

### Environment Variables
```bash
# Required for distributed mode
export REDIS_URL=redis://192.168.0.60:6379

# Optional: Limit local workers
export MAX_WORKERS=6  # Default: N-1 cores
```

### Disable Distributed Mode
```bash
# Don't set REDIS_URL
# System uses local cores only
```

## Network Requirements

### Ports
- **6379:** Redis (must be accessible from all nodes)
- **8406:** Agent Orchestration (Mech only)

### Latency
- Local execution: <1ms
- Remote execution: ~5-10ms (Redis overhead)
- Use local pool for latency-sensitive tasks

## Example Deployment

### Mech Mac (Primary)
```bash
ssh villaromanzamech@192.168.0.60
cd ~/agent-orchestration-system
export REDIS_URL=redis://127.0.0.1:6379
npm start
```

### FX Mac (Worker)
```bash
ssh villa@fx.local  # Replace with actual hostname
cd ~/agent-orchestration-system
export REDIS_URL=redis://192.168.0.60:6379
npm start
```

### Show Mac (Worker)
```bash
ssh villa@show.local  # Replace with actual hostname
cd ~/agent-orchestration-system
export REDIS_URL=redis://192.168.0.60:6379
npm start
```

## Benefits

1. **Automatic** - Zero configuration load balancing
2. **Resilient** - Node failures don't stop system
3. **Scalable** - Add nodes by starting server
4. **Efficient** - Routes to least loaded node
5. **Fast** - Redis pub/sub <10ms overhead

## Next Steps

1. Deploy to Mech Mac
2. Deploy to FX Mac
3. Deploy to Show Mac
4. Verify all nodes appear in status
5. Monitor distributed task execution

---

**Status:** Ready for multi-node deployment  
**Total Cores:** 30+ (Mech + FX + Show)  
**Speedup:** 4x throughput vs single node
