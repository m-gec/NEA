

struct Uniforms {
  resolution : vec2<f32>,
  time       : f32,
  _pad0      : f32,
  camWorld   : mat4x4<f32>,
  fov        : f32,
  _pad1      : f32,
  _pad2      : f32,
  objCount   : u32,
  sampleIndex: u32,
  flags      : u32,
  samplesPerFrame: u32,
  maxDiffuseBounces : u32,
  maxSpecularBounces : u32,
  triCount   : u32,
  _pad3      : u32,
  _pad4      : u32,
  _pad5      : u32,
};
@group(0) @binding(0) var<uniform> U : Uniforms;

struct Obj {
  m0 : vec4<f32>,
  m1 : vec4<f32>,
  typ : u32, flags : u32, uA : u32, uB : u32,
  d0 : vec4<f32>,
  d1 : vec4<f32>,
  d2 : vec4<f32>,
  d3 : vec4<f32>
};
@group(0) @binding(1) var<storage, read> OBJS : array<Obj>;

struct Tri {
  v0 : vec3<f32>, _p0: f32,
  v1 : vec3<f32>, _p1: f32,
  v2 : vec3<f32>, _p2: f32,
};
@group(0) @binding(4) var<storage, read> TRIS : array<Tri>;

struct BvhNode {
  bmin : vec3<f32>, left: u32,
  bmax : vec3<f32>, right: u32,
};
@group(0) @binding(5) var<storage, read> BVH_NODES : array<BvhNode>;
@group(0) @binding(6) var<storage, read> TRI_INDICES : array<u32>;

struct Material {
  albedo: vec3<f32>,
  emission: f32,
  roughness: f32,
  metalness: f32,
  transmission: f32,
  ior: f32,
  attenuationDist: f32,
}

fn getMaterial(o: Obj) -> Material {
  let att = bitcast<f32>(o.uA);
  return Material(
    o.m0.rgb, o.m0.a,
    o.m1.x, o.m1.y, o.m1.z, o.m1.w,
    max(att, 1e-6)
  );
}

@group(0) @binding(2) var prevAccumTex : texture_2d<f32>;
@group(0) @binding(3) var prevAccumSmp : sampler;
