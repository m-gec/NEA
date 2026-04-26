

const SHAPE_SPHERE : u32 = 0u;
const SHAPE_AABB   : u32 = 1u;
const SHAPE_MESH   : u32 = 2u;

const INF   : f32 = 1e30;
const TMIN  : f32 = 1e-4;

struct Ray { ori: vec3<f32>, dir: vec3<f32> }

fn camPosition() -> vec3<f32> { return U.camWorld[3].xyz; }
fn camBasis() -> mat3x3<f32> { return mat3x3<f32>(U.camWorld[0].xyz, U.camWorld[1].xyz, U.camWorld[2].xyz); }

fn rayDirFromNDC(ndc: vec2<f32>) -> vec3<f32> {

  let p = ndc * (0.5 * U.resolution);

  let radius = 0.5 * length(U.resolution);
  let r = clamp(length(p) / max(radius, 1e-6), 0.0, 1.0);

  let phi = atan2(p.y, p.x);

  let sinHalfMax = sin(0.5 * U.fov);
  let theta = 2.0 * asin(clamp(r * sinHalfMax, -1.0, 1.0));

  let dir_cam = vec3<f32>(
    sin(theta) * cos(phi),
    sin(theta) * sin(phi),
    cos(theta)
  );

  return normalize(camBasis() * dir_cam);

}

fn makePrimaryRay(ndc: vec2<f32>) -> Ray { return Ray(camPosition(), rayDirFromNDC(ndc)); }

fn offsetRayOrigin(p: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
  return p + n * 1e-4;
}

fn offsetSmall(p: vec3<f32>, dir: vec3<f32>) -> vec3<f32> {
  return p + dir * 1e-4;
}

fn F0_from_ior(ior: f32) -> f32 {
  let r = (ior - 1.0) / (ior + 1.0);
  return r*r;
}

fn faceForward(n: vec3<f32>, wi: vec3<f32>) -> vec3<f32> {
  return select(n, -n, dot(n, wi) > 0.0);
}

struct Onb { t: vec3<f32>, b: vec3<f32>, n: vec3<f32> }

fn makeOnb(n: vec3<f32>) -> Onb {
  let s = select(vec3<f32>(1.0,0.0,0.0), vec3<f32>(0.0,1.0,0.0), abs(n.x) > 0.5);
  let t = normalize(cross(s, n));
  let b = cross(n, t);
  return Onb(t,b,n);
}

fn toWorld(local: vec3<f32>, onb: Onb) -> vec3<f32> {
  return local.x * onb.t + local.y * onb.b + local.z * onb.n;
}

fn sampleCosineHemisphere(u1:f32,u2:f32)->vec3<f32>{
  let u = vec2<f32>(2.0*u1 - 1.0, 2.0*u2 - 1.0);
  if (u.x == 0.0 && u.y == 0.0) { return vec3<f32>(0.0,0.0,1.0); }
  var r:f32; var t:f32;
  if (abs(u.x) > abs(u.y)) { r = u.x; t = (3.141592653589793/4.0)*(u.y/u.x); }
  else { r = u.y; t = (3.141592653589793/2.0) - (3.141592653589793/4.0)*(u.x/u.y); }
  let d = vec2<f32>(cos(t), sin(t)) * r;
  let z = sqrt(max(0.0, 1.0 - dot(d,d)));
  return vec3<f32>(d.x, d.y, z);
}

fn schlickFresnelDielectric(cosTheta: f32, etaI: f32, etaT: f32) -> f32 {
  if (abs(etaI - etaT) < 1e-5) { return 0.0; }
  let r0  = (etaI - etaT) / (etaI + etaT);
  let r02 = r0 * r0;
  let m   = clamp(1.0 - cosTheta, 0.0, 1.0);
  return r02 + (1.0 - r02) * m*m*m*m*m;
}

fn transmittanceSimple(albedo: vec3<f32>, attDist: f32, dist: f32) -> vec3<f32> {
  let c = clamp(albedo, vec3<f32>(1e-6), vec3<f32>(1.0));
  let sigma_a = -log(c) / max(attDist, 1e-6);
  return exp(-sigma_a * dist);
}

