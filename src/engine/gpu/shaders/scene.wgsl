

struct Bounds { bmin: vec3<f32>, bmax: vec3<f32> }

const BVH_LEAF_FLAG: u32 = 0x80000000u;
const BVH_NONE: u32 = 0xffffffffu;
const BVH_STACK_MAX: u32 = 64u;

fn objBounds(o: Obj) -> Bounds {
  if (o.typ == SHAPE_AABB) { return Bounds(o.d0.xyz, o.d1.xyz); }
  return Bounds(o.d2.xyz, o.d3.xyz);
}

fn boundsValid(B: Bounds) -> bool {
  return (B.bmin.x <= B.bmax.x) && (B.bmin.y <= B.bmax.y) && (B.bmin.z <= B.bmax.z);
}

fn sceneIntersect(ray: Ray, tMax: f32) -> Hit {
  var best = makeNoHit();

  for (var oi: u32 = 0u; oi < U.objCount; oi = oi + 1u) {
    let obj = OBJS[oi];

    let B = objBounds(obj);
    if (boundsValid(B)) {
      let hb = intersectAABB(ray.ori, ray.dir, B.bmin, B.bmax, TMIN, best.t);
      if (hb.t < 0.0) { continue; }
    }

    var h: Hit;

    if (obj.typ == SHAPE_SPHERE) {
      h = intersectSphere(ray.ori, ray.dir, obj.d0.xyz, obj.d0.w, TMIN, best.t);
      if (h.t < best.t) { best = Hit(h.t, h.pos, h.normal, oi); }

    } else if (obj.typ == SHAPE_AABB) {
      h = intersectAABB_Hit(ray.ori, ray.dir, obj.d0.xyz, obj.d1.xyz, TMIN, best.t);
      if (h.t < best.t) { best = Hit(h.t, h.pos, h.normal, oi); }

    } else if (obj.typ == SHAPE_MESH) {
      let origin = obj.d1.xyz;
      let localRay = Ray(ray.ori - origin, ray.dir);
      let root = obj.uB;
      if (root != BVH_NONE) {
        var stack : array<u32, 64>;
        var sp: i32 = 0;
        stack[0] = root;
        sp = 1;

        loop {
          if (sp <= 0) { break; }
          sp = sp - 1;
          let ni = stack[sp];
          let node = BVH_NODES[ni];
          let hb = intersectAABB(localRay.ori, localRay.dir, node.bmin, node.bmax, TMIN, best.t);
          if (hb.t < 0.0) { continue; }

          let left = node.left;
          if ((left & BVH_LEAF_FLAG) != 0u) {
            let start = left & ~BVH_LEAF_FLAG;
            let count = node.right;
            for (var li = 0u; li < count; li = li + 1u) {
              let tri = TRIS[TRI_INDICES[start + li]];
              let th = intersectTri(localRay.ori, localRay.dir, tri.v0, tri.v1, tri.v2, TMIN, best.t);
              if (th.t < best.t) { best = Hit(th.t, th.pos + origin, th.normal, oi); }
            }
          } else {
            let right = node.right;
            if (sp + 2 > i32(BVH_STACK_MAX)) { continue; }
            stack[sp] = left; sp = sp + 1;
            stack[sp] = right; sp = sp + 1;
          }
        }
      } else {
        let start = u32(obj.d0.x);
        let count = u32(obj.d0.y);
        for (var ti = start; ti < start + count; ti = ti + 1u) {
          let tri = TRIS[ti];
          let th = intersectTri(localRay.ori, localRay.dir, tri.v0, tri.v1, tri.v2, TMIN, best.t);
          if (th.t < best.t) { best = Hit(th.t, th.pos + origin, th.normal, oi); }
        }
      }
    }
  }
  return best;
}
