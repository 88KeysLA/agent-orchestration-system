# Reinforcement Learning for Agent Orchestration

## Current State: Basic Learning

The current design has **basic pattern learning** but lacks true reinforcement learning:

### What We Have ✅
- Metrics collection (success/failure)
- Pattern recognition (successful agent combinations)
- Simple auto-tuning (adjust rules based on success rates)

### What's Missing ❌
- **Reward signals** - No explicit reward function
- **State representation** - No formal state space
- **Action space** - No formal action definitions
- **Policy learning** - No policy gradient or Q-learning
- **Exploration vs exploitation** - No epsilon-greedy or similar
- **Multi-armed bandit** - No contextual bandit for agent selection

---

## Proper RL Design

### 1. Problem Formulation

**Markov Decision Process (MDP):**
```
State (s): {
  taskDescription: string,
  taskType: enum,
  domain: enum,
  urgency: enum,
  complexity: enum,
  currentAgent: string,
  previousAgents: [string],
  contextSize: int,
  timeElapsed: int,
  validationsPassed: int,
  validationsFailed: int
}

Action (a): {
  selectAgent: string,
  mode: "fast-track" | "thorough",
  addValidationGate: boolean,
  addSecurityGate: boolean
}

Reward (r): {
  taskSuccess: +100,
  taskFailure: -100,
  timeBonus: +(100 - timeInMinutes),
  qualityBonus: +userSatisfaction * 20,
  validationCaught: +50,
  postDeploymentIssue: -75,
  costSavings: +costSaved
}

Transition: P(s' | s, a)
```

### 2. Multi-Armed Bandit for Agent Selection

**Contextual Bandit:**
```python
class AgentBandit:
    def __init__(self):
        self.agents = ['gpu-dev', 'prreddy-coder', 'music-general', ...]
        self.q_values = {}  # Q(context, agent) -> expected reward
        self.counts = {}    # N(context, agent) -> selection count
        self.epsilon = 0.1  # Exploration rate
        
    def select_agent(self, context):
        # Epsilon-greedy exploration
        if random.random() < self.epsilon:
            return random.choice(self.agents)  # Explore
        else:
            return self.best_agent(context)     # Exploit
    
    def best_agent(self, context):
        # UCB1 (Upper Confidence Bound)
        scores = {}
        for agent in self.agents:
            q = self.q_values.get((context, agent), 0)
            n = self.counts.get((context, agent), 0)
            ucb = q + sqrt(2 * log(sum(self.counts.values())) / (n + 1))
            scores[agent] = ucb
        return max(scores, key=scores.get)
    
    def update(self, context, agent, reward):
        key = (context, agent)
        n = self.counts.get(key, 0)
        q = self.q_values.get(key, 0)
        
        # Incremental mean update
        self.counts[key] = n + 1
        self.q_values[key] = q + (reward - q) / (n + 1)
```

### 3. Deep Q-Network (DQN) for Workflow Optimization

**Neural Network Policy:**
```python
class WorkflowDQN:
    def __init__(self):
        self.model = self.build_network()
        self.target_model = self.build_network()
        self.memory = ReplayBuffer(capacity=10000)
        self.gamma = 0.99  # Discount factor
        
    def build_network(self):
        return Sequential([
            Dense(128, activation='relu', input_dim=state_dim),
            Dense(128, activation='relu'),
            Dense(64, activation='relu'),
            Dense(num_actions, activation='linear')
        ])
    
    def select_action(self, state, epsilon=0.1):
        if random.random() < epsilon:
            return random.randint(0, num_actions - 1)
        q_values = self.model.predict(state)
        return np.argmax(q_values)
    
    def train(self, batch_size=32):
        if len(self.memory) < batch_size:
            return
        
        batch = self.memory.sample(batch_size)
        states, actions, rewards, next_states, dones = batch
        
        # Q-learning update
        q_values = self.model.predict(states)
        next_q_values = self.target_model.predict(next_states)
        
        for i in range(batch_size):
            if dones[i]:
                q_values[i][actions[i]] = rewards[i]
            else:
                q_values[i][actions[i]] = rewards[i] + self.gamma * np.max(next_q_values[i])
        
        self.model.fit(states, q_values, epochs=1, verbose=0)
```

### 4. Policy Gradient for Sequence Optimization