fn schlickFresnel(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  let m = clamp(1.0 - cosTheta, 0.0, 1.0);
  let m5 = m*m*m*m*m;
  return F0 + (vec3<f32>(1.0) - F0) * m5;
}

fn D_GGX(alpha: f32, NoH: f32) -> f32 {
  let a2 = alpha*alpha;
  let d = (NoH*NoH) * (a2 - 1.0) + 1.0;
  return a2 / (3.141592653589793 * d * d);
}

fn G1_SmithGGX(alpha: f32, NoX: f32) -> f32 {
  let a2 = alpha*alpha;
  let b = NoX*NoX;
  return 2.0 * NoX / (NoX + sqrt(a2 + (1.0 - a2)*b));
}
fn G_Smith(alpha: f32, NoV: f32, NoL: f32) -> f32 {
  return G1_SmithGGX(alpha, NoV) * G1_SmithGGX(alpha, NoL);
}

fn sampleGGX_H(alpha: f32, u1: f32, u2: f32) -> vec3<f32> {
  let phi = 2.0 * 3.141592653589793 * u1;
  let a2  = alpha*alpha;
  let cosTheta = sqrt( (1.0 - u2) / (1.0 + (a2 - 1.0) * u2) );
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta*cosTheta));
  return vec3<f32>(cos(phi)*sinTheta, sin(phi)*sinTheta, cosTheta);
}

struct BsdfEval { f: vec3<f32>, pdf: f32 }
struct BsdfSample { wi: vec3<f32>, f: vec3<f32>, pdf: f32, isSpecular: bool }

fn bsdf_sample(n: vec3<f32>, v: vec3<f32>, mat: Material, u1: f32, u2: f32, u3: f32) -> BsdfSample {
  let onb = makeOnb(n);
  let alpha = max(1e-3, mat.roughness * mat.roughness);
  let baseF0 = vec3<f32>(F0_from_ior(mat.ior));
  let F0 = mix(baseF0, mat.albedo, vec3<f32>(mat.metalness));
  let F0avg = (F0.x + F0.y + F0.z) / 3.0;

  let pSpec = clamp(0.08 + 0.92 * max(F0avg, mat.metalness), 0.05, 0.98);

  if (u3 < pSpec) {
    let hL = sampleGGX_H(alpha, u1, u2);
    let h  = toWorld(hL, onb);
    let wi = reflect(-v, h);
    if (dot(wi, n) <= 0.0) { return BsdfSample(vec3<f32>(0.0), vec3<f32>(0.0), 0.0, true); }

    let NoV = max(dot(n, v), 0.0);
    let NoL = max(dot(n, wi), 0.0);
    let NoH = max(dot(n, h), 0.0);
    let VoH = dot(v, h);
    if (VoH <= 0.0) { return BsdfSample(vec3<f32>(0.0), vec3<f32>(0.0), 0.0, true); }

    let F = schlickFresnel(VoH, F0);
    let D = D_GGX(alpha, NoH);
    let G = G_Smith(alpha, NoV, NoL);
    let spec = (D * G) / max(4.0 * NoV * NoL, 1e-6) * F;

    let pdf_h = D * NoH;
    var pdf   = pdf_h / max(4.0 * VoH, 1e-6);
    pdf = max(pdf * pSpec, 1e-6);

    return BsdfSample(wi, spec, pdf, true);

  } else {
    let lL = sampleCosineHemisphere(u1, u2);
    let wi = toWorld(lL, onb);

    let NoL = max(dot(n, wi), 0.0);

    let kd = (1.0 - mat.metalness) * (1.0 - ((F0.x + F0.y + F0.z) / 3.0));
    let f  = kd * mat.albedo / 3.141592653589793;

    var pdf = NoL / 3.141592653589793;
    pdf = max(pdf * (1.0 - pSpec), 1e-6);

    return BsdfSample(wi, f, pdf, false);
  }
}
