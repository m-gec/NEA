import { Shape } from './object.js';

export const OBJ_STRIDE_BYTES = 112;

function writeVec3(f32, index, v) {
  f32[index] = v[0];
  f32[index + 1] = v[1];
  f32[index + 2] = v[2];
}

function writeBounds(f32, minIndex, maxIndex, min, max) {
  writeVec3(f32, minIndex, min);
  f32[minIndex + 3] = 0;
  writeVec3(f32, maxIndex, max);
  f32[maxIndex + 3] = 0;
}

function writeOptionalVec3(f32, index, v) {
  f32[index] = v?.[0] ?? 0;
  f32[index + 1] = v?.[1] ?? 0;
  f32[index + 2] = v?.[2] ?? 0;
}

const floatBitsBuffer = new ArrayBuffer(4);
const floatBitsF32 = new Float32Array(floatBitsBuffer);
const floatBitsU32 = new Uint32Array(floatBitsBuffer);

function toUint32FloatBits(value) {
  floatBitsF32[0] = value;
  return floatBitsU32[0];
}

export function packObject(obj) {
  const buf = new ArrayBuffer(OBJ_STRIDE_BYTES);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);
  f32[0]=obj.albedo[0]; f32[1]=obj.albedo[1]; f32[2]=obj.albedo[2]; f32[3]=obj.emission;
  f32[4]=obj.roughness; f32[5]=obj.metalness; f32[6]=obj.transmission; f32[7]=obj.ior;
  u32[8]=obj.shape>>>0; u32[9]=obj.flags>>>0;
  u32[10]=toUint32FloatBits(obj.attenuationDistance ?? 1.0);
  u32[11]=(obj.bvhRoot ?? 0xffffffff) >>> 0;

  const { min, max } = obj;
  writeBounds(f32, 20, 24, min, max);

  switch (obj.shape) {
    case Shape.sphere:
      writeVec3(f32, 12, obj.center);
      f32[15]=obj.radius;
      break;
    case Shape.aabb:
      writeBounds(f32, 12, 16, min, max);
      break;
    case Shape.mesh:
      f32[12]=obj.triStart; f32[13]=obj.triCount; f32[14]=0; f32[15]=0;
      writeOptionalVec3(f32, 16, obj.origin);
      f32[19]=0;
      break;
  }
  return new Uint8Array(buf);
}

export function packObjects(objs) {
  const out = new Uint8Array(objs.length * OBJ_STRIDE_BYTES);
  objs.forEach((o, i) => out.set(packObject(o), i * OBJ_STRIDE_BYTES));
  return out;
}

export function packTriangles(tris) {
  const floatsPerTri = 12;
  const buf = new ArrayBuffer(tris.length * floatsPerTri * 4);
  const f32 = new Float32Array(buf);
  let k = 0;
  for (const t of tris) {
    f32[k++]=t.v0[0]; f32[k++]=t.v0[1]; f32[k++]=t.v0[2]; f32[k++]=0;
    f32[k++]=t.v1[0]; f32[k++]=t.v1[1]; f32[k++]=t.v1[2]; f32[k++]=0;
    f32[k++]=t.v2[0]; f32[k++]=t.v2[1]; f32[k++]=t.v2[2]; f32[k++]=0;
  }
  return new Uint8Array(buf);
}
