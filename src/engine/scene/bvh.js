const NODE_STRIDE_BYTES = 32;
const LEAF_FLAG = 0x80000000;
const LEAF_SIZE = 4;

export function buildBvh(tris) {
  const triCount = Math.floor(tris.length / 9);
  if (triCount === 0) {
    return { nodeBytes: new Uint8Array(0), nodeCount: 0, indices: new Uint32Array(0) };
  }

  const triData = [];
  for (let i = 0; i < triCount; i++) {
    const base = i * 9;
    const v0 = [tris[base], tris[base + 1], tris[base + 2]];
    const v1 = [tris[base + 3], tris[base + 4], tris[base + 5]];
    const v2 = [tris[base + 6], tris[base + 7], tris[base + 8]];
    const bmin = [
      Math.min(v0[0], v1[0], v2[0]),
      Math.min(v0[1], v1[1], v2[1]),
      Math.min(v0[2], v1[2], v2[2]),
    ];
    const bmax = [
      Math.max(v0[0], v1[0], v2[0]),
      Math.max(v0[1], v1[1], v2[1]),
      Math.max(v0[2], v1[2], v2[2]),
    ];
    const centroid = [
      (v0[0] + v1[0] + v2[0]) / 3,
      (v0[1] + v1[1] + v2[1]) / 3,
      (v0[2] + v1[2] + v2[2]) / 3,
    ];
    triData.push({ bmin, bmax, centroid });
  }

  const indices = Array.from({ length: triCount }, (_, i) => i);
  const nodes = [];
  const outIndices = [];

  const buildNode = (slice) => {
    const nodeIndex = nodes.length;
    const bounds = { bmin: [Infinity, Infinity, Infinity], bmax: [-Infinity, -Infinity, -Infinity], cmin: [Infinity, Infinity, Infinity], cmax: [-Infinity, -Infinity, -Infinity] };
    for (const idx of slice) {
      const t = triData[idx];
      for (let k = 0; k < 3; k++) {
        bounds.bmin[k] = Math.min(bounds.bmin[k], t.bmin[k]);
        bounds.bmax[k] = Math.max(bounds.bmax[k], t.bmax[k]);
        bounds.cmin[k] = Math.min(bounds.cmin[k], t.centroid[k]);
        bounds.cmax[k] = Math.max(bounds.cmax[k], t.centroid[k]);
      }
    }

    nodes.push({ bmin: bounds.bmin, bmax: bounds.bmax, left: 0, right: 0 });

    if (slice.length <= LEAF_SIZE) {
      const start = outIndices.length;
      slice.forEach((idx) => outIndices.push(idx));
      nodes[nodeIndex].left = LEAF_FLAG | start;
      nodes[nodeIndex].right = slice.length;
      return nodeIndex;
    }

    const extents = [
      bounds.cmax[0] - bounds.cmin[0],
      bounds.cmax[1] - bounds.cmin[1],
      bounds.cmax[2] - bounds.cmin[2],
    ];
    let axis = 0;
    if (extents[1] > extents[0]) axis = 1;
    if (extents[2] > extents[axis]) axis = 2;

    slice.sort((a, b) => triData[a].centroid[axis] - triData[b].centroid[axis]);
    const mid = Math.floor(slice.length / 2);
    const leftSlice = slice.slice(0, mid);
    const rightSlice = slice.slice(mid);

    const leftIndex = buildNode(leftSlice);
    const rightIndex = buildNode(rightSlice);
    nodes[nodeIndex].left = leftIndex;
    nodes[nodeIndex].right = rightIndex;
    return nodeIndex;
  };

  buildNode(indices);

  const buffer = new ArrayBuffer(nodes.length * NODE_STRIDE_BYTES);
  const view = new DataView(buffer);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const base = i * NODE_STRIDE_BYTES;
    view.setFloat32(base + 0, node.bmin[0], true);
    view.setFloat32(base + 4, node.bmin[1], true);
    view.setFloat32(base + 8, node.bmin[2], true);
    view.setUint32(base + 12, node.left >>> 0, true);
    view.setFloat32(base + 16, node.bmax[0], true);
    view.setFloat32(base + 20, node.bmax[1], true);
    view.setFloat32(base + 24, node.bmax[2], true);
    view.setUint32(base + 28, node.right >>> 0, true);
  }

  return { nodeBytes: new Uint8Array(buffer), nodeCount: nodes.length, indices: new Uint32Array(outIndices) };
}

export { NODE_STRIDE_BYTES };
