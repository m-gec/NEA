import { mk } from '../utils.js';

const onEnterBlur = (el) => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      el.blur();
    }
  });
};

export function renderProperties(sel, scene, camera){
  const propsEl = document.getElementById('properties');
  if (!propsEl) return;
  const sidebar = document.getElementById('sidebar');

  propsEl.innerHTML = `
    <div class="section-title">object properties</div>
    <div class="prop-wrap" id="prop-wrap"></div>
  `;
  const wrap = document.getElementById('prop-wrap');
  const put = (el) => wrap.appendChild(el);

  let isLight = true;
  const stripe = () => (isLight = !isLight, isLight ? 'shade-light' : 'shade-dark');

  const selectAllOnFocus = (el) => {
    el.addEventListener('focus', () => {
      setTimeout(() => { try { el.select?.(); } catch {} }, 0);
    });
    el.addEventListener('mouseup', (e) => e.preventDefault());
  };

  const row = (label, inputs, { kind } = {}) => {
    const r = mk('div', `prop-row ${stripe()}`);
    r.appendChild(mk('div', null, label));
    const box = mk('div', `inputs${kind ? ' ' + kind : ''}`);
    if (Array.isArray(inputs)) inputs.forEach(i => box.appendChild(i));
    else box.appendChild(inputs);
    r.appendChild(box);
    return r;
  };

  const num = (value, { step='any', min=null, max=null, title='' } = {}) => {
    const i = document.createElement('input');
    i.type = 'number'; i.step = step; i.value = String(value);
    if (min != null) i.min = String(min);
    if (max != null) i.max = String(max);
    if (title) i.title = title;

    i.autocomplete = 'off';
    i.autocapitalize = 'off';
    i.spellcheck = false;

    onEnterBlur(i);
    selectAllOnFocus(i);
    return i;
  };

  const vec3 = (v, cb) => {
    const a = num(v[0], { step:'any' });
    const b = num(v[1], { step:'any' });
    const c = num(v[2], { step:'any' });
    const apply = () => {
      const nv = [ parseFloat(a.value), parseFloat(b.value), parseFloat(c.value) ];
      if (nv.every(x => Number.isFinite(x))) cb(nv);
    };
    [a,b,c].forEach(inp => inp.addEventListener('change', apply));
    return { inputs:[a,b,c], kind:'vec3' };
  };

  const text = (value, cb, { maxLen=64, placeholder='' } = {}) => {
    const t = document.createElement('input');
    t.type = 'text';
    t.value = value ?? '';
    t.placeholder = placeholder;
    t.maxLength = maxLen;

    t.autocomplete = 'off';
    t.autocapitalize = 'off';
    t.spellcheck = false;

    onEnterBlur(t);
    selectAllOnFocus(t);

    t.addEventListener('change', () => cb(t.value.trim()));

    return t;
  };

  const float = (v, cb, opts={ step:'any' }) => {
    const f = num(v, opts);
    f.addEventListener('change', () => {
      const x = parseFloat(f.value);
      if (Number.isFinite(x)) cb(x);
    });
    return f;
  };

  const h = (text, { active = false } = {}) => {
    const el = mk('h3', null, text);
    if (active) el.classList.add('prop-title--active');
    return el;
  };

  const touchScene  = () => { scene.upload(); camera.sampleIndex = 0; };
  const touchCamera = () => { camera.updateMatrix(false); camera.sampleIndex = 0; };

  const raisePanel = () => {
    if (!sel || !sidebar) return;
    const fps = Number(window.__neaFps ?? 0);
    const cs = getComputedStyle(sidebar);
    const varH = cs.getPropertyValue('--props-h').trim();
    const current = varH ? parseFloat(varH) : (propsEl.getBoundingClientRect().height || 0);
    const min = 96;
    const max = Math.min(window.innerHeight * 0.7, window.innerHeight - 140);
    const desired = Math.max(min, Math.min(max, propsEl.scrollHeight));
    if (!(desired > current + 1)) return;

    if (fps <= 45) {
      sidebar.style.setProperty('--props-h', `${desired}px`);
      return;
    }

    const start = current;
    const delta = desired - start;
    const duration = 220;
    const t0 = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = easeOutCubic(t);
      const next = start + delta * eased;
      sidebar.style.setProperty('--props-h', `${next}px`);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (!sel) {
    put(mk('div','hint','Select an object to see properties'));
    raisePanel();
    return;
  }

  if (sel.type === 'camera') {
    put(h('Camera', { active: true }));

    const applyCam = (fn) => { fn(); touchCamera(); renderProperties(sel, scene, camera); };

    { const { inputs, kind } = vec3([...camera.eye], (nv)=>{ applyCam(() => camera.setEye(nv[0], nv[1], nv[2], false)); }); put(row('Eye [x, y, z]', inputs, { kind })); }

    { const { inputs, kind } = vec3([...camera.target], (nv)=>{ applyCam(() => camera.lookAt(nv[0], nv[1], nv[2])); }); put(row('Target [x, y, z]', inputs, { kind })); }

    { const f = float((camera.fov * 180 / Math.PI), (deg)=>{ applyCam(() => { camera.fov = deg * Math.PI / 180; }); }, { step:'any', min: 1, max: 179 }); put(row('FOV (deg)', f)); }
    put(h('Render Settings'));

    { const f = float(camera.resolutionScale ?? 1.6, (x)=>{ applyCam(() => { camera.resolutionScale = Math.max(0.1, x); }); }, { step:'any', min:0.1 }); put(row('Resolution Scale', f)); }

    { const f = float(camera.maxDiffuseBounces ?? 3, (x)=>{ applyCam(() => { camera.maxDiffuseBounces = Math.max(0, Math.round(x)); }); }, { step:1, min:0 }); put(row('Max Diffuse', f)); }

    { const f = float(camera.maxSpecularBounces ?? 6, (x)=>{ applyCam(() => { camera.maxSpecularBounces = Math.max(0, Math.round(x)); }); }, { step:1, min:0 }); put(row('Max Specular', f)); }

    { const f = float(camera.samplesPerFrame ?? 1, (x)=>{ applyCam(() => { camera.samplesPerFrame = Math.max(1, Math.round(x)); }); }, { step:1, min:1 }); put(row('Samples/Frame', f)); }

    { const f = float(camera.maxSamples ?? 512, (x)=>{ applyCam(() => { camera.maxSamples = Math.max(1, Math.round(x)); }); }, { step:1, min:1 }); put(row('Max Samples', f)); }
    raisePanel();
    return;
  }

  const rec = scene.getObjectById(sel.id);
  const obj = rec?.obj;

  if (sel.type === 'triangle') {
    const gi = sel.globalIndex|0;
    let tri = scene.tris[gi];
    if (!tri) { put(mk('div','hint','Triangle not found')); return; }

    put(h(`Triangle ${sel.triIndex+1}`));
    const setV = (key) => (nv) => {
      const nt = { v0:[...tri.v0], v1:[...tri.v1], v2:[...tri.v2] };
      nt[key] = nv;
      scene.updateTriangle(gi, nt);
      tri = nt;
      camera.sampleIndex = 0;
    };
    put(row('v0 [x, y, z]', vec3(tri.v0, setV('v0')).inputs, { kind:'vec3' }));
    put(row('v1 [x, y, z]', vec3(tri.v1, setV('v1')).inputs, { kind:'vec3' }));
    put(row('v2 [x, y, z]', vec3(tri.v2, setV('v2')).inputs, { kind:'vec3' }));
    raisePanel();
    return;
  }

  if (!rec) { put(mk('div','hint','Object not found')); return; }

  const titleEl = h(obj.name || 'Object', { active: true });
  put(titleEl);

  {
    const updateLabels = (newName) => {
      titleEl.textContent = newName || 'Object';
      const treeLabel = document.querySelector(`#tree li[data-id="${obj.id}"] .name`);
      if (treeLabel) treeLabel.textContent = newName || 'Object';
    };

    const nameInput = text(obj.name || '', (newName) => {
      obj.name = newName || 'Object';
      updateLabels(obj.name);
    }, { maxLen: 80, placeholder: '' });

    nameInput.classList.add('name-input');
    nameInput.addEventListener('input', () => { updateLabels(nameInput.value || 'Object'); });

    put(row('Name', nameInput));
  }

  put(h('Material'));
  {
    const alb = obj.albedo || [1,1,1];
    put(row('Albedo [r, g, b]', vec3(alb, (nv)=>{ obj.albedo = nv; touchScene(); }).inputs, { kind:'vec3' }));
  }
  put(row('Emission',    float(obj.emission ?? 0.0, (x)=>{ obj.emission = x;    touchScene(); })));
  put(row('Roughness',   float(obj.roughness ?? 0.2, (x)=>{ obj.roughness = x;  touchScene(); })));
  put(row('Metalness',   float(obj.metalness ?? 0.0, (x)=>{ obj.metalness = Math.min(1.0, x);  touchScene(); })));
  put(row('Transmission',float(obj.transmission ?? 0.0,(x)=>{ obj.transmission = x; touchScene(); })));
  put(row('IOR',         float(obj.ior ?? 1.5,       (x)=>{ obj.ior = x;        touchScene(); })));
  put(row('Attenuation Dist', float(obj.attenuationDistance ?? 1.0, (x)=>{ obj.attenuationDistance = Math.max(1e-6, x); touchScene(); })));

  const SHAPE_MESH = 2;
  if (obj.shape === SHAPE_MESH) {
    put(h('Geometry'));
    const origin = obj.origin ?? [0, 0, 0];
    put(row('Origin [x, y, z]', vec3(origin, (nv)=>{ obj.origin = nv; touchScene(); }).inputs, { kind:'vec3' }));
    raisePanel();
    return;
  }

  put(h('Geometry'));
  if (obj.shape === 0) {
    put(row('Centre [x, y, z]', vec3(obj.center, (nv)=>{ obj.center = nv; touchScene(); }).inputs, { kind:'vec3' }));
    put(row('Radius', float(obj.radius, (x)=>{ obj.radius = Math.max(0, x); touchScene(); })));
  } else if (obj.shape === 1) {
    put(row('Min [x, y, z]', vec3(obj.min, (nv)=>{ obj.min = nv; touchScene(); }).inputs, { kind:'vec3' }));
    put(row('Max [x, y, z]', vec3(obj.max, (nv)=>{ obj.max = nv; touchScene(); }).inputs, { kind:'vec3' }));
  }

  raisePanel();
}
