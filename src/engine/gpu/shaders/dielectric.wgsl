

struct DeltaEvent {
  consumed: bool,
  newRay: Ray,
  transmitted: bool,
  entering: bool,
}

fn handleDielectric(
  r: Ray, hit: Hit, mat: Material,
  etaI: f32, etaT: f32,
  px:u32, py:u32, salt:u32, dim: ptr<function,u32>
) -> DeltaEvent {
  if (!(mat.transmission > 0.0 && mat.metalness < 0.5)) {
    return DeltaEvent(false, r, false, false);
  }

  let entering = dot(r.dir, hit.normal) < 0.0;

  var n = hit.normal;
  if (!entering) { n = -n; }

  let cosI_geom = clamp(-dot(n, r.dir), 0.0, 1.0);
  let Fr_geom   = schlickFresnelDielectric(cosI_geom, etaI, etaT);
  let uF        = nextRand(px,py,U.sampleIndex,dim,salt);
  if (uF < Fr_geom) { return DeltaEvent(false, r, false, entering); }

  let alpha = max(1e-3, mat.roughness * mat.roughness);
  let onb   = makeOnb(n);
  let u1    = nextRand(px,py,U.sampleIndex,dim,salt);
  let u2    = nextRand(px,py,U.sampleIndex,dim,salt);
  var mL    = sampleGGX_H(alpha, u1, u2);
  var m     = toWorld(mL, onb);
  if (dot(m, r.dir) > 0.0) { m = -m; }

  let eta   = etaI / etaT;
  let cosIm = clamp(-dot(m, r.dir), 0.0, 1.0);
  let sin2T = eta*eta * (1.0 - cosIm*cosIm);
  if (sin2T >= 1.0) { return DeltaEvent(false, r, false, entering); }

  let dirNext = normalize(refract(r.dir, m, eta));
  let newOri  = offsetSmall(hit.pos, dirNext);
  return DeltaEvent(true, Ray(newOri, dirNext), true, entering);
}
