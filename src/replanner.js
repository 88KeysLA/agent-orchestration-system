/**
 * Dynamic Replanner - Adapts execution plans mid-flight
 * Monitors progress and adjusts strategy when needed
 */
class DynamicReplanner {
  constructor(options = {}) {
    this.plans = new Map();
    this.replanThreshold = options.replanThreshold || 0.3;
    this.maxReplans = options.maxReplans || 3;
  }

  // Create initial plan
  createPlan(planId, steps, goal) {
    const plan = {
      id: planId,
      goal,
      steps,
      currentStep: 0,
      status: 'active',
      replans: 0,
      history: [],
      startedAt: Date.now()
    };
    
    this.plans.set(planId, plan);
    return plan;
  }

  // Execute next step and check if replan needed
  async executeStep(planId, executor) {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');
    if (plan.status !== 'active') throw new Error('Plan not active');
    
    const step = plan.steps[plan.currentStep];
    if (!step) {
      plan.status = 'completed';
      return { completed: true };
    }
    
    try {
      const result = await executor(step);
      
      plan.history.push({
        step: plan.currentStep,
        action: step.action,
        result,
        success: true,
        timestamp: Date.now()
      });
      
      plan.currentStep++;
      
      // Check if replan needed
      const shouldReplan = this.shouldReplan(plan, result);
      if (shouldReplan && plan.replans < this.maxReplans) {
        return { needsReplan: true, reason: shouldReplan };
      }
      
      return { success: true, result };
    } catch (error) {
      plan.history.push({
        step: plan.currentStep,
        action: step.action,
        error: error.message,
        success: false,
        timestamp: Date.now()
      });
      
      return { needsReplan: true, reason: 'step_failed', error: error.message };
    }
  }

  // Replan remaining steps
  replan(planId, newSteps, reason) {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');
    
    const oldSteps = plan.steps.slice(plan.currentStep);
    plan.steps = [
      ...plan.steps.slice(0, plan.currentStep),
      ...newSteps
    ];
    
    plan.replans++;
    plan.history.push({
      type: 'replan',
      reason,
      oldSteps,
      newSteps,
      timestamp: Date.now()
    });
    
    return plan;
  }

  // Check if replan is needed
  shouldReplan(plan, result) {
    // Replan if progress is too slow
    if (result.progress && result.progress < this.replanThreshold) {
      return 'slow_progress';
    }
    
    // Replan if result suggests better approach
    if (result.suggestReplan) {
      return result.replanReason || 'better_approach_available';
    }
    
    return false;
  }

  // Get plan status
  getStatus(planId) {
    const plan = this.plans.get(planId);
    if (!plan) return null;
    
    return {
      id: plan.id,
      goal: plan.goal,
      status: plan.status,
      progress: plan.currentStep / plan.steps.length,
      currentStep: plan.currentStep,
      totalSteps: plan.steps.length,
      replans: plan.replans,
      duration: Date.now() - plan.startedAt
    };
  }

  // Get plan history
  getHistory(planId) {
    const plan = this.plans.get(planId);
    return plan ? plan.history : [];
  }
}

module.exports = DynamicReplanner;