**REINFORCE Algorithm:**
```python
class WorkflowPolicy:
    def __init__(self):
        self.model = self.build_policy_network()
        self.optimizer = Adam(learning_rate=0.001)
        
    def build_policy_network(self):
        return Sequential([
            Dense(128, activation='relu', input_dim=state_dim),
            Dense(128, activation='relu'),
            Dense(num_agents, activation='softmax')  # Probability distribution
        ])
    
    def select_agent_sequence(self, state, max_length=5):
        sequence = []
        for _ in range(max_length):
            probs = self.model.predict(state)
            agent = np.random.choice(num_agents, p=probs[0])
            sequence.append(agent)
            state = self.update_state(state, agent)
        return sequence
    
    def train(self, episodes):
        for episode in episodes:
            states, actions, rewards = episode
            
            # Calculate discounted returns
            returns = []
            G = 0
            for r in reversed(rewards):
                G = r + self.gamma * G
                returns.insert(0, G)
            
            # Policy gradient update
            with tf.GradientTape() as tape:
                log_probs = []
                for state, action in zip(states, actions):
                    probs = self.model(state)
                    log_prob = tf.math.log(probs[0][action])
                    log_probs.append(log_prob)
                
                loss = -tf.reduce_sum([lp * r for lp, r in zip(log_probs, returns)])
            
            grads = tape.gradient(loss, self.model.trainable_variables)
            self.optimizer.apply_gradients(zip(grads, self.model.trainable_variables))
```

### 5. Thompson Sampling for Exploration

**Bayesian Approach:**
```python
class ThompsonSamplingAgent:
    def __init__(self):
        self.agents = ['gpu-dev', 'prreddy-coder', ...]
        # Beta distribution parameters for each agent
        self.alpha = {agent: 1 for agent in self.agents}  # Successes + 1
        self.beta = {agent: 1 for agent in self.agents}   # Failures + 1
    
    def select_agent(self, context):
        # Sample from posterior distributions
        samples = {}
        for agent in self.agents:
            samples[agent] = np.random.beta(self.alpha[agent], self.beta[agent])
        return max(samples, key=samples.get)
    
    def update(self, agent, success):
        if success:
            self.alpha[agent] += 1
        else:
            self.beta[agent] += 1
```

---

## Implementation Plan

### Phase 1: Multi-Armed Bandit (Week 1)
```javascript
// agent-bandit.js
class AgentBandit {
  constructor() {
    this.qValues = new Map();
    this.counts = new Map();
    this.epsilon = 0.1;
  }
  
  selectAgent(context) {
    if (Math.random() < this.epsilon) {
      return this.explore();
    }
    return this.exploit(context);
  }
  
  update(context, agent, reward) {
    const key = `${context}-${agent}`;
    const n = this.counts.get(key) || 0;
    const q = this.qValues.get(key) || 0;
    
    this.counts.set(key, n + 1);
    this.qValues.set(key, q + (reward - q) / (n + 1));
  }
}
```

### Phase 2: Thompson Sampling (Week 2)
```javascript
// thompson-sampling.js
class ThompsonSampling {
  constructor() {
    this.alpha = new Map();
    this.beta = new Map();
  }
  
  selectAgent(agents) {
    const samples = agents.map(agent => ({
      agent,
      sample: this.betaSample(
        this.alpha.get(agent) || 1,
        this.beta.get(agent) || 1
      )
    }));
    
    return samples.reduce((best, curr) => 
      curr.sample > best.sample ? curr : best
    ).agent;
  }
  
  betaSample(alpha, beta) {
    // Use jStat or similar library
    return jStat.beta.sample(alpha, beta);
  }
}
```

### Phase 3: Deep RL (Week 3-4)
Use TensorFlow.js for browser/Node.js:
```javascript
// workflow-dqn.js
const tf = require('@tensorflow/tfjs-node');

class WorkflowDQN {
  constructor() {
    this.model = this.buildModel();
    this.targetModel = this.buildModel();
    this.memory = [];
    this.gamma = 0.99;
  }
  
  buildModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({units: 128, activation: 'relu', inputShape: [stateSize]}));
    model.add(tf.layers.dense({units: 128, activation: 'relu'}));
    model.add(tf.layers.dense({units: numActions, activation: 'linear'}));
    model.compile({optimizer: 'adam', loss: 'meanSquaredError'});
    return model;
  }
  
  async selectAction(state, epsilon = 0.1) {
    if (Math.random() < epsilon) {
      return Math.floor(Math.random() * numActions);
    }
    const qValues = await this.model.predict(tf.tensor2d([state]));
    return qValues.argMax(-1).dataSync()[0];
  }
}
```

