// Small SelectionManager: centralizes selection state and events so multiple
// viewers (Cytoscape, Sigma, Reagraph, GeoMap, Charts) can interoperate
// without each needing to directly manipulate shared React state.

// API (singleton):
// - select(elementJson)
// - unselect(elementJson)
// - toggle(elementJson)
// - clear()
// - getSelection() -> array of element JSONs
// - setSelection(array)
// - subscribe(handler) -> unsubscribe()
// - on(eventName, handler) / off(eventName, handler)
// Events emitted: 'select', 'unselect', 'change', 'clear'

const SelectionManager = (() => {
  // Use a minimal event emitter built on EventTarget for browser compat
  const _target = (typeof window !== 'undefined' && window.EventTarget) ? new window.EventTarget() : null;
  const listeners = { change: [], select: [], unselect: [], clear: [] };

  // canonical key for an element json (same logic as TopogramDetail)
  function canonicalKey(json) {
    if (!json || !json.data) return null;
    const d = json.data;
    if (d.source != null || d.target != null) {
      const id = d.id != null ? String(d.id) : `${String(d.source)}|${String(d.target)}`;
      return `edge:${id}`;
    }
    const id = d.id != null ? String(d.id) : (json._id != null ? String(json._id) : null);
    return id ? `node:${id}` : null;
  }

  // internal selection store: Map key -> element JSON
  const selectionMap = new Map();

  function emit(name, detail) {
    try {
      if (_target) {
        const evt = new CustomEvent(`selection:${name}`, { detail });
        _target.dispatchEvent(evt);
      }
    } catch (e) {}
    const lst = listeners[name] || [];
    lst.forEach(h => { try { h(detail); } catch (e) {} });
  }

  function getSelection() {
    return Array.from(selectionMap.values()).map(v => Object.assign({}, v));
  }

  function select(json) {
    const key = canonicalKey(json);
    if (!key) return false;
    if (!selectionMap.has(key)) {
      // store a shallow clone so callers can mutate their copy without
      // affecting the canonical store
      selectionMap.set(key, Object.assign({}, json));
      emit('select', { element: json });
      emit('change', { action: 'select', element: json, selected: getSelection() });
      return true;
    }
    return false;
  }

  function unselect(json) {
    const key = canonicalKey(json);
    if (!key) return false;
    if (selectionMap.has(key)) {
      const removed = selectionMap.get(key);
      selectionMap.delete(key);
      emit('unselect', { element: removed });
      emit('change', { action: 'unselect', element: removed, selected: getSelection() });
      return true;
    }
    return false;
  }

  function toggle(json) {
    const key = canonicalKey(json);
    if (!key) return false;
    if (selectionMap.has(key)) return unselect(json);
    return select(json);
  }

  function clear() {
    if (!selectionMap.size) return false;
    selectionMap.clear();
    emit('clear', {});
    emit('change', { action: 'clear', selected: [] });
    return true;
  }

  function setSelection(arr) {
    try {
      selectionMap.clear();
      if (Array.isArray(arr)) {
        arr.forEach(j => { const k = canonicalKey(j); if (k) selectionMap.set(k, Object.assign({}, j)); });
      }
      emit('change', { action: 'set', selected: getSelection() });
      return true;
    } catch (e) { return false; }
  }

  function subscribe(handler) {
    if (typeof handler !== 'function') return () => {};
    listeners.change.push(handler);
    // immediately call with current selection
    try { handler({ action: 'init', selected: getSelection() }); } catch (e) {}
    return () => { listeners.change = listeners.change.filter(h => h !== handler); };
  }

  function on(eventName, handler) {
    if (!listeners[eventName]) listeners[eventName] = [];
    listeners[eventName].push(handler);
    return () => off(eventName, handler);
  }
  function off(eventName, handler) {
    if (!listeners[eventName]) return;
    listeners[eventName] = listeners[eventName].filter(h => h !== handler);
  }

  // expose a tiny stable API
  return {
    select, unselect, toggle, clear, getSelection, setSelection, subscribe, on, off,
    // helper: canonicalKey for external use
    canonicalKey
  };
})();

export default SelectionManager;
