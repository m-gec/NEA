import { clamp, wrapPI, sub3, len3, normalize3, cross3, approxMatEqual } from '../utils/maths.js';

export class Camera {
  constructor({
    eye = [0, 1.5, -3],
    target = [0, 1, 1],
    fov = 70 * Math.PI / 180,
    resolutionScale = 1.6,
    maxDiffuseBounces = 3,
    maxSpecularBounces = 6,
    samplesPerFrame = 1,
    maxSamples = 512,
  } = {}) {
    this.eye = new Float32Array(3);
    this.target = new Float32Array(3);
    this.fov = fov;
    this.resolutionScale = resolutionScale;
    this.maxDiffuseBounces = maxDiffuseBounces;
    this.maxSpecularBounces = maxSpecularBounces;
    this.samplesPerFrame = samplesPerFrame;
    this.maxSamples = maxSamples;

    this._world = new Float32Array(16);
    this._prevWorld = new Float32Array(16);
    this.sampleIndex = 0;

    this.eye.set(eye);
    this.target.set(target);

    const f = normalize3(sub3(this.target, this.eye));
    this.yaw = Math.atan2(f[0], f[2]);
    this.pitch = Math.asin(clamp(f[1], -1, 1));
    this._clampPitch();

    this.updateMatrix(true);
  }

  lookAt(x, y, z) {
    const f = normalize3([x - this.eye[0], y - this.eye[1], z - this.eye[2]]);
    this.yaw = Math.atan2(f[0], f[2]);
    this.pitch = Math.asin(clamp(f[1], -1, 1));
    this._clampPitch();
    this.target[0] = x; this.target[1] = y; this.target[2] = z;
    this.updateMatrix(false);
  }

  setEye(x, y, z, updateFocus = true) {
    this.eye[0] = x; this.eye[1] = y; this.eye[2] = z;
    if (updateFocus) {
      const f = this._forward();
      const dist = Math.max(0.01, len3(sub3(this.target, this.eye))) || 5.0;
      this.target[0] = this.eye[0] + f[0] * dist;
      this.target[1] = this.eye[1] + f[1] * dist;
      this.target[2] = this.eye[2] + f[2] * dist;
    }
    this.updateMatrix(false);
  }

  rotateYawPitch(dYaw, dPitch) {
    this.yaw = wrapPI(this.yaw + dYaw);
    this.pitch = clamp(this.pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT);
    const f = this._forward();
    const dist = Math.max(0.01, len3(sub3(this.target, this.eye))) || 1.0;
    this.target[0] = this.eye[0] + f[0] * dist;
    this.target[1] = this.eye[1] + f[1] * dist;
    this.target[2] = this.eye[2] + f[2] * dist;
    this.updateMatrix(false);
  }

  updateMatrix(force = false) {
    const f = this._forward();
    const r = normalize3(cross3([0, 1, 0], f));
    const u = cross3(f, r);

    const m = this._world;
    m[0]=r[0]; m[1]=r[1]; m[2]=r[2]; m[3]=0;
    m[4]=u[0]; m[5]=u[1]; m[6]=u[2]; m[7]=0;
    m[8]=f[0]; m[9]=f[1]; m[10]=f[2]; m[11]=0;
    m[12]=this.eye[0]; m[13]=this.eye[1]; m[14]=this.eye[2]; m[15]=1;

    const changed = force || !approxMatEqual(this._prevWorld, m);
    if (changed) {
      this.sampleIndex = 0;
      this._prevWorld.set(m);
    }
    return changed;
  }

  packUniformBlock({
    width,
    height,
    time = 0,
    objCount = 0,
    triCount = 0,
    samplesPerFrame = 1,
    maxDiffuseBounces = 3,
    maxSpecularBounces = 6,
  }) {
    const buf = new ArrayBuffer(144);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);

    f32[0] = width; f32[1] = height; f32[2] = time; f32[3] = 0.0;
    f32.set(this._world, 4);
    f32[20] = this.fov; f32[21] = 0.0; f32[22] = 0.0;
    u32[23] = objCount >>> 0;
    u32[24] = this.sampleIndex >>> 0;
    u32[25] = 0;
    u32[26] = samplesPerFrame >>> 0;
    u32[27] = maxDiffuseBounces >>> 0;
    u32[28] = maxSpecularBounces >>> 0;
    u32[29] = triCount >>> 0;
    u32[30] = 0;
    u32[31] = 0;
    u32[32] = 0;
    u32[33] = 0;
    u32[34] = 0;
    u32[35] = 0;
    return buf;
  }

  _forward() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw),   cy = Math.cos(this.yaw);
    return normalize3([cp * sy, sp, cp * cy]);
  }

  _clampPitch() {
    this.pitch = clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }
}

const PITCH_LIMIT = 89.5 * Math.PI / 180;
