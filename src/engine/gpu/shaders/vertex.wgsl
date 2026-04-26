

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv01       : vec2<f32>,
  @location(1) uvNDC      : vec2<f32>,
}

@vertex
fn vs_fullscreen(@builtin(vertex_index) vidx : u32) -> VSOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  let clip = vec4<f32>(p[vidx], 0.0, 1.0);
  let uv = clip.xy * 0.5 + 0.5;

  var o: VSOut;
  o.clip  = clip;
  o.uvNDC = clip.xy;
  o.uv01  = vec2<f32>(uv.x, 1.0 - uv.y);
  return o;
}
