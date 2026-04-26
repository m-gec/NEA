import { mk } from '../utils.js';

//mapping shape IDs to more user friendly strings
function typeFromShapeEnum(n){ return n===0?'sphere':n===1?'box':n===2?'mesh':'unknown'; }
//provide a fallback name when an object has no explicit name
function defaultNameFor(type, i){ return `${type[0].toUpperCase()+type.slice(1)} ${i+1}`; }

//normalise pointer activation so tree rows behave like buttons
function bindActivate(el, handler, { threshold = 8, keyboard = true } = {}) {
  let sx = 0, sy = 0, tracking = false, pointerActivated = false;

  function onPointerDown(e){
    if (e.button != null && e.button !== 0) return;
    tracking = true;
    sx = e.clientX; sy = e.clientY;
  }
  function onPointerUp(e){
    if (!tracking) return;
    tracking = false;
    const dx = Math.abs(e.clientX - sx);
    const dy = Math.abs(e.clientY - sy);
    if (dx <= threshold && dy <= threshold) {
      pointerActivated = true;
      handler(e);
      setTimeout(() => { pointerActivated = false; }, 0);
    }
  }
  function onPointerCancel(){ tracking = false; }

  el.addEventListener('pointerdown', onPointerDown, { passive: true });
  el.addEventListener('pointerup',   onPointerUp,   { passive: true });
  el.addEventListener('pointercancel', onPointerCancel, { passive: true });

  el.addEventListener('click', (e) => {
    if (pointerActivated) return;
    handler(e);
  });

  if (keyboard) {
    el.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const isNative = tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea';
      if (isNative) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler(e);
      }
    });
  }
}

//assemble elements
const append = (parent, ...children) => { children.forEach(c => parent.appendChild(c)); return parent; };

//reuse inline svg symbols from index.html
function svgIcon(id, className = 'icon') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

