// Lightweight module to track whether the physical left Control key is pressed.
// Exports isLeftCtrlDown() to query the current state. Safe to require on
// server (returns false) because it guards window usage.

let leftDown = false;

function isBrowser() {
  return (typeof window !== 'undefined' && typeof window.addEventListener === 'function');
}

if (isBrowser()) {
  // Attach listeners once. Use event.code to detect the physical left Control key.
  try {
    window.addEventListener('keydown', (ev) => {
      try {
        if (ev && ev.code === 'ControlLeft') leftDown = true;
      } catch (e) {}
    });
    window.addEventListener('keyup', (ev) => {
      try {
        if (ev && ev.code === 'ControlLeft') leftDown = false;
      } catch (e) {}
    });
    // Reset on blur to avoid stuck state when window loses focus
    window.addEventListener('blur', () => { leftDown = false; });
  } catch (e) {}
}

function isLeftCtrlDown() {
  return !!leftDown;
}

export default { isLeftCtrlDown };
