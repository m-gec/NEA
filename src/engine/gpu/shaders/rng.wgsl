

fn hash32(x: u32) -> u32 {
  var y = x;
  y ^= y >> 16u;  y *= 0x7feb352du;
  y ^= y >> 15u;  y *= 0x846ca68bu;
  y ^= y >> 16u;
  return y;
}

fn mix4(a: u32, b: u32, c: u32, d: u32) -> u32 {
  var x = ((a * 0x9E3779B9u) ^ (b * 0x85EBCA6Bu) ^ (c * 0xC2B2AE35u) ^ (d * 0x27D4EB2Fu));
  return hash32(x);
}

fn random(px: u32, py: u32, sample: u32, dim: u32, salt: u32) -> f32 {
  return f32(mix4(px, py, sample, dim ^ salt)) * 2.3283064365386963e-10;
}

fn nextRand(px:u32, py:u32, sample:u32, dim: ptr<function, u32>, salt:u32) -> f32 {
  let r = random(px, py, sample, *dim, salt);
  *dim = *dim + 1u;
  return r;
}
