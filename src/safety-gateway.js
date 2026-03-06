/**
 * SafetyGateway — Single source of truth for Villa Romanza safety rules
 *
 * Used by: ha-agent.js (HASafetyGate), agent-tools.js (ha_call_service),
 * and any future agent that touches HA entities.
 *
 * Rules from System Constitution v1.1:
 * - Master suite lights: excluded from agent control
 * - Security entities: excluded
 * - Garage/Laundry: Hard Rule 4 — never activated by global/domain service
 * - Volume: capped at 70%
 * - Sensors: read-only
 * - Agent-controlled entities: always writable
 */

const DOMAIN_RULES = {
  light:          { write: true,  excludePatterns: [/master/i, /security/i] },
  media_player:   { write: true,  maxVolume: 0.7 },
  input_select:   { write: true,  allowedEntities: ['input_select.villa_mode'] },
  input_boolean:  { write: true,  allowedPatterns: [/agent_controlled/i, /mood_time/i, /presence/i] },
  input_number:   { write: true,  allowedPatterns: [/agent_controlled/i, /mood_time/i] },
  input_text:     { write: true,  allowedPatterns: [/agent_controlled/i] },
  sensor:         { write: false },
  binary_sensor:  { write: false },
  switch:         { write: true,  excludePatterns: [/garage/i, /laundry/i, /security/i] },
  script:         { write: true },
  scene:          { write: true },
  climate:        { write: true,  excludePatterns: [/security/i] },
  cover:          { write: true,  excludePatterns: [/garage/i] },
};

class SafetyGateway {
  constructor(overrides = {}) {
    this.rules = { ...DOMAIN_RULES, ...overrides };
  }

  /**
   * Check if an operation is allowed.
   * @param {string} operation - 'read' or 'write'
   * @param {string} entityId - e.g. 'light.theatre'
   * @param {object} data - service call data (mutated in place for volume capping)
   * @returns {{ allowed: boolean, reason?: string }}
   */
  check(operation, entityId, data) {
    const domain = entityId.split('.')[0];
    const rule = this.rules[domain];

    // Read always allowed
    if (operation === 'read') return { allowed: true };

    // Unknown domain blocked
    if (!rule) return { allowed: false, reason: `Domain '${domain}' not in safety allowlist` };

    // Read-only domains
    if (!rule.write) return { allowed: false, reason: `Domain '${domain}' is read-only` };

    // Exclude patterns (master suite, security, garage, laundry)
    if (rule.excludePatterns) {
      for (const pattern of rule.excludePatterns) {
        if (pattern.test(entityId)) {
          return { allowed: false, reason: `Entity '${entityId}' blocked by safety rule: ${pattern}` };
        }
      }
    }

    // Allowed entities whitelist
    if (rule.allowedEntities && !rule.allowedEntities.includes(entityId)) {
      return { allowed: false, reason: `Entity '${entityId}' not in allowed list for ${domain}` };
    }

    // Allowed patterns whitelist
    if (rule.allowedPatterns && !rule.allowedPatterns.some(p => p.test(entityId))) {
      return { allowed: false, reason: `Entity '${entityId}' does not match allowed patterns for ${domain}` };
    }

    // Volume cap for media_player
    if (domain === 'media_player' && rule.maxVolume && data) {
      if (data.volume_level !== undefined && data.volume_level > rule.maxVolume) {
        data.volume_level = rule.maxVolume;
      }
    }

    return { allowed: true };
  }
}

// Singleton for shared use
const gateway = new SafetyGateway();

module.exports = { SafetyGateway, gateway, DOMAIN_RULES };
