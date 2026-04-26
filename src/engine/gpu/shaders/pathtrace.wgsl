

const SKY_BOTTOM : vec3<f32> = vec3<f32>(0.76, 0.86, 1.00);
const SKY_TOP    : vec3<f32> = vec3<f32>(0.5, 0.5, 0.7);

const EARLY_RR_BOUNCE  : i32 = 2;
const ROUGHNESS_EPS    : f32 = 1e-4;

fn skyColour(dir: vec3<f32>) -> vec3<f32> {
  let t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  return select(mix(SKY_BOTTOM, SKY_TOP, t), vec3<f32>(0.0), dot(dir, vec3<f32>(0.0, 1.0, 0.0)) < 0.0);
}

fn pathTrace(ray: Ray, px:u32, py:u32, salt:u32) -> vec3<f32> {
  var L = vec3<f32>(0.0);
  var T = vec3<f32>(1.0);
  var r = ray;

  var inMedium = false;
  var mediumIor = 1.0;
  var mediumAlb = vec3<f32>(1.0);
  var mediumAtt = 1.0;

  var dim: u32 = 0u;

  let maxDiffuse = max(i32(U.maxDiffuseBounces), 0);
  let maxSpecular = max(i32(U.maxSpecularBounces), 0);
  var diffuseDepth = 0;
  var specularDepth = 0;
  for (var bounce = 0; bounce <= (maxDiffuse + maxSpecular); bounce = bounce + 1) {
    let hit = sceneIntersect(r, INF);
    if (hit.objIndex == 0xffffffffu) {
      L += T * skyColour(r.dir);
      break;
    }

    if (inMedium) {
      T *= transmittanceSimple(mediumAlb, mediumAtt, hit.t);
    }

    let mat = getMaterial(OBJS[hit.objIndex]);

    if (mat.transmission > 0.0 && mat.metalness < 0.5 && mat.roughness <= ROUGHNESS_EPS) {
      if (specularDepth >= maxSpecular) { break; }
      specularDepth = specularDepth + 1;

      let entering = dot(r.dir, hit.normal) < 0.0;

      var etaI: f32 = select(1.0, mediumIor, inMedium);
      var etaT: f32 = select(1.0, mat.ior, entering);

      let n = select(-hit.normal, hit.normal, entering);

      let cosI = clamp(-dot(n, r.dir), 0.0, 1.0);
      let Fr   = schlickFresnelDielectric(cosI, etaI, etaT);
      let uF   = nextRand(px,py,U.sampleIndex,&dim,salt);

      var dirNext : vec3<f32>;
      var transmitted = false;

      if (uF < Fr) {

        dirNext = reflect(r.dir, n);
      } else {

        let eta  = etaI / etaT;
        let k    = 1.0 - eta*eta * (1.0 - cosI*cosI);
        if (k < 0.0) {

          dirNext = reflect(r.dir, n);
        } else {
          let cosT = sqrt(k);
          dirNext  = eta * r.dir + (eta * cosI - cosT) * n;
          transmitted = true;
        }
      }

      if (transmitted) {
        if (entering) {
          inMedium = true;
          mediumIor = mat.ior;
          mediumAlb = mat.albedo;
          mediumAtt = mat.attenuationDist;
        } else {
          inMedium = false;
          mediumIor = 1.0;
          mediumAlb = vec3<f32>(1.0);
          mediumAtt = 1.0;
        }
      }

      r.ori = offsetSmall(hit.pos, dirNext);
      r.dir = dirNext;
      continue;
    }

    if (mat.transmission > 0.0 && mat.metalness < 0.5) {
      let entering = dot(r.dir, hit.normal) < 0.0;

      var etaI: f32 = select(1.0, mediumIor, inMedium);
      var etaT: f32 = select(1.0, mat.ior, entering);

      let d = handleDielectric(r, hit, mat, etaI, etaT, px, py, salt, &dim);
      if (d.consumed) {
        if (specularDepth >= maxSpecular) { break; }
        specularDepth = specularDepth + 1;
        if (d.transmitted) {
          if (d.entering) {
            inMedium = true;
            mediumIor = mat.ior;
            mediumAlb = mat.albedo;
            mediumAtt = mat.attenuationDist;
          } else {
            inMedium = false;
            mediumIor = 1.0;
            mediumAlb = vec3<f32>(1.0);
            mediumAtt = 1.0;
          }
        }
        r = d.newRay;
        continue;
      }
    }

    if (mat.emission > 0.0) {
      L += T * (mat.albedo * mat.emission);
      break;
    }

    var n = faceForward(hit.normal, r.dir);
    let v = -r.dir;

    let u1 = nextRand(px,py,U.sampleIndex,&dim,salt);
    let u2 = nextRand(px,py,U.sampleIndex,&dim,salt);
    let u3 = nextRand(px,py,U.sampleIndex,&dim,salt);

    let s  = bsdf_sample(n, v, mat, u1, u2, u3);
    if (s.pdf <= 0.0) { break; }

    if (s.isSpecular) {
      if (specularDepth >= maxSpecular) { break; }
      specularDepth = specularDepth + 1;
    } else {
      if (diffuseDepth >= maxDiffuse) { break; }
      diffuseDepth = diffuseDepth + 1;
    }

    let NoL = max(dot(n, s.wi), 0.0);
    T *= s.f * (NoL / s.pdf);

    if (bounce >= EARLY_RR_BOUNCE) {
      let p = clamp(max(max(T.x, T.y), T.z), 0.05, 0.98);
      let u = nextRand(px,py,U.sampleIndex,&dim,salt);
      if (u > p) { break; }
      T /= p;
    }

    r.ori = offsetRayOrigin(hit.pos, n);
    r.dir = normalize(s.wi);
  }

  return L;
}
