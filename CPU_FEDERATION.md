# CPU Federation - Automatic Multi-Core Distribution

## Overview

The system now automatically distributes work across all available CPU cores using Node.js Worker Threads.

## Architecture

```
Main Thread (server.js)
    ↓
WorkerPool (auto-scales to N-1 cores)
    ↓
Worker 1, Worker 2, ... Worker N
    ↓
CPU Core 1, Core 2, ... Core N
```

## What Gets Federated

### Automatic Distribution
- LLM requests (Ollama chat)
- Audio processing
- Heavy computation tasks
- Parallel agent execution

### Main Thread (Not Federated)
- HTTP server
- WebSocket connections
- Redis pub/sub
- Lightweight routing

## Configuration

### Auto-Detection
```javascript
// Automatically uses N-1 cores (leaves 1 for main thread)
const workerPool = new WorkerPool(
  'src/workers/task-worker.js',
  os.cpus().length - 1
);
```

### Manual Override
```bash
# Limit to 8 workers
export MAX_WORKERS=8
```

## Usage

### In Orchestrator
```javascript
// Automatically uses worker pool if available
const result = await orc.workerPool.execute({
  type: 'llm_request',
  data: {
    model: 'llama2',
    messages: [{ role: 'user', content: 'Hello' }]
  }
});
```

### In Agents
```javascript
// Agent can offload heavy work
if (this.orchestrator.workerPool) {
  return await this.orchestrator.workerPool.execute({
    type: 'audio_process',
    data: audioBuffer
  });
}
```

## Performance Impact

### Your System (14 cores)
- **Before:** 1 core handling all requests
- **After:** 13 cores available for parallel work
- **Speedup:** Up to 13x for parallel tasks

### Mech Mac (Unknown cores)
```bash
# Check on Mech Mac
ssh villaromanzamech@192.168.0.60 'sysctl -n hw.ncpu'
```

## Task Queue

### Automatic Load Balancing
1. Task arrives
2. Check for available worker
3. If all busy, queue task
4. When worker free, process next task
5. Return result to caller

### No Configuration Needed
- Workers auto-scale to CPU count
- Queue automatically manages backpressure
- Failed tasks auto-retry on different worker

## Monitoring

### Worker Pool Status
```bash
# Check worker utilization
curl http://192.168.0.60:8406/api/workers/status
```

### Response
```json
{
  "totalWorkers": 13,
  "busyWorkers": 3,
  "queuedTasks": 5,
  "completedTasks": 1247
}
```

## Shutdown

### Graceful Cleanup
```javascript
// Automatically called on server shutdown
await workerPool.shutdown();
```

## Benefits

1. **Automatic** - No manual task distribution
2. **Efficient** - Uses all available cores
3. **Resilient** - Worker crashes don't affect others
4. **Scalable** - Adapts to machine CPU count
5. **Simple** - No code changes needed for basic usage

## Example: Before vs After

### Before (Single Core)
```
Request 1 → Main Thread → 100ms
Request 2 → Wait → 100ms
Request 3 → Wait → 100ms
Total: 300ms
```

### After (13 Cores)
```
Request 1 → Worker 1 → 100ms
Request 2 → Worker 2 → 100ms
Request 3 → Worker 3 → 100ms
Total: 100ms (3x faster)
```

## Next Steps

1. Deploy to Mech Mac
2. Monitor worker utilization
3. Tune MAX_WORKERS if needed
4. Add more task types to workers

---

**Status:** Ready for deployment  
**Impact:** 13x potential speedup on parallel tasks  
**Risk:** Low (workers isolated from main thread)
