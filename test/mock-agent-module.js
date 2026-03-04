
class MockAgent {
  async execute(task) {
    return 'Mock result for: ' + task;
  }
}
module.exports = MockAgent;
