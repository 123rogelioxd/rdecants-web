/* =============================================================
   RDECANTS — EVENT BUS
   Decoupled pub/sub for inter-module communication.
   Future: swap emit() to forward events to API / analytics.
   ============================================================= */

const _handlers = {};

export const EventBus = {

  on(event, handler) {
    if (!_handlers[event]) _handlers[event] = [];
    _handlers[event].push(handler);
  },

  off(event, handler) {
    if (!_handlers[event]) return;
    _handlers[event] = _handlers[event].filter(h => h !== handler);
  },

  emit(event, data = {}) {
    (_handlers[event] || []).forEach(h => {
      try { h({ event, data, ts: Date.now() }); }
      catch (e) { console.error(`[EventBus] Handler error on "${event}"`, e); }
    });
  },

  once(event, handler) {
    const wrapped = (payload) => {
      handler(payload);
      this.off(event, wrapped);
    };
    this.on(event, wrapped);
  }
};
