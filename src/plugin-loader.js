/**
 * AgentPlugin - Formal contract and loader for pluggable agents
 *
 * An agent plugin is any object (or npm module) exporting:
 *   {
 *     name: string,           // unique identifier
 *     version: string,        // semver
 *     execute: async (task) => string,
 *     healthCheck: async () => boolean,
 *     strengths: string[],    // for RL cold-start routing
 *     description?: string,
 *     config?: object         // default config (can be overridden)
 *   }
 *
 * PluginLoader validates the contract and registers into an orchestrator.
 *
 * Usage:
 *   // Load from object
 *   PluginLoader.register(orchestrator, myPlugin);
 *
 *   // Load from file/module path
 *   PluginLoader.load(orchestrator, './plugins/my-agent');
 *
 *   // Load all plugins from a directory
 *   await PluginLoader.loadDir(orchestrator, './plugins');
 */
const path = require('path');
const fs = require('fs');

const REQUIRED_FIELDS = ['name', 'version', 'execute', 'healthCheck'];

class PluginLoader {
  // Validate plugin contract
  static validate(plugin) {
    const errors = [];
    for (const field of REQUIRED_FIELDS) {
      if (plugin[field] == null) errors.push(`missing: ${field}`);
    }
    if (plugin.execute && typeof plugin.execute !== 'function') errors.push('execute must be a function');
    if (plugin.healthCheck && typeof plugin.healthCheck !== 'function') errors.push('healthCheck must be a function');
    if (errors.length) throw new Error(`Invalid plugin "${plugin.name || '?'}": ${errors.join(', ')}`);
    return true;
  }

  // Register a validated plugin into an orchestrator
  static register(orchestrator, plugin, overrides = {}) {
    PluginLoader.validate(plugin);
    const meta = {
      description: plugin.description || '',
      strengths: plugin.strengths || [],
      config: { ...plugin.config, ...overrides },
      ...overrides
    };
    orchestrator.registerAgent(plugin.name, plugin.version, plugin, meta);
    return plugin.name;
  }

  // Load from a file path or module name and register
  static load(orchestrator, modulePath, overrides = {}) {
    const resolved = modulePath.startsWith('.') ? path.resolve(modulePath) : modulePath;
    const plugin = require(resolved);
    return PluginLoader.register(orchestrator, plugin, overrides);
  }

  // Load all .js files from a directory
  static loadDir(orchestrator, dirPath, overrides = {}) {
    const dir = path.resolve(dirPath);
    if (!fs.existsSync(dir)) throw new Error(`Plugin dir not found: ${dir}`);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.startsWith('_'));
    const loaded = [];
    for (const file of files) {
      try {
        const name = PluginLoader.load(orchestrator, path.join(dir, file), overrides[file] || {});
        loaded.push(name);
      } catch (err) {
        // Skip invalid files, don't crash the whole load
        loaded.push({ file, error: err.message });
      }
    }
    return loaded;
  }
}

// Helper: create a plugin from a plain agent class/object
function definePlugin(spec) {
  PluginLoader.validate(spec);
  return spec;
}

module.exports = { PluginLoader, definePlugin };
