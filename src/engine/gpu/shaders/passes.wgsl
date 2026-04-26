

@fragment
fn fs_accumulate(in: VSOut) -> @location(0) vec4<f32> {
  let uv  = in.uv01;
  let ndc = in.uvNDC;
  let ray = makePrimaryRay(ndc);

  let isDebug = (U.flags == 1u);

  if (isDebug) {
    let newSample = debugSample(ray);
    return vec4<f32>(newSample, 1.0);
  } else {
    var prev = vec4<f32>(0.0);
    if (U.sampleIndex > 0u) {
      prev = textureSampleLevel(prevAccumTex, prevAccumSmp, in.uv01, 0.0);
    }

    let px = u32(floor(uv.x * U.resolution.x));
    let py = u32(floor(uv.y * U.resolution.y));

    let baseSalt = u32(floor(U.time * 60.0));
    let spp = max(U.samplesPerFrame, 1u);
    var newSample = vec3<f32>(0.0);
    for (var i: u32 = 0u; i < spp; i = i + 1u) {
      let salt = (0xDEADBEEFu + 0x9E3779B9u * (i + 1u)) ^ baseSalt;
      newSample += pathTrace(ray, px, py, salt);
    }

    let newSum   = prev.rgb + newSample;
    let newCount = prev.a + f32(spp);
    return vec4<f32>(newSum, newCount);
  }
}

fn anyNaN4(v: vec4<f32>) -> bool { return any(v != v); }

@fragment
fn fs_display(in: VSOut) -> @location(0) vec4<f32> {
  let acc = textureSampleLevel(prevAccumTex, prevAccumSmp, in.uv01, 0.0);
  if (anyNaN4(acc)) { return vec4<f32>(1.0, 1.0, 0.0, 1.0); }
  let count = max(acc.a, 1.0);
  let avg   = acc.rgb / count;
  return vec4<f32>(avg, 1.0);
}
