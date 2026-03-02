/**
 * Event Store - Event sourcing with time travel debugging
 * Stores all events, enables replay and time travel
 */
class EventStore {
  constructor() {
    this.events = [];
    this.subscribers = new Map();
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
    handlers.forEach(h => h(event));
  }

  // Get all events (for debugging)
  getAllEvents() {
    return [...this.events];
  }
}

module.exports = EventStore;