---

## Reward Function Design

### Immediate Rewards
```javascript
function calculateReward(task) {
  let reward = 0;
  
  // Task completion
  if (task.success) reward += 100;
  else reward -= 100;
  
  // Time efficiency
  const timeBonus = Math.max(0, 100 - task.durationMinutes);
  reward += timeBonus;
  
  // Quality
  reward += task.userSatisfaction * 20;
  
  // Validation effectiveness
  reward += task.issuesCaughtByValidation * 50;
  reward -= task.postDeploymentIssues * 75;
  
  // Cost efficiency
  reward += task.costSavings;
  
  return reward;
}
```

### Delayed Rewards
```javascript
function calculateDelayedReward(task, days = 7) {
  let reward = 0;
  
  // No incidents after deployment
  if (task.incidentsAfterDeployment === 0) reward += 200;
  
  // Reusability
  reward += task.codeReused * 50;
  
  // Team satisfaction
  reward += task.teamSatisfaction * 30;
  
  return reward;
}
```

---

## State Representation

### Feature Engineering
```javascript
function extractFeatures(task) {
  return {
    // Task characteristics
    taskTypeEncoded: oneHotEncode(task.type, taskTypes),
    domainEncoded: oneHotEncode(task.domain, domains),
    urgencyScore: urgencyToScore(task.urgency),
    complexityScore: complexityToScore(task.complexity),
    
    // Context
    contextSize: task.contextSize / 1000,  // Normalize
    timeElapsed: task.timeElapsed / 60,    // Minutes
    
    // History
    previousAgentsEncoded: multiHotEncode(task.previousAgents, allAgents),
    validationsPassed: task.validationsPassed,
    validationsFailed: task.validationsFailed,
    
    // Embeddings
    taskDescriptionEmbedding: getEmbedding(task.description)  // 768-dim
  };
}
```

---

## Evaluation Metrics

### Online Metrics
- **Regret:** Difference from optimal policy
- **Cumulative Reward:** Total reward over time
- **Success Rate:** Task completion rate
- **Average Time:** Time to complete tasks

### Offline Metrics
- **Policy Evaluation:** Estimate policy value
- **A/B Testing:** Compare RL vs rule-based
- **Counterfactual Analysis:** What if we chose differently?

---

## A/B Testing Framework

```javascript
class ABTest {
  constructor() {
    this.control = new RuleBasedRouter();  // Current system
    this.treatment = new RLRouter();        // RL system
    this.splitRatio = 0.5;
  }
  
  route(task) {
    const useRL = Math.random() < this.splitRatio;
    const router = useRL ? this.treatment : this.control;
    
    const result = router.route(task);
    this.logResult(task, result, useRL);
    
    return result;
  }
  
  analyze() {
    // Statistical significance testing
    const controlMetrics = this.getMetrics('control');
    const treatmentMetrics = this.getMetrics('treatment');
    
    return {
      successRateLift: treatmentMetrics.successRate - controlMetrics.successRate,
      timeSavings: controlMetrics.avgTime - treatmentMetrics.avgTime,
      pValue: this.tTest(controlMetrics, treatmentMetrics)
    };
  }
}
```

---

## Summary

### What We Need to Add

1. **Multi-Armed Bandit** (Week 1-2)
   - Contextual bandit for agent selection
   - Thompson sampling for exploration
   - UCB for confidence bounds

2. **Deep RL** (Week 3-4)
   - DQN for workflow optimization
   - Policy gradient for sequence learning
   - Experience replay

3. **Reward Engineering** (Week 5)
   - Immediate rewards (success, time, quality)
   - Delayed rewards (incidents, reusability)
   - Reward shaping

4. **Evaluation** (Week 6)
   - A/B testing framework
   - Online metrics
   - Offline evaluation

### Expected Improvements

- **Agent Selection:** 95%+ optimal (vs 80% rule-based)
- **Workflow Optimization:** 30% faster convergence
- **Exploration:** Discover new successful patterns
- **Adaptation:** Automatically adapt to changing conditions

### Implementation Priority

1. **High:** Multi-armed bandit (immediate value)
2. **Medium:** Thompson sampling (better exploration)
3. **Low:** Deep RL (requires more data, infrastructure)

---

**Recommendation:** Start with multi-armed bandit in Phase 1, add Thompson sampling in Phase 2, evaluate need for deep RL based on results.
