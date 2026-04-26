export const Shape = { sphere: 0, aabb: 1, mesh: 2 };

export class SceneObject {
  constructor({
    name = '',
    albedo = [1,0,1],
    emission = 0.0,
    roughness = 0.2,
    metalness = 0.0,
    transmission = 0.0,
    ior = 1.5,
    attenuationDistance = 1.0,
    shape = 'sphere',
    flags = 0,
    center = [0,0,0],
    radius = 0.5,
    min = [-0.5,-0.5,-0.5],
    max = [ 0.5, 0.5, 0.5],
    origin = [0,0,0],
    triStart = 0,
    triCount = 0,
    bvhRoot = 0xffffffff,
  } = {}) {
    this.name = name;
    this.albedo = albedo;
    this.emission = emission;
    this.roughness = roughness;
    this.metalness = metalness;
    this.transmission = transmission;
    this.ior = ior;
    this.attenuationDistance = attenuationDistance;
    this.shape = typeof shape === 'string' ? Shape[shape] : (shape|0);
    this.flags = flags|0;
    this.center = center; this.radius = radius;
    this.min = min; this.max = max;
    this.origin = origin;
    this.triStart = triStart|0; this.triCount = triCount|0;
    this.bvhRoot = bvhRoot >>> 0;
  }
}

export function makeSphere({ name='', center=[0,0,0], radius=0.5, ...mat } = {}) {
  const min = [center[0]-radius, center[1]-radius, center[2]-radius];
  const max = [center[0]+radius, center[1]+radius, center[2]+radius];
  return new SceneObject({ name, shape:'sphere', center, radius, min, max, ...mat });
}

export function makeAABB({ name='', min=[-0.5,-0.5,-0.5], max=[0.5,0.5,0.5], ...mat } = {}) {
  return new SceneObject({ name, shape:'aabb', min, max, ...mat });
}

export function makeMesh({ name='', origin=[0,0,0], triStart=0, triCount=0, ...mat } = {}) {
  return new SceneObject({ name, shape:'mesh', origin, triStart, triCount, ...mat });
}
