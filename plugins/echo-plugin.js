/**
 * Example plugin — shows the canonical agent plugin contract.
 * Drop any file like this in a plugins/ directory and PluginLoader.loadDir() picks it up.
 */
const { definePlugin } = require('../src/plugin-loader');

module.exports = definePlugin({
  name: 'echo',
  version: '1.0.0',
  description: 'Returns the task as-is. Useful for testing and passthrough.',
  strengths: ['testing', 'passthrough', 'echo'],

  async execute(task) {
    return `echo: ${task}`;
  },

  async healthCheck() {
    return true;
  }
});
