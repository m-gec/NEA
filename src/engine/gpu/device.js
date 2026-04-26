
//build a float accumulation texture
export function makeAccumTexture(device, width, height) {
  return device.createTexture({
    size: { width, height },
    format: 'rgba32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
}

//request a high performance WebGPU device and handle cases of device loss
export async function createDevice(onLost) {
  if (!('gpu' in navigator)) throw new Error('WebGPU not supported.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No suitable GPU adapter.');

  const device = await adapter.requestDevice();

  device.lost.then((info) => {
    console.warn('Device lost:', info.message);
    if (onLost) onLost(info);
  });

  return { device, adapter };
}

//configure canvas swapchain format and keep backing size synced
export function configureCanvas(canvas, device, settings = {}) {
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();

  //recompute internal render resolution using resolutionScale
  function resize() {
    const scale = Math.max(0.5, settings.resolutionScale ?? 1.6);

    const dpr = Math.max(1, (window.devicePixelRatio || 1) / scale);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      context.configure({
        device,
        format,
        alphaMode: 'opaque',
        size: [w, h],
      });
    }
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resize();
  });
  return { context, format, resize };
}

//loader for a single WGSL source file
export async function loadShader(device, url) {
  const code = await fetch(url).then(r => r.text());
  return device.createShaderModule({ code });
}

//catch WGSL compilation errors and output them
export async function checkShaderDiagnostics(shader) {
  const info = await shader.getCompilationInfo();
  if (!info.messages.length) return { ok: true, errors: [] };

  const errors = [];
  for (const m of info.messages) {
    const line = `[WGSL ${m.type}] ${m.lineNum}:${m.linePos} – ${m.message}`;
    if (m.type === 'error') {
      console.error(line);
      errors.push(line);
    } else {
      console.warn(line);
    }
  }
  return { ok: errors.length === 0, errors };
}

//estimate present rate from queue completion timing
export function makePresentRateMeter(device, { tauMs = 300 } = {}) {
  let pending = false;
  let ema = 0, has = false;
  let last = 0;
  
  //update counter once the submitted GPU work is done
  function afterSubmit() {
    if (pending) return;
    pending = true;
    const t0 = performance.now();
    device.queue.onSubmittedWorkDone().then(() => {
      const dt = performance.now() - t0;
      pending = false;
      if (dt > 0 && dt < 2000) {
        const inst = 1000 / dt;
        const alpha = 1 - Math.exp(-dt / Math.max(1, tauMs));
        ema = has ? (ema + alpha * (inst - ema)) : inst;
        has = true;
        last = Math.round(ema);
      }
    }).catch(() => { pending = false; });
  }

  return {
    afterSubmit,
    value: () => last || 0,
  };
}

