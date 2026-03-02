/**
 * Event Store - Event sourcing with time travel debugging
 * Stores all events, enables replay and time travel
 * Optional disk persistence via persistPath
 */
const fs = require('fs');
const path = require('path');

class EventStore {
  constructor(options = {}) {
    this.events = [];
    this.subscribers = new Map();
    this.persistPath = options.persistPath || null;
    this._maxPersistedEvents = options.maxPersistedEvents || 5000;
    this._dirty = false;
    this._saveTimer = null;

    if (this.persistPath) {
      this._load();
    }
  }

  // Append event to store
  append(aggregateId, eventType, data) {
    const event = {
      id: this.events.length,
      aggregateId,
      eventType,
      data,
      timestamp: Date.now()
    };
    this.events.push(event);
    this._notify(event);
    this._scheduleSave();
    return event;
  }

  // Get all events for an aggregate
  getEvents(aggregateId, fromTimestamp = 0) {
    return this.events.filter(e => 
      e.aggregateId === aggregateId && e.timestamp >= fromTimestamp
    );
  }

  // Replay events to rebuild state
  replay(aggregateId, reducer, initialState = {}) {
    const events = this.getEvents(aggregateId);
    return events.reduce(reducer, initialState);
  }

  // Time travel: get state at specific time
  getStateAt(aggregateId, timestamp, reducer, initialState = {}) {
    const events = this.getEvents(aggregateId, 0).filter(e => e.timestamp <= timestamp);
    return events.reduce(reducer, initialState);
  }

  // Subscribe to events
  subscribe(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType).push(handler);
  }

  // Notify subscribers
  _notify(event) {
    const handlers = this.subscribers.get(event.eventType) || [];
    const wildcards = this.subscribers.get('*') || [];
    [...handlers, ...wildcards].forEach(h => h(event));
  }

  // Get all events (for debugging)
  getAllEvents() {
    return [...this.events];
  }

  // Debounced save — batches rapid appends (100ms)
  _scheduleSave() {
    if (!this.persistPath) return;
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      if (this._dirty) this.save();
    }, 100);
  }

  save() {
    if (!this.persistPath) return;
    this._dirty = false;
    const dir = path.dirname(this.persistPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Trim to max if needed (keep most recent)
    const toSave = this.events.length > this._maxPersistedEvents
      ? this.events.slice(-this._maxPersistedEvents)
      : this.events;

    const data = {
      events: toSave,
      savedAt: new Date().toISOString(),
      totalAppended: this.events.length
    };
    fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
  }

  _load() {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) return;
    try {
      const raw = fs.readFileSync(this.persistPath, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.events)) {
        this.events = data.events;
      }
    } catch {
      // Corrupt file — start fresh
      this.events = [];
    }
  }

  // Flush pending saves (for shutdown)
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._dirty) this.save();
  }
}

module.exports = EventStore;
