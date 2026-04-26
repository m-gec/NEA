

fn saturate(c: vec3<f32>, sat: f32) -> vec3<f32> {
  let luminance = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
  return c;
}

fn debugSample(ray: Ray) -> vec3<f32> {
  let sky_colour = skyColour(ray.dir);

  let hit = sceneIntersect(ray, INF);
  if (hit.objIndex == 0xffffffffu) { return sky_colour; }

  let mat = getMaterial(OBJS[hit.objIndex]);
  if (mat.emission > 0.0) { return mat.albedo * mat.emission; }

  let normal = faceForward(hit.normal, ray.dir);

  let ambient = mat.albedo * vec3<f32>(0.1, 0.2, 0.3);

  let light_pos = camPosition() + camBasis()[1] * 0.2;
  let light_vec = light_pos - hit.pos;
  let light_dist = length(light_vec);
  let source_dir = normalize(light_vec);

  let half_vector = normalize(source_dir - ray.dir);

  let shadow_origin = offsetRayOrigin(hit.pos, normal);
  let shadow_hit = sceneIntersect(Ray(shadow_origin, source_dir), light_dist);
  let in_shadow = shadow_hit.objIndex != 0xffffffffu && shadow_hit.t < light_dist;

  let lambertian = vec3<f32>(dot(source_dir, normal)) * mat.albedo / 3.14;
  let blinn_phong = pow(clamp(dot(normal, half_vector), 0.0, 1.0), 20.0)*0.5;

  let direct = select(lambertian + blinn_phong, vec3<f32>(0.0), in_shadow);
  return saturate(direct + ambient, 1.5);
}