//build and control the explorer tree, add/delete buttons and selection state
export function initInterface({
  getObjects, getTrianglesForMesh,
  onAddTriangleToMesh, onSelect, onSelectionChange,
  onAddSphere, onAddBox, onAddMesh,
  getCamera,
  onDelete
}){
  let currentSelection = null;
  const expanded = new Set();

  const treeEl = document.getElementById('tree');
  const btnAddSphere = document.getElementById('add-sphere');
  const btnAddBox   = document.getElementById('add-box');
  const btnAddMesh  = document.getElementById('add-mesh');
  const resizer = document.getElementById('prop-resizer');
  const sidebar = document.getElementById('sidebar');

  const notifySelection = (sel) => { onSelect?.(sel); onSelectionChange?.(sel); };

  function clearSelected(){
    treeEl.querySelectorAll('[aria-selected="true"]').forEach(el => el.setAttribute('aria-selected','false'));
  }
  function selectRow(li){
    clearSelected();
    li.setAttribute('aria-selected','true');
  }
  const setSelection = (sel, li) => { selectRow(li); currentSelection = sel; notifySelection(sel); };

  const isMeshSelected = (objId) => currentSelection?.type==='mesh' && currentSelection.id === objId;
  const isTriangleSelected = (meshId, triIndex) => currentSelection?.type==='triangle' && currentSelection.meshId === meshId && currentSelection.triIndex === triIndex;

  function buildCameraRow(cam){
    const li = mk('li', 'shade-dark');
    li.setAttribute('role','treeitem');
    li.dataset.type = 'camera';
    li.style.gap = '6px';
    li.tabIndex = 0;

    const icon = svgIcon('i-camera');
    const label = mk('span','name','camera');
    const addBtn = mk('button','button add-child','+');
    addBtn.type='button'; addBtn.disabled = true; addBtn.style.visibility='hidden';

    bindActivate(li, () => setSelection({ type:'camera' }, li));
    append(li, icon, label, addBtn);

    if (currentSelection?.type === 'camera') selectRow(li);
    treeEl.appendChild(li);
  }

  function buildMeshRow(obj, idx, shadeClass){
    const type = 'mesh';
    const name = obj.name || defaultNameFor(type, idx);
    const objId = obj.id;

    const li = mk('li', shadeClass);
    li.setAttribute('role','treeitem');
    Object.assign(li.dataset, { type, id:String(objId), index:String(idx) });
    li.style.gap = '6px';
    li.tabIndex = 0;

    const twisty = mk('button','twisty', expanded.has(objId) ? '▾' : '▸');
    twisty.type='button';
    twisty.setAttribute('aria-expanded', String(expanded.has(objId)));

    const icon = svgIcon('i-mesh');
    const label = mk('span','name',name);

    const addBtn = mk('button','button add-child','+');
    addBtn.type='button'; addBtn.title='Add triangle';

    bindActivate(twisty, (e) => {
      e.stopPropagation?.();
      if (expanded.has(objId)) expanded.delete(objId); else expanded.add(objId);
      render();
    });

    bindActivate(li, () => setSelection({ type, id: objId, index: idx }, li));

    bindActivate(addBtn, (e) => {
      e.stopPropagation?.();
      onAddTriangleToMesh?.(idx);
      render();
    });

    append(li, twisty, icon, label, addBtn);
    if (isMeshSelected(objId)) selectRow(li);
    treeEl.appendChild(li);

    if (expanded.has(objId)) {
      const triCount = getTrianglesForMesh(idx)|0;
      const start = (obj.triStart|0) || 0;
      for (let i = 0; i < triCount; i++) {
        buildTriangleRow(objId, start + i, i, shadeClass);
      }
    }
  }

  function buildNonMeshRow(type, idx, shadeClass, labelText, objId){
    const li = mk('li', shadeClass);
    li.setAttribute('role','treeitem');
    Object.assign(li.dataset, { type, id:String(objId), index:String(idx) });
    li.style.gap = '6px';
    li.tabIndex = 0;

    const iconId = (type === 'sphere') ? 'i-sphere'
                : (type === 'box')    ? 'i-box'
                : 'i-mesh';
    const icon = svgIcon(iconId);
    const label = mk('span','name',labelText);

    const addBtn = mk('button','button add-child','+');
    addBtn.type='button'; addBtn.disabled = true; addBtn.style.visibility = 'hidden';

    bindActivate(li, () => setSelection({ type, id: objId, index: idx }, li));

    append(li, icon, label, addBtn);
    if (currentSelection && currentSelection.type===type && currentSelection.id===objId) selectRow(li);
    treeEl.appendChild(li);
  }

  function buildTriangleRow(meshId, globalTriIndex, triLocalIndex, shadeClass){
    const li = mk('li', `child ${shadeClass}`);
    li.setAttribute('role','treeitem');
    Object.assign(li.dataset, {
      type:'triangle',
      meshId:String(meshId),
      triIndex:String(triLocalIndex),
      globalIndex:String(globalTriIndex)
    });
    li.style.paddingLeft='28px';
    li.tabIndex = 0;

    const spacer = document.createElement('span');
    const icon = svgIcon('i-triangle');
    const name = mk('span','name',`Triangle ${triLocalIndex+1}`);

    bindActivate(li, () => setSelection({
      type:'triangle', meshId, triIndex: triLocalIndex, globalIndex: globalTriIndex
    }, li));

    append(li, spacer, icon, name);
    if (isTriangleSelected(meshId, triLocalIndex)) selectRow(li);
    treeEl.appendChild(li);
  }

  function render(){
    if(!treeEl) return;
    const objects = (getObjects?.() || []).slice();
    treeEl.innerHTML = '';

    const cam = getCamera?.();
    if (cam) buildCameraRow(cam);

    let isLight = true;
    objects.forEach((obj, idx)=>{
      const type = typeFromShapeEnum(obj.shape);
      const name = obj.name || defaultNameFor(type, idx);
      const shadeClass = isLight ? 'shade-light' : 'shade-dark';
      if (type === 'mesh') buildMeshRow(obj, idx, shadeClass);
      else buildNonMeshRow(type, idx, shadeClass, name, obj.id);
      isLight = !isLight;
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || e.isComposing) return;
    if (!currentSelection) return;
    e.preventDefault();
    onDelete?.(currentSelection);
  }, { passive: false });

  if (btnAddSphere) bindActivate(btnAddSphere, () => {
    const res = onAddSphere?.();
    if (res) currentSelection = res;
    render();
    if (res) notifySelection(currentSelection);
  });

  if (btnAddBox) bindActivate(btnAddBox, () => {
    const res = onAddBox?.();
    if (res) currentSelection = res;
    render();
    if (res) notifySelection(currentSelection);
  });

  if (btnAddMesh) bindActivate(btnAddMesh, () => {
    const res = onAddMesh?.();
    if (res) currentSelection = res;
    render();
    if (res) notifySelection(currentSelection);
  });

  (function enablePropResize() {
    if (!resizer) return;
    let startY = 0, startH = 0, dragging = false;

    function onDown(e){
      dragging = true;
      resizer.setPointerCapture?.(e.pointerId);
      startY = e.clientY;
      const cs = getComputedStyle(sidebar);
      const varH = cs.getPropertyValue('--props-h').trim();
      startH = varH ? parseFloat(varH) : (document.getElementById('properties')?.getBoundingClientRect().height || 0);
    }
    function onMove(e){
      if(!dragging) return;
      const dy = startY - e.clientY;
      let h = startH + dy;
      const min = 96, max = Math.min(window.innerHeight * 0.7, window.innerHeight - 140);
      h = Math.max(min, Math.min(max, h));
      sidebar.style.setProperty('--props-h', `${h}px`);
    }
    function onUp(){ dragging = false; }

    resizer.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  })();

  return {
    render,
    getSelection: () => currentSelection,
    clearSelection: () => {
      currentSelection = null;
      clearSelected();
      notifySelection(null);
    }
  };
}
