// 3D view of the anatomy app: three.js scene, orbit camera (360° turn, tilt, pinch zoom, pan), picking and labels.
// No DOM besides the canvas it gets; the page (index.html) owns all texts. Architecture: anatomy/README.md.
//
// Every layer is ONE merged mesh (one draw call) with a colour and a part-id attribute per vertex. Parts are
// ranges of that mesh: hiding a part zeroes its triangles in the index buffer, highlighting rewrites its colours.
// Picking and labels render the part ids into an offscreen target (no ray casting through 600 000 triangles).
import * as THREE from '../assets/vendor/three/three.module.js';

const PICK_VS = `attribute vec3 pid; varying vec3 vPid;
void main(){ vPid = pid; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PICK_FS = `varying vec3 vPid; void main(){ gl_FragColor = vec4(vPid, 1.0); }`;
const encode = id => [id & 255, (id >> 8) & 255, (id >> 16) & 255];
const decode = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

export function supported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (_) { return false; }
}

export class Viewer {
  /**
   * @param canvas   <canvas> to draw into
   * @param opts     { bounds: {min,max}, parts: index.json parts, onTap(partIndex|-1, x, y), onRest(), onMove() }
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts;
    this.parts = opts.parts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a70, 1.6));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.camera.add(this.sun); this.sun.position.set(0.4, 0.6, 1);
    this.scene.add(this.camera);
    this.pickMat = new THREE.ShaderMaterial({ vertexShader: PICK_VS, fragmentShader: PICK_FS, side: THREE.DoubleSide });
    this.pickTarget = new THREE.WebGLRenderTarget(1, 1);
    this.layers = new Map();      // id -> { mesh, geo, index (full), parts: [global indices], transparent }
    this.hidden = new Set();      // global part indices
    this.marks = new Map();       // global part index -> colour (highlight)
    const { min, max } = opts.bounds;
    this.qMin = min; this.qScale = [0, 1, 2].map(a => (max[a] - min[a]) / 65535);
    this.home = { target: new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2), dist: (max[1] - min[1]) * 2.05, az: 0, el: 0.08 };
    this.view = { target: this.home.target.clone(), dist: this.home.dist, az: 0, el: this.home.el };
    this.goal = null;               // animation target for focus/reset
    this.autoRotate = false;
    this.dirty = true;
    this.pointers = new Map();
    this.bindInput();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.resize();
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; opts.onLost?.(); });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /* ---------- Layers ---------- */
  /** Builds the mesh of a layer from its .bin file (see scripts/anatomy/pack.mjs) */
  addLayer(id, layerIndex, buffer, { transparent = false } = {}) {
    const own = [];
    this.parts.forEach((p, i) => { if (p[0] === layerIndex) own.push(i); });
    const nv = own.reduce((s, i) => s + this.parts[i][7], 0), ni = own.reduce((s, i) => s + this.parts[i][9], 0);
    const q = new Uint16Array(buffer, 0, nv * 3), qi = new Uint16Array(buffer, nv * 6, ni);
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), pid = new Uint8Array(nv * 3);
    const idx = new Uint32Array(ni);
    for (let k = 0; k < nv * 3; k++) pos[k] = this.qMin[k % 3] + q[k] * this.qScale[k % 3];
    const c = new THREE.Color();
    for (const i of own) {
      const [, , , , , rgb, v0, vn, i0, inn] = this.parts[i];
      c.setHex(rgb);
      const [r, g, b] = encode(i + 1);
      for (let v = v0; v < v0 + vn; v++) { col.set([c.r, c.g, c.b], v * 3); pid[v * 3] = r; pid[v * 3 + 1] = g; pid[v * 3 + 2] = b; }
      for (let k = i0; k < i0 + inn; k++) idx[k] = qi[k] + v0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('pid', new THREE.BufferAttribute(pid, 3, true));
    geo.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
    if (transparent) Object.assign(mat, { transparent: true, opacity: 0.35, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = transparent ? 1 : 0;
    this.scene.add(mesh);
    const layer = { id, mesh, geo, index: idx, parts: own, transparent, base: col.slice() };
    this.layers.set(id, layer);
    for (const i of own) { if (this.hidden.has(i)) this.applyHidden(i); if (this.marks.has(i)) this.applyMark(i); }
    this.dirty = true;
    return layer;
  }
  hasLayer(id) { return this.layers.has(id); }
  setLayerVisible(id, on) { const l = this.layers.get(id); if (l) { l.mesh.visible = on; this.dirty = true; } }
  setOpacity(id, opacity) {
    const l = this.layers.get(id); if (!l) return;
    l.mesh.material.opacity = opacity;
    l.mesh.material.transparent = opacity < 1;
    l.mesh.material.depthWrite = opacity >= 1;
    l.mesh.material.needsUpdate = true;
    this.dirty = true;
  }
  layerOfPart(i) { for (const l of this.layers.values()) if (this.parts[i][0] === this.parts[l.parts[0]][0]) return l; return null; }

  /* ---------- Parts: hide, highlight ---------- */
  setHidden(i, on) {
    if (on) this.hidden.add(i); else this.hidden.delete(i);
    this.applyHidden(i);
  }
  showAll() { const list = [...this.hidden]; this.hidden.clear(); for (const i of list) this.applyHidden(i); }
  applyHidden(i) {
    const l = this.layerOfPart(i); if (!l) return;
    const [, , , , , , , , i0, inn] = this.parts[i];
    const attr = l.geo.index, arr = attr.array;
    if (this.hidden.has(i)) arr.fill(0, i0, i0 + inn); else arr.set(l.index.subarray(i0, i0 + inn), i0);
    attr.needsUpdate = true;
    this.dirty = true;
  }
  /** Colours a part (css colour) or restores it (null) */
  mark(i, css) {
    if (css) this.marks.set(i, css); else this.marks.delete(i);
    this.applyMark(i);
  }
  clearMarks() { const list = [...this.marks.keys()]; this.marks.clear(); for (const i of list) this.applyMark(i); }
  applyMark(i) {
    const l = this.layerOfPart(i); if (!l) return;
    const [, , , , , , v0, vn] = this.parts[i];
    const attr = l.geo.getAttribute('color'), arr = attr.array;
    const css = this.marks.get(i);
    if (css) {
      const c = new THREE.Color(css);
      for (let v = v0; v < v0 + vn; v++) arr.set([c.r, c.g, c.b], v * 3);
    } else arr.set(l.base.subarray(v0 * 3, (v0 + vn) * 3), v0 * 3);
    attr.needsUpdate = true;
    this.dirty = true;
  }
  /** Is a part drawn right now (layer loaded and on, part not hidden)? */
  drawn(i) { const l = this.layerOfPart(i); return !!l && l.mesh.visible && !this.hidden.has(i); }

  /* ---------- Camera ---------- */
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
    this.rest();
  }
  applyView() {
    const v = this.view, c = this.camera;
    // Portrait screens: move back so the whole body fits the width too
    const fitW = this.camera.aspect < 0.45 ? 0.45 / this.camera.aspect : 1;
    const d = v.dist * fitW;
    c.position.set(v.target.x + d * Math.sin(v.az) * Math.cos(v.el), v.target.y + d * Math.sin(v.el), v.target.z + d * Math.cos(v.az) * Math.cos(v.el));
    c.lookAt(v.target);
    c.near = Math.max(0.005, d / 100); c.far = d + 5;
    c.updateProjectionMatrix();
  }
  rotate(dAz, dEl) {
    this.view.az = (this.view.az + dAz) % (Math.PI * 2);
    this.view.el = Math.max(-1.45, Math.min(1.45, this.view.el + dEl));
    this.goal = null; this.moved();
  }
  zoom(f) {
    this.view.dist = Math.max(0.05, Math.min(this.home.dist * 2.5, this.view.dist * f));
    this.goal = null; this.moved();
  }
  pan(dx, dy) {
    const s = this.view.dist * Math.tan(this.camera.fov * Math.PI / 360) * 2 / this.canvas.clientHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.view.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
    this.goal = null; this.moved();
  }
  /** Turns to a named side: front, back, left, right */
  turnTo(side) {
    const az = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[side] ?? 0;
    this.animate({ target: this.view.target.clone(), dist: this.view.dist, az, el: 0.05 });
  }
  reset() { this.animate({ target: this.home.target.clone(), dist: this.home.dist, az: 0, el: this.home.el }); }
  /** Moves the camera so that a part fills about a third of the view */
  focus(i) {
    const l = this.layerOfPart(i); if (!l) return;
    const [, , , , , , v0, vn] = this.parts[i];
    const p = l.geo.getAttribute('position').array;
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let k = v0; k < v0 + vn; k++) box.expandByPoint(v.set(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]));
    const size = box.getSize(new THREE.Vector3()).length();
    const dist = Math.max(0.12, Math.min(this.home.dist, size * 3.2));
    // Keep the current side unless the part's centre lies behind the body's centre line
    this.animate({ target: box.getCenter(new THREE.Vector3()), dist, az: this.view.az, el: this.view.el });
  }
  animate(goal) {
    const v = this.view;
    let daz = goal.az - v.az;
    daz = ((daz + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;   // shortest way round
    this.goal = { from: { target: v.target.clone(), dist: v.dist, az: v.az, el: v.el }, to: { ...goal, az: v.az + daz }, t0: performance.now() };
    this.moved();
  }
  moved() { this.dirty = true; this.opts.onMove?.(); clearTimeout(this.restTimer); this.restTimer = setTimeout(() => this.rest(), 180); }
  rest() { if (!this.goal && !this.autoRotate && !this.pointers.size) this.opts.onRest?.(); }
  setAutoRotate(on) { this.autoRotate = on; this.last = performance.now(); if (!on) this.moved(); this.dirty = true; }
  state() { return { azimuthDeg: Math.round(((this.view.az * 180 / Math.PI) % 360 + 360) % 360), elevationDeg: Math.round(this.view.el * 180 / Math.PI), zoom: +(this.home.dist / this.view.dist).toFixed(2) }; }

  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.lost) return;
    if (this.goal) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const t = reduce ? 1 : Math.min(1, (now - this.goal.t0) / 450);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const { from, to } = this.goal;
      this.view.target.lerpVectors(from.target, to.target, e);
      this.view.dist = from.dist + (to.dist - from.dist) * e;
      this.view.az = from.az + (to.az - from.az) * e;
      this.view.el = from.el + (to.el - from.el) * e;
      this.dirty = true;
      if (t >= 1) { this.goal = null; this.moved(); }
    }
    if (this.autoRotate && !this.pointers.size) {
      const dt = Math.min(100, now - (this.last || now));
      this.view.az = (this.view.az + dt * 0.0006) % (Math.PI * 2);
      this.dirty = true;
      this.opts.onMove?.();
    }
    this.last = now;
    if (!this.dirty) return;
    this.dirty = false;
    this.applyView();
    this.renderer.render(this.scene, this.camera);
  }

  /* ---------- Picking & labels (part ids rendered offscreen) ---------- */
  renderIds(w, h, offset) {
    const r = this.renderer, cam = this.camera;
    this.applyView();
    if (offset) cam.setViewOffset(this.canvas.clientWidth, this.canvas.clientHeight, offset[0], offset[1], 1, 1);
    this.pickTarget.setSize(w, h);
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    // Layers that are see-through (skin below full opacity) do not hide what lies under them
    const saved = [];
    for (const l of this.layers.values()) {
      saved.push([l.mesh, l.mesh.visible]);
      if (l.mesh.material.opacity < 0.9) l.mesh.visible = false;
    }
    this.scene.overrideMaterial = this.pickMat;
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.pickTarget);
    r.clear();
    r.render(this.scene, cam);
    let buf = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(this.pickTarget, 0, 0, w, h, buf);
    // Nothing solid there: try the see-through layers
    if (offset && !decode(buf, 0)) {
      for (const [m, vis] of saved) m.visible = vis && m.material.opacity < 0.9;
      r.clear(); r.render(this.scene, cam);
      r.readRenderTargetPixels(this.pickTarget, 0, 0, w, h, buf);
    }
    r.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    for (const [m, vis] of saved) m.visible = vis;
    r.setClearColor(prevClear, prevAlpha);
    if (offset) cam.clearViewOffset();
    this.dirty = true;
    return buf;
  }
  /** Part index under a point of the canvas (CSS pixels), or -1 */
  pickAt(x, y) {
    if (this.lost) return -1;
    const buf = this.renderIds(1, 1, [x, y]);
    return decode(buf, 0) - 1;
  }
  /** Visible parts with their on-screen area: [{ i, x, y, px }] (CSS pixels), largest first */
  visibleParts(maxW = 200) {
    if (this.lost) return [];
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (!cw || !ch) return [];
    const s = Math.min(1, maxW / cw), w = Math.max(1, Math.round(cw * s)), h = Math.max(1, Math.round(ch * s));
    const buf = this.renderIds(w, h);
    const acc = new Map();
    const at = (x, y) => decode(buf, (y * w + x) * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const id = at(x, y); if (!id) continue;
      let a = acc.get(id); if (!a) acc.set(id, a = { n: 0, sx: 0, sy: 0, inner: [], edge: [] });
      a.n++; a.sx += x; a.sy += y;
      // Inner pixels (all four neighbours belong to the part) make safe points to tap and to pin a label to
      const inner = x > 0 && y > 0 && x < w - 1 && y < h - 1 && at(x - 1, y) === id && at(x + 1, y) === id && at(x, y - 1) === id && at(x, y + 1) === id;
      const list = inner ? a.inner : a.edge;
      if (list.length < 800) list.push(x, y);
    }
    const out = [];
    for (const [id, a] of acc) {
      // Label point: the visible pixel of the part closest to its centre (centres of curved parts can lie outside)
      const cx = a.sx / a.n, cy = a.sy / a.n, pts = a.inner.length ? a.inner : a.edge;
      let bx = cx, by = cy, bd = Infinity;
      for (let k = 0; k < pts.length; k += 2) { const d = (pts[k] - cx) ** 2 + (pts[k + 1] - cy) ** 2; if (d < bd) { bd = d; bx = pts[k]; by = pts[k + 1]; } }
      out.push({ i: id - 1, x: (bx + 0.5) / s, y: ch - (by + 0.5) / s, px: a.n / (s * s) });
    }
    return out.sort((a, b) => b.px - a.px);
  }

  /* ---------- Input: drag = turn, two fingers = zoom + move, wheel = zoom, tap = pick ---------- */
  bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    let start = null, pinch = null;
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) start = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      else { start && (start.moved = true); pinch = this.pinchInfo(); }
    });
    c.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) {
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) start.moved = true;
        if (start?.moved) {
          if (e.shiftKey || e.buttons === 4 || e.buttons === 2) this.pan(dx, dy);
          else this.rotate(-dx * 0.0085, dy * 0.0085);
        }
      } else if (this.pointers.size === 2 && pinch) {
        const now = this.pinchInfo();
        if (now.d > 0 && pinch.d > 0) this.zoom(pinch.d / now.d);
        this.pan(now.x - pinch.x, now.y - pinch.y);
        pinch = now;
      }
    });
    const up = e => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (e.type === 'pointerup' && start && !start.moved && !this.pointers.size && performance.now() - start.t < 600) {
        const r = c.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        this.opts.onTap?.(this.pickAt(x, y), x, y);
      }
      if (this.pointers.size < 2) pinch = null;
      if (!this.pointers.size) { start = null; this.moved(); }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0015))); }, { passive: false });
    c.addEventListener('keydown', e => {
      const k = e.key, step = 0.16;
      if (k === 'ArrowLeft') this.rotate(step, 0);
      else if (k === 'ArrowRight') this.rotate(-step, 0);
      else if (k === 'ArrowUp') this.rotate(0, step / 2);
      else if (k === 'ArrowDown') this.rotate(0, -step / 2);
      else if (k === '+' || k === '=') this.zoom(0.85);
      else if (k === '-') this.zoom(1 / 0.85);
      else return;
      e.preventDefault();
    });
  }
  pinchInfo() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
