// Keyboard + touch input handling + virtual joystick
import { state } from './config.js';

export function setupControls() {
  // Keyboard listeners
  document.addEventListener('keydown', e => {
    state.keys[e.key] = true;

    // Space bar to start ignition (from launch pad)
    if (e.key === ' ') {
      const btn = document.getElementById('igniteBtn');
      if (btn && btn.style.display !== 'none') {
        state._igniting = true;
      }
    }

    // Press 'R' to start return sequence (crewed mode)
    if (e.key === 'r' || e.key === 'R') {
      if (typeof window.startReturnSequence === 'function') {
        window.startReturnSequence();
      }
    }
  });

  document.addEventListener('keyup', e => {
    state.keys[e.key] = false;
  });

  // Touch joystick setup for mobile
  setupJoystick('joystickLeft', 'thumbL');
  setupJoystick('joystickRight', 'thumbR');
}

// Virtual joystick (same pattern as flight game)
export function setupJoystick(baseId, thumbId) {
  const base = document.getElementById(baseId);
  if (!base) return;

  let active = false;
  let startX, startY;
  const maxRadius = 40; // Joystick range in pixels

  base.addEventListener('pointerdown', e => {
    e.preventDefault();
    active = true;
    const rect = base.getBoundingClientRect();
    startX = rect.left + rect.width / 2;
    startY = rect.top + rect.height / 2;
    base.setPointerCapture(e.pointerId);
  });

  base.addEventListener('pointermove', e => {
    if (!active) return;
    e.preventDefault();

    let dx = e.clientX - startX;
    let dy = e.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxRadius) {
      dx = dx / dist * maxRadius;
      dy = dy / dist * maxRadius;
    }

    // Update thumb position
    const thumb = document.getElementById(thumbId);
    if (thumb) {
      thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }

    // Map to state sticks
    if (baseId === 'joystickLeft') {
      state.leftStick.x = dx / maxRadius;
      state.leftStick.y = dy / maxRadius;
    } else {
      state.rightStick.x = dx / maxRadius;
      state.rightStick.y = dy / maxRadius;
    }
  });

  base.addEventListener('pointerup', e => {
    active = false;
    const thumb = document.getElementById(thumbId);
    if (thumb) {
      thumb.style.transform = 'translate(-50%, -50%)';
    }
    if (baseId === 'joystickLeft') {
      state.leftStick.x = 0;
      state.leftStick.y = 0;
    } else {
      state.rightStick.x = 0;
      state.rightStick.y = 0;
    }
  });
}
