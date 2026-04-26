
import { Shape, makeSphere, makeAABB, makeMesh } from './object.js';
import { packObjects, packTriangles } from './pack.js';
import { buildBvh, NODE_STRIDE_BYTES } from './bvh.js';

const SHAPE = Shape;
const BVH_NONE = 0xffffffff;
const BVH_LEAF_FLAG = 0x80000000;

export class SceneStore {
  constructor(device){
    this.device = device;

    this.tris = [];
    this.objects = [];

    this.triBuf = null;
    this.objBuf = null;
    this.triCap = 0;
    this.objCap = 0;
    this.bvhBuf = null;
    this.bvhIndexBuf = null;
    this.bvhCap = 0;
    this.bvhIndexCap = 0;

    this._nextId = 1;
    this._bvhDirty = true;
    this._bvhNodes = new Uint8Array(0);
    this._bvhIndices = new Uint32Array(0);
  }

  async init(){}

  _assignId(obj){
    obj.id = this._nextId++;
    return obj;
  }

  getIndexById(id){
    return this.objects.findIndex(o => o && o.id === id);
  }

  getObjectById(id){
    const i = this.getIndexById(id);
    return i >= 0 ? { index: i, obj: this.objects[i] } : null;
  }

  _invalidateBounds(o){
    o.min = [ 1e30, 1e30, 1e30 ];
    o.max = [-1e30,-1e30,-1e30 ];
  }

  _recomputeSphereBounds(obj){
    const c = obj.center, r = obj.radius;
    obj.min = [c[0]-r, c[1]-r, c[2]-r];
    obj.max = [c[0]+r, c[1]+r, c[2]+r];
  }

  _normalizeAabbBounds(obj){
    obj.min = [
      Math.min(obj.min[0], obj.max[0]),
      Math.min(obj.min[1], obj.max[1]),
      Math.min(obj.min[2], obj.max[2]),
    ];
    obj.max = [
      Math.max(obj.min[0], obj.max[0]),
      Math.max(obj.min[1], obj.max[1]),
      Math.max(obj.min[2], obj.max[2]),
    ];
  }

  _recomputeMeshBounds(meshIndex){
    const m = this.objects[meshIndex];
    if (!m || m.shape !== SHAPE.mesh) return;

    const start = m.triStart|0, count = m.triCount|0;
    if (count <= 0) { this._invalidateBounds(m); return; }

    const origin = m.origin ?? [0, 0, 0];
    let mn = [ 1e30, 1e30, 1e30 ];
    let mx = [-1e30,-1e30,-1e30 ];

    for (let i = 0; i < count; i++) {
      const t = this.tris[start + i];
      for (const v of [t.v0, t.v1, t.v2]) {
        const vx = v[0] + origin[0];
        const vy = v[1] + origin[1];
        const vz = v[2] + origin[2];
        mn[0] = Math.min(mn[0], vx);
        mn[1] = Math.min(mn[1], vy);
        mn[2] = Math.min(mn[2], vz);
        mx[0] = Math.max(mx[0], vx);
        mx[1] = Math.max(mx[1], vy);
        mx[2] = Math.max(mx[2], vz);
      }
    }
    m.min = mn; m.max = mx;
  }

  _findMeshIndexByGlobalTri(gi){
    return this.objects.findIndex(o =>
      o && o.shape === SHAPE.mesh &&
      gi >= (o.triStart|0) &&
      gi <  ((o.triStart|0) + (o.triCount|0))
    );
  }

  _refreshDerivedPerObject(){
    for (let i = 0; i < this.objects.length; i++) {
      const o = this.objects[i];
      if (!o) continue;
      if (o.shape === SHAPE.sphere) {
        this._recomputeSphereBounds(o);
      } else if (o.shape === SHAPE.aabb) {
        this._normalizeAabbBounds(o);
      } else if (o.shape === SHAPE.mesh) {
        this._recomputeMeshBounds(i);
      }
    }
  }

