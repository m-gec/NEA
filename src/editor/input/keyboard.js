
//binding WASD keys to control camera movement
//E/Q to move up/down

export function initKeyboardControls(canvas, camera) {
  const baseSpeed = 2.8; //movement speed

  const down = new Set(); //set of currently pressed keys ignoring case
  if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;

  function onKeyDown(e) {
    const active = document.activeElement;
    //don't hijack typing in property inputs or textareas
    const isTyping = active && active !== canvas && /INPUT|TEXTAREA/.test(active.tagName);
    if (isTyping) return;
    down.add(e.key.toLowerCase());
    
    //prevent page scrolling when movement keys are pressed and canvas is active
    if (document.activeElement === canvas && ['w','a','s','d','q','e'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) { down.delete(e.key.toLowerCase()); }

  //bind events to listeners
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let lastT = performance.now();
  function step() {
    const now = performance.now();

    //time since previous frame used to make motion framerate-independent
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 1.0) dt = 0.1; //long deltas are ignored to avoid camera jumps

    let mx = 0, my = 0, mz = 0;
    const fwd = camera._forward(); //camera relative basis vectors
    const right = (() => {
      const up = [0, 1, 0];
      const r = [
        up[1]*fwd[2] - up[2]*fwd[1],
        up[2]*fwd[0] - up[0]*fwd[2],
        up[0]*fwd[1] - up[1]*fwd[0],
      ];
      const len = Math.hypot(r[0], r[1], r[2]) || 1;
      return [r[0]/len, r[1]/len, r[2]/len];
    })();

    //compose intent vector from currently pressed keys
    if (down.has('w')) { mx += fwd[0]; my += fwd[1]; mz += fwd[2]; }
    if (down.has('s')) { mx -= fwd[0]; my -= fwd[1]; mz -= fwd[2]; }
    if (down.has('d')) { mx += right[0]; my += right[1]; mz += right[2]; }
    if (down.has('a')) { mx -= right[0]; my -= right[1]; mz -= right[2]; }
    if (down.has('e')) { my += 1; }
    if (down.has('q')) { my -= 1; }

    const mag = Math.hypot(mx,my,mz);
    if (mag > 1e-6) {
      mx /= mag; my /= mag; mz /= mag;
      const dx = mx * baseSpeed * dt;
      const dy = my * baseSpeed * dt;
      const dz = mz * baseSpeed * dt;

      //preserve focus distance between the eye (camera pos) and the target while translating
      const dist = Math.max(0.01, Math.hypot(
        camera.target[0] - camera.eye[0],
        camera.target[1] - camera.eye[1],
        camera.target[2] - camera.eye[2],
      )) || 1.0;

      //move the eye by the calculated delta
      camera.eye[0] += dx;
      camera.eye[1] += dy;
      camera.eye[2] += dz;

      //rebuild the camera target from the updated eye and forward direction
      const f = camera._forward();
      camera.target[0] = camera.eye[0] + f[0] * dist;
      camera.target[1] = camera.eye[1] + f[1] * dist;
      camera.target[2] = camera.eye[2] + f[2] * dist;
      camera.updateMatrix(false); //recompute camera matrix
    }

    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
