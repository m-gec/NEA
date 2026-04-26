export function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
export function wrapPI(a) { a = (a + Math.PI) % (2*Math.PI); return a < 0 ? a + 2*Math.PI - Math.PI : a - Math.PI; }
export function sub3(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
export function len3(v) { return Math.hypot(v[0], v[1], v[2]); }
export function normalize3(v) { const l = len3(v) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }
export function cross3(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
export function approxMatEqual(a, b, eps = 1e-5) { for (let i=0;i<16;i++) if (Math.abs(a[i]-b[i]) > eps) return false; return true; }