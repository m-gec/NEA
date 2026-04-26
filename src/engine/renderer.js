import { Camera } from './camera/camera.js';
import * as GPU from './gpu/device.js';
import { loadTraceShader } from './gpu/index.js';
import { SceneStore } from './scene/scenestore.js';

// set up the gpu renderer, scene, camera, and render loop
export async function initRenderer({
  canvas,
  sceneFile,
  debugMode,
  maxSamples = 512,
  samplesPerFrame = 1,
  resolutionScale = 1.6,
  maxDiffuseBounces = 3,
  maxSpecularBounces = 6,
  setMessage = () => {},
}) {
  //create the webgpu device and reload if lost
  const { device } = await GPU.createDevice(() => {
    setMessage('GPU device lost. Reloading…');
    setTimeout(() => location.reload(), 100);
  });

  //create the camera with default view and render settings
  const camera = new Camera({
    eye: [0.7058, 1.4495, -3.1265],
    target: [0.4715, 1.0875, -1.1735],
    fov: 70 * Math.PI / 180,
    resolutionScale,
    maxDiffuseBounces,
    maxSpecularBounces,
    samplesPerFrame,
    maxSamples,
  });

  //connect the canvas to the gpu context
  const { context, format, resize } = GPU.configureCanvas(canvas, device, camera);

  //track the displayed frame rate after command submission
  const presentFPS = GPU.makePresentRateMeter(device);

  //load and validate the combined tracing shader module
  const shader = await loadTraceShader(device);
  GPU.checkShaderDiagnostics(shader);

  //bind layout shared by the accumulate and display passes
  const bgl = device.createBindGroupLayout({
    entries: [
      //camera and render settings
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      
      //object data
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      
      //previous accumulation texture
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      
      //nearest sampler for reading accumulation textures
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
      
      //triangle data
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      
      //bvh node data
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      
      //bvh triangle index data
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  });

  //create the two fullscreen render pipelines
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
  const accumulatePipeline = await device.createRenderPipelineAsync({
    layout: pipelineLayout,
    vertex: { module: shader, entryPoint: 'vs_fullscreen' },
    fragment: { module: shader, entryPoint: 'fs_accumulate', targets: [{ format: 'rgba32float' }] },
    primitive: { topology: 'triangle-list' },
  });
  const displayPipeline = await device.createRenderPipelineAsync({
    layout: pipelineLayout,
    vertex: { module: shader, entryPoint: 'vs_fullscreen' },
    fragment: { module: shader, entryPoint: 'fs_display', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  //stop mobile browsers from treating touch end as a page gesture
  ['touchend'].forEach((type) => {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false, capture: true });
  });

  //load the selected scene and upload gpu buffers
  const scene = new SceneStore(device);
  if (scene.init) {
    await scene.init();
  }
  await scene.loadFromURL(`/scenes/${sceneFile}`);
  scene.upload();

  //uniform block and shared gpu resources
  const UBO_SIZE = 144;
  const ubo = device.createBuffer({ size: UBO_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest', mipmapFilter: 'nearest' });
  
  //fallback storage buffers used before scene buffers exist
  const emptyTriBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  const emptyObjBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  const emptyBvhBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  const emptyBvhIndexBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });

  //ping pong accumulation textures
  let accumTexA = GPU.makeAccumTexture(device, canvas.width, canvas.height);
  let accumTexB = GPU.makeAccumTexture(device, canvas.width, canvas.height);
  let useAasPrev = true;

  //wrap canvas resizing so accumulation targets are rebuilt too
  const origResize = resize;
  function onResize() {
    origResize();
    accumTexA.destroy?.();
    accumTexB.destroy?.();
    accumTexA = GPU.makeAccumTexture(device, canvas.width, canvas.height);
    accumTexB = GPU.makeAccumTexture(device, canvas.width, canvas.height);
    
    //reset accumulation because pixel dimensions changed
    camera.sampleIndex = 0;
  }

  //handle window and element size changes
  window.addEventListener('resize', onResize, { passive: true });

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(canvas);

  //create a bind group for whichever accumulation texture was previous
  function makeBindGroup(prevAccumView) {
    return device.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: ubo } },
        { binding: 1, resource: { buffer: scene.getObjBuffer() ?? emptyObjBuf } },
        { binding: 2, resource: prevAccumView },
        { binding: 3, resource: sampler },
        { binding: 4, resource: { buffer: scene.getTriBuffer() ?? emptyTriBuf } },
        { binding: 5, resource: { buffer: scene.getBvhBuffer() ?? emptyBvhBuf } },
        { binding: 6, resource: { buffer: scene.getBvhIndexBuffer() ?? emptyBvhIndexBuf } },
      ],
    });
  }

  //record clock start time
  let start = performance.now();

  //to detect runtime resolution scale edits
  let lastResolutionScale = camera.resolutionScale;

  //render frames
  function frame() {
    const now = performance.now();
    const t = (now - start) * 0.001;

    //rebuild targets if resolution scale changed through the ui
    if (camera.resolutionScale !== lastResolutionScale) {
      lastResolutionScale = camera.resolutionScale;
      onResize();
    }

    //update camera matrices and decide whether more samples are needed
    const moved = camera.updateMatrix(false);
    const samplesPerFrame = Math.max(1, camera.samplesPerFrame | 0);
    const cameraMaxSamples = Math.max(1, camera.maxSamples | 0);
    const maxSamplesEffective = debugMode.value ? 1 : cameraMaxSamples;
    if ((camera.sampleIndex >= maxSamplesEffective && !moved)) {
      const sppfLabel = `${samplesPerFrame} sppf`;
      if (debugMode.value) {
        setMessage(`samples: 1/1 (paused, ${sppfLabel})`);
      } else {
        setMessage(`samples: ${camera.sampleIndex}/${cameraMaxSamples} (paused, ${sppfLabel})`);
      }
      requestAnimationFrame(frame);
      return;
    }

    //pack the camera, scene, and render settings for the shader
    const uBlock = camera.packUniformBlock({
      width: canvas.width,
      height: canvas.height,
      time: t,
      objCount: scene.objCount,
      triCount: scene.triCount,
      samplesPerFrame,
      maxDiffuseBounces: Math.max(0, camera.maxDiffuseBounces | 0),
      maxSpecularBounces: Math.max(0, camera.maxSpecularBounces | 0),
    });

    //write debug mode into the packed uniform flags
    const FLAG_DEBUG = 1 >>> 0;
    const u32 = new Uint32Array(uBlock);
    u32[25] = debugMode.value ? FLAG_DEBUG : 0;

    //upload the uniform block for this frame
    device.queue.writeBuffer(ubo, 0, uBlock);

    //choose previous and next accumulation textures
    const prevTex = useAasPrev ? accumTexA : accumTexB;
    const nextTex = useAasPrev ? accumTexB : accumTexA;
    const prevView = prevTex.createView();
    const nextView = nextTex.createView();

    const bindGroup = makeBindGroup(prevView);
    const encoder = device.createCommandEncoder();

    //accumulation pass writes the next path traced sample buffer
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: nextView,
          loadOp: (camera.sampleIndex === 0) ? 'clear' : 'load',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store',
        }],
      });
      pass.setPipeline(accumulatePipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
    }

    //display pass copies the accumulation result to the canvas
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 0.02, g: 0.02, b: 0.025, a: 1 },
          storeOp: 'store',
        }],
      });
      const displayBG = makeBindGroup(nextView);
      pass.setPipeline(displayPipeline);
      pass.setBindGroup(0, displayBG);
      pass.draw(3, 1, 0, 0);
      pass.end();
    }

    //submit both passes together
    device.queue.submit([encoder.finish()]);

    //advance sample count without passing the samples cap
    if (camera.sampleIndex < maxSamplesEffective) {
      camera.sampleIndex = Math.min(maxSamplesEffective, camera.sampleIndex + samplesPerFrame);
    }

    //update fps and status text
    presentFPS.afterSubmit();
    const fps = presentFPS.value();
    window.__neaFps = fps;
    setMessage(`samples: ${camera.sampleIndex}/${maxSamplesEffective} (${samplesPerFrame} sppf) | ~${fps} fps`);

    //swap accumulation textures and schedule the next frame
    useAasPrev = !useAasPrev;
    requestAnimationFrame(frame);
  }

  //expose the loaded scene, camera, and a start hook
  return {
    scene,
    camera,
    start() {
      start = performance.now();
      frame();
    },
  };
}
