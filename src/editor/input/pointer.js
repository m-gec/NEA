import { clamp } from '../../engine/utils/maths.js';

const orbit_sensitivity = 3000;

export function initPointerControls(canvas, camera, {
  rotPerPx = 2 * Math.PI / Math.max(orbit_sensitivity, Math.min(canvas.clientWidth, canvas.clientHeight))
} = {}) {
  const pointers = new Map();

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY });
  }

  function onPointerMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const nx = e.clientX, ny = e.clientY;
    const dx = nx - p.px, dy = ny - p.py;
    p.px = nx; p.py = ny; p.x = nx; p.y = ny;
    if (pointers.size === 1) { camera.rotateYawPitch(-dx * rotPerPx, dy * rotPerPx); }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
  }


  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerUp, { passive: false });

  ['touchstart','touchmove','touchend','touchcancel'].forEach(type => {
    canvas.addEventListener(type, e => e.preventDefault(), { passive: false });
  });
}
