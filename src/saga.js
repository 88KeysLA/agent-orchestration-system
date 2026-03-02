/**
 * Saga - Distributed transaction pattern with automatic rollback
 * Coordinates multi-step workflows with compensation
 */
class Saga {
  constructor(name) {
    this.name = name;
    this.steps = [];
    this.completedSteps = [];
    this.status = 'pending';
  }

  // Add step with forward and compensation actions
  addStep(name, action, compensation) {
    this.steps.push({ name, action, compensation });
    return this;
  }

  // Execute saga
  async execute(context = {}) {
    this.status = 'running';
    this.completedSteps = [];

    try {
      // Execute each step
      for (const step of this.steps) {
        const result = await step.action(context);
        this.completedSteps.push({ step, result });
        context = { ...context, ...result };
      }
      
      this.status = 'completed';
      return { success: true, context };
    } catch (error) {
      // Rollback on failure
      this.status = 'rolling_back';
      await this.rollback();
      this.status = 'failed';
      return { success: false, error: error.message, rolledBack: true };
    }
  }

  // Rollback completed steps in reverse order
  async rollback() {
    const toRollback = [...this.completedSteps].reverse();
    
    for (const { step, result } of toRollback) {
      if (step.compensation) {
        try {
          await step.compensation(result);
        } catch (err) {
          console.error(`Compensation failed for ${step.name}:`, err);
        }
      }
    }
  }

  // Get saga status
  getStatus() {
    return {
      name: this.name,
      status: this.status,
      completedSteps: this.completedSteps.length,
      totalSteps: this.steps.length
    };
  }
}

module.exports = Saga;
