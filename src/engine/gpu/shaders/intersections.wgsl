

struct Hit {
  t: f32,
  pos: vec3<f32>,
  normal: vec3<f32>,
  objIndex: u32,
}

fn makeNoHit() -> Hit { return Hit(INF, vec3<f32>(0.0), vec3<f32>(0.0), 0xffffffffu); }

fn intersectTri(rayOri: vec3<f32>, rayDir: vec3<f32>,
                v0: vec3<f32>, v1: vec3<f32>, v2: vec3<f32>,
                tMin: f32, tMax: f32) -> Hit {
  let eps = 1e-7;
  let e1 = v1 - v0;
  let e2 = v2 - v0;
  let p  = cross(rayDir, e2);
  let det = dot(e1, p);

  if (abs(det) <= eps) { return makeNoHit(); }

  let invDet = 1.0 / det;
  let tvec = rayOri - v0;
  let u = dot(tvec, p) * invDet;
  if (u < 0.0 || u > 1.0) { return makeNoHit(); }

  let q = cross(tvec, e1);
  let v = dot(rayDir, q) * invDet;
  if (v < 0.0 || u + v > 1.0) { return makeNoHit(); }

  let t = dot(e2, q) * invDet;
  if (t < tMin || t > tMax) { return makeNoHit(); }

  let n = normalize(cross(e1, e2));
  let pHit = rayOri + t * rayDir;
  return Hit(t, pHit, n, 0u);
}

fn intersectSphere(rayOri: vec3<f32>, rayDir: vec3<f32>,
                   centre: vec3<f32>, radius: f32,
                   tMin: f32, tMax: f32) -> Hit {
  let oc = rayOri - centre;
  let a = dot(rayDir, rayDir);
  let b = dot(oc, rayDir);
  let c = dot(oc, oc) - radius*radius;
  let disc = b*b - a*c;
  if (disc < 0.0) { return makeNoHit(); }
  let s = sqrt(disc);

  var t = (-b - s) / a;
  if (t < tMin || t > tMax) {
    t = (-b + s) / a;
    if (t < tMin || t > tMax) { return makeNoHit(); }
  }

  let p = rayOri + t * rayDir;
  let n = normalize((p - centre) / radius);
  return Hit(t, p, n, 0u);
}

struct AabbHit { t: f32, n: vec3<f32> }

fn intersectAABB(rayOri: vec3<f32>, rayDir: vec3<f32>,
                 bmin: vec3<f32>, bmax: vec3<f32>,
                 tMin: f32, tMax: f32) -> AabbHit {
  let eps = 1e-8;

  let inside =
    (rayOri.x > bmin.x && rayOri.x < bmax.x) &&
    (rayOri.y > bmin.y && rayOri.y < bmax.y) &&
    (rayOri.z > bmin.z && rayOri.z < bmax.z);

  var t0 = tMin; var t1 = tMax;
  var n0 = vec3<f32>(0.0); var n1 = vec3<f32>(0.0);

  for (var axis: i32 = 0; axis < 3; axis = axis + 1) {
    var ro: f32; var rd: f32; var mn: f32; var mx: f32;
    if (axis == 0) { ro = rayOri.x; rd = rayDir.x; mn = bmin.x; mx = bmax.x; }
    else if (axis == 1) { ro = rayOri.y; rd = rayDir.y; mn = bmin.y; mx = bmax.y; }
    else { ro = rayOri.z; rd = rayDir.z; mn = bmin.z; mx = bmax.z; }

    if (abs(rd) < eps) {
      if (ro < mn || ro > mx) { return AabbHit(-1.0, vec3<f32>(0.0)); }
      continue;
    }

    let inv = 1.0 / rd;
    var tN = (mn - ro) * inv;
    var tF = (mx - ro) * inv;

    var nN = vec3<f32>(0.0);
    var nF = vec3<f32>(0.0);
    if (axis == 0) { nN.x = -1.0; nF.x =  1.0; }
    if (axis == 1) { nN.y = -1.0; nF.y =  1.0; }
    if (axis == 2) { nN.z = -1.0; nF.z =  1.0; }

    if (tN > tF) {
      let tmpT = tN; tN = tF; tF = tmpT;
      let tmpN = nN; nN = nF; nF = tmpN;
    }

    if (tN >= t0) { t0 = tN; n0 = nN; }
    if (tF <= t1) { t1 = tF; n1 = nF; }

    if (t0 > t1) { return AabbHit(-1.0, vec3<f32>(0.0)); }
  }

  if (inside) { return AabbHit(t1, n1); }
  return AabbHit(t0, n0);
}

fn intersectAABB_Hit(rayOri: vec3<f32>, rayDir: vec3<f32>,
                     bmin: vec3<f32>, bmax: vec3<f32>,
                     tMin: f32, tMax: f32) -> Hit {
  let h = intersectAABB(rayOri, rayDir, bmin, bmax, tMin, tMax);
  if (h.t < 0.0) { return makeNoHit(); }
  let p = rayOri + h.t * rayDir;
  return Hit(h.t, p, h.n, 0u);
}
