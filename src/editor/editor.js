import { makeSphere, makeAABB, makeMesh } from '../engine/scene/object.js';
import { initInterface } from './ui/explorer.js';
import { renderProperties } from './ui/properties.js';


//wiring the explorer and property panel callbacks to scene/camera mutations
export function initEditor({ scene, camera, defaultAlbedo }) {
  const ui = initInterface({
    //live scene accessors
    getObjects: () => scene.objects,
    getTrianglesForMesh: (meshIndex) => scene.triCountForMesh(meshIndex),
    getCamera: () => camera,

    //properties panel is always rerendered from current selection
    onSelect: () => {},
    onSelectionChange: (sel) => { renderProperties(sel, scene, camera); },

    //deleting removes the currently selected object and forces rerendering
    onDelete: (sel) => {
      if (!sel) return;
      if (sel.type === 'triangle') {
        scene.deleteTriangle(sel.meshId, sel.triIndex);
        ui.clearSelection?.();
        ui.render();
        renderProperties(null, scene, camera);
        camera.sampleIndex = 0;
        return;
      } else if (sel.type === 'mesh' || sel.type === 'sphere' || sel.type === 'box') {
        scene.deleteObjectById(sel.id);
        ui.clearSelection?.();
        ui.render();
        renderProperties(null, scene, camera);
        camera.sampleIndex = 0;
      }
    },

    //insert a triangle near the camera target
    onAddTriangleToMesh: (meshIndex) => {
      const t = camera.target || [0, 0.5, 1.2];
      const mesh = scene.objects[meshIndex];
      const origin = mesh?.origin ?? [0, 0, 0];
      const toLocal = (v) => [v[0] - origin[0], v[1] - origin[1], v[2] - origin[2]];
      const u = [0.08, 0, 0], v = [0, 0.08, 0];
      const tri = {
        v0: toLocal([t[0], t[1], t[2]]),
        v1: toLocal([t[0] + u[0], t[1] + u[1], t[2] + u[2]]),
        v2: toLocal([t[0] - v[0], t[1] - v[1], t[2] - v[2]]),
      };
      scene.addTriangleToMesh(meshIndex, tri);
      camera.sampleIndex = 0;
    },

    //insert a sphere
    onAddSphere: () => {
      const t = camera.target || [0, 0.5, 1.2];
      const obj = makeSphere({ name: 'Sphere', center: [t[0], t[1], t[2]], radius: 0.25, albedo: defaultAlbedo, roughness: 0.2 });
      scene.addObject(obj);
      camera.sampleIndex = 0;

      return { type: 'sphere', id: obj.id, index: scene.objects.length - 1 };
    },

    //insert a box
    onAddBox: () => {
      const t = camera.target || [0, 0.5, 1.2];
      const obj = makeAABB({ name: 'Box', min: [t[0] - 0.2, t[1] - 0.2, t[2] - 0.2], max: [t[0] + 0.2, t[1] + 0.2, t[2] + 0.2], albedo: defaultAlbedo, roughness: 0.4 });
      scene.addObject(obj);
      camera.sampleIndex = 0;

      return { type: 'box', id: obj.id, index: scene.objects.length - 1 };
    },

    //insert a mesh
    onAddMesh: () => {
      const start = scene.triCount;
      const obj = makeMesh({ name: 'Mesh', triStart: start, triCount: 0, origin: [0, 0, 0], albedo: defaultAlbedo, roughness: 0.25 });
      scene.addObject(obj);
      camera.sampleIndex = 0;

      return { type: 'mesh', id: obj.id, index: scene.objects.length - 1 };
    },
  });
  //render the interface on initialisation
  ui.render();
  renderProperties(ui.getSelection?.(), scene, camera);

  return ui;
}
