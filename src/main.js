import { initRenderer } from './engine/renderer.js';
import { initEditor } from './editor/editor.js';
import { initPointerControls } from './editor/input/pointer.js';
import { initKeyboardControls } from './editor/input/keyboard.js';
import { bindDebugMode } from './editor/utils.js';

//function to write performance outputs fps and sample count
const msg = (t) => (document.getElementById('msg').textContent = t ?? '');

//default settings
const maxSamples = 2048; //total calculated samples once rendering is complete
const samplesPerFrame = 2;
const resolutionScale = 1.8; //a scale factor to change resolution by, 2=half resolution, 1=normal
const maxDiffuseBounces = 2; //max bounces for diffuse reflections (base colour)
const maxSpecularBounces = 1; //max bounces for specular reflections (mirrors, shininess)
const sceneFile = 'suzanne_cornell.json'; //the file to load the scene from
const defaultAlbedo = [0.5, 0.0, 1.0]; //base colour for newly inserted objects

//mutable compatibility render mode flag
const debugMode = { value: true };

//main application bootstrap:
//initialises renderer, controls event handling, editor, then starts the render loop
async function main() {
  const canvas = document.getElementById('gfx');

  //initialise the renderer
  const { scene, camera, start } = await initRenderer({
    canvas,
    sceneFile,
    debugMode,
    maxSamples,
    samplesPerFrame,
    resolutionScale,
    maxDiffuseBounces,
    maxSpecularBounces,
    setMessage: msg, //for displaying the framerate and sample count in a text ui
  });

  //camera controls
  initPointerControls(canvas, camera); //touch and mouse input
  initKeyboardControls(canvas, camera); //keyboard movement
  bindDebugMode(debugMode, camera); //binding spacebar to switch render modes

  //initialise the sidebar ui
  initEditor({
    scene,
    camera,
    defaultAlbedo,
  });

  start(); //start rendering
}

//run the application once the module loads
main();
