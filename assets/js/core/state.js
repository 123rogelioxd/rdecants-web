/* =============================================================
   RDECANTS — APP STATE
   Lightweight reactive state container.
   ============================================================= */

import { EventBus } from './events.js';

const _state = {
  cartOpen:   false,
  cartCount:  0,
  initialized: false,
};

export const AppState = {

  get(key)        { return _state[key]; },

  set(key, value) {
    const prev = _state[key];
    _state[key]  = value;
    if (prev !== value) {
      EventBus.emit(`state:${key}`, { prev, next: value });
    }
  },

  snapshot() { return { ..._state }; }
};
