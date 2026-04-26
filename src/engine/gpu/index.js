
//load and concatenate WGSL shader files into one shader module
export async function loadTraceShader(device) {
  const base = new URL('./shaders/', import.meta.url);
  //order matters, global variables declared in one file can only be used in files concatenated after
  const parts = [
    'bindings.wgsl',
    'vertex.wgsl',
    'maths.wgsl',
    'intersections.wgsl',
    'dielectric.wgsl',
    'scene.wgsl',
    'debug.wgsl',
    'pathtrace.wgsl',
    'rng.wgsl',
    'passes.wgsl'
  ];
  const sources = await Promise.all(parts.map(p => fetch(new URL(p, base)).then(r => r.text())));
  const code = sources.join('\n');
  return device.createShaderModule({ code }); //returns a shader module
}