  async loadFromURL(url){
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load scene: ${res.status} ${res.statusText}`);
    let txt = await res.text();
    const { tris = [], objects = [] } = JSON.parse(txt);

    this.tris = tris.slice();
    this.objects = objects.map((o) => {
      const common = {
        name: o.name || '',
        albedo:o.albedo, emission:o.emission, roughness:o.roughness,
        metalness:o.metalness, transmission:o.transmission, ior:o.ior
      };
      if (o.shape === 'sphere') {
        return this._assignId(makeSphere({ center:o.center, radius:o.radius, ...common }));
      }
      if (o.shape === 'aabb') {
        return this._assignId(makeAABB({ min:o.min, max:o.max, ...common }));
      }
      if (o.shape === 'mesh') {
        return this._assignId(makeMesh({
          triStart:o.triStart|0,
          triCount:o.triCount|0,
          origin: o.origin ?? [0, 0, 0],
          ...common
        }));
      }
      return this._assignId(makeSphere({ name: o.name || 'Unknown' }));
    });

    this._refreshDerivedPerObject();
    this._markBvhDirty();
    this.upload();
  }

  upload(){

    this._refreshDerivedPerObject();
    if (this._bvhDirty) this._rebuildBvh();

    const triBytes = packTriangles(this.tris);
    const triSize = Math.max(256, (triBytes.byteLength + 255) & ~255);
    if(!this.triBuf || triSize > this.triCap){
      this.triBuf?.destroy?.();
      this.triBuf = this.device.createBuffer({
        size: triSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.triCap = triSize;
    }
    if (triBytes.byteLength > 0) {
      this.device.queue.writeBuffer(this.triBuf, 0, triBytes);
    }

    const objBytes = packObjects(this.objects);
    const objSize = Math.max(256, (objBytes.byteLength + 255) & ~255);
    if(!this.objBuf || objSize > this.objCap){
      this.objBuf?.destroy?.();
      this.objBuf = this.device.createBuffer({
        size: objSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.objCap = objSize;
    }
    if (objBytes.byteLength > 0) {
      this.device.queue.writeBuffer(this.objBuf, 0, objBytes);
    }

    const bvhBytes = this._bvhNodes ?? new Uint8Array(0);
    const bvhSize = Math.max(256, (bvhBytes.byteLength + 255) & ~255);
    if(!this.bvhBuf || bvhSize > this.bvhCap){
      this.bvhBuf?.destroy?.();
      this.bvhBuf = this.device.createBuffer({
        size: bvhSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.bvhCap = bvhSize;
    }
    if (bvhBytes.byteLength > 0) {
      this.device.queue.writeBuffer(this.bvhBuf, 0, bvhBytes);
    }

    const bvhIndexBytes = this._bvhIndices ?? new Uint32Array(0);
    const bvhIndexSize = Math.max(256, ((bvhIndexBytes.byteLength) + 255) & ~255);
    if(!this.bvhIndexBuf || bvhIndexSize > this.bvhIndexCap){
      this.bvhIndexBuf?.destroy?.();
      this.bvhIndexBuf = this.device.createBuffer({
        size: bvhIndexSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.bvhIndexCap = bvhIndexSize;
    }
    if (bvhIndexBytes.byteLength > 0) {
      this.device.queue.writeBuffer(this.bvhIndexBuf, 0, bvhIndexBytes);
    }
  }

  get triCount(){ return this.tris.length; }
  get objCount(){ return this.objects.length; }
  getTriBuffer(){ return this.triBuf; }
  getObjBuffer(){ return this.objBuf; }
  getBvhBuffer(){ return this.bvhBuf; }
  getBvhIndexBuffer(){ return this.bvhIndexBuf; }

  triCountForMesh(meshIndex){
    const o = this.objects[meshIndex];
    return (o && o.shape===SHAPE.mesh) ? (o.triCount|0) : 0;
  }

  updateTriangle(globalIndex, tri){
    if (globalIndex < 0 || globalIndex >= this.tris.length) return;
    this.tris[globalIndex] = tri;

    const mi = this._findMeshIndexByGlobalTri(globalIndex);
    if (mi >= 0) this._recomputeMeshBounds(mi);
    this._markBvhDirty();

    this.upload();
  }

  addTriangleToMesh(meshIndex, tri){
    const m = this.objects[meshIndex];
    if (!m || m.shape !== SHAPE.mesh) return;

    const insertAt = m.triStart + m.triCount;
    this.tris.splice(insertAt, 0, tri);
    m.triCount += 1;

    for (let i = 0; i < this.objects.length; i++) {
      if (i === meshIndex) continue;
      const o = this.objects[i];
      if (o && o.shape === SHAPE.mesh && o.triStart >= insertAt) {
        o.triStart += 1;
      }
    }

    this._recomputeMeshBounds(meshIndex);
    this._markBvhDirty();
    this.upload();
  }

  deleteTriangle(meshId, triLocalIndex){
    const meshIndex = this.getIndexById(meshId);
    if (meshIndex < 0) return;
    const m = this.objects[meshIndex];
    if (!m || m.shape !== SHAPE.mesh) return;

    const local = triLocalIndex|0;
    if (local < 0 || local >= (m.triCount|0)) return;

    const removeAt = (m.triStart|0) + local;
    this.tris.splice(removeAt, 1);
    m.triCount = Math.max(0, (m.triCount|0) - 1);

    for (let i = 0; i < this.objects.length; i++) {
      if (i === meshIndex) continue;
      const o = this.objects[i];
      if (o && o.shape === SHAPE.mesh && o.triStart > removeAt) {
        o.triStart -= 1;
      }
    }

    this._recomputeMeshBounds(meshIndex);
    this._markBvhDirty();
    this.upload();
  }

  addObject(obj){
    this._assignId(obj);

    if (obj.shape === SHAPE.sphere) this._recomputeSphereBounds(obj);
    if (obj.shape === SHAPE.aabb) this._normalizeAabbBounds(obj);

    this.objects.push(obj);
    if (obj.shape === SHAPE.mesh) this._markBvhDirty();
    this.upload();
  }

  deleteObject(index){
    if (index < 0 || index >= this.objects.length) return;
    const obj = this.objects[index];

    if (obj.shape === SHAPE.mesh) {
      const start = obj.triStart|0;
      const count = obj.triCount|0;
      if (count > 0) {
        this.tris.splice(start, count);
        for (let i = 0; i < this.objects.length; i++) {
          if (i === index) continue;
          const o = this.objects[i];
          if (o && o.shape === SHAPE.mesh && o.triStart > start) {
            o.triStart -= count;
          }
        }
      }
    }

    this.objects.splice(index, 1);
    if (obj.shape === SHAPE.mesh) this._markBvhDirty();
    this.upload();
  }

  deleteObjectById(id){
    const idx = this.getIndexById(id);
    if (idx >= 0) this.deleteObject(idx);
  }

  _markBvhDirty(){
    this._bvhDirty = true;
  }

  _rebuildBvh(){
    const nodesChunks = [];
    const indicesChunks = [];
    let nodeBase = 0;
    let indexBase = 0;

    for (let i = 0; i < this.objects.length; i++) {
      const o = this.objects[i];
      if (!o || o.shape !== SHAPE.mesh) {
        if (o) o.bvhRoot = BVH_NONE;
        continue;
      }
      const triStart = o.triStart | 0;
      const triCount = o.triCount | 0;
      if (triCount <= 0) {
        o.bvhRoot = BVH_NONE;
        continue;
      }
      if (triCount <= 4) {
        o.bvhRoot = BVH_NONE;
        continue;
      }

      const triData = new Float32Array(triCount * 9);
      let offset = 0;
      for (let t = 0; t < triCount; t++) {
        const tri = this.tris[triStart + t];
        triData[offset++] = tri.v0[0]; triData[offset++] = tri.v0[1]; triData[offset++] = tri.v0[2];
        triData[offset++] = tri.v1[0]; triData[offset++] = tri.v1[1]; triData[offset++] = tri.v1[2];
        triData[offset++] = tri.v2[0]; triData[offset++] = tri.v2[1]; triData[offset++] = tri.v2[2];
      }

      const { nodeBytes, nodeCount, indices } = buildBvh(triData);
      if (nodeCount === 0) {
        o.bvhRoot = BVH_NONE;
        continue;
      }

      for (let k = 0; k < indices.length; k++) {
        indices[k] = (indices[k] + triStart) >>> 0;
      }

      const dv = new DataView(nodeBytes.buffer, nodeBytes.byteOffset, nodeBytes.byteLength);
      for (let n = 0; n < nodeCount; n++) {
        const base = n * NODE_STRIDE_BYTES;
        const left = dv.getUint32(base + 12, true);
        const right = dv.getUint32(base + 28, true);
        if ((left & BVH_LEAF_FLAG) !== 0) {
          const start = left & ~BVH_LEAF_FLAG;
          dv.setUint32(base + 12, (BVH_LEAF_FLAG | (start + indexBase)) >>> 0, true);
          dv.setUint32(base + 28, right >>> 0, true);
        } else {
          dv.setUint32(base + 12, (left + nodeBase) >>> 0, true);
          dv.setUint32(base + 28, (right + nodeBase) >>> 0, true);
        }
      }

      nodesChunks.push(nodeBytes);
      indicesChunks.push(indices);
      o.bvhRoot = nodeBase >>> 0;
      nodeBase += nodeCount;
      indexBase += indices.length;
    }

    const totalNodeBytes = nodeBase * NODE_STRIDE_BYTES;
    const mergedNodes = new Uint8Array(totalNodeBytes);
    let nodeOffset = 0;
    for (const chunk of nodesChunks) {
      mergedNodes.set(chunk, nodeOffset);
      nodeOffset += chunk.byteLength;
    }

    const mergedIndices = new Uint32Array(indexBase);
    let indexOffset = 0;
    for (const chunk of indicesChunks) {
      mergedIndices.set(chunk, indexOffset);
      indexOffset += chunk.length;
    }

    this._bvhNodes = mergedNodes;
    this._bvhIndices = mergedIndices;
    this._bvhDirty = false;
  }
}
