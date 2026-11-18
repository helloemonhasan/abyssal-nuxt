/* Shared state, helpers and the WebGL renderer.
   Client-only: import this module from onMounted (see pages/index.vue). */
import * as THREE from 'three';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mqMobile = () => window.innerWidth < 650;

/* Environment flags, read once per experience */
export const env = { finePointer: false, reducedMotion: false };

export const state = {
  w: 1, h: 1, dpr: 1,
  time: 0,
  mouse: { x: 0, y: 0, nx: 0, ny: 0, sx: 0, sy: 0, moved: false },
  started: false,
  intro: { v: 0 },          // 0 → 1 when the dive starts
  stage: { cur: 0, next: null, p: 0 },
};

export function resetState() {
  state.w = window.innerWidth;
  state.h = window.innerHeight;
  state.dpr = Math.min(window.devicePixelRatio || 1, mqMobile() ? 1.25 : 1.75);
  state.time = 0;
  state.started = false;
  state.intro.v = 0;
  Object.assign(state.mouse, { x: state.w / 2, y: state.h / 2, nx: 0, ny: 0, sx: 0, sy: 0, moved: false });
  Object.assign(state.stage, { cur: 0, next: null, p: 0 });
  env.finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  env.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* -------------------------------------------------------------------------
   Renderer (a live binding: modules that import `renderer` see updates)
   ------------------------------------------------------------------------- */
export let renderer = null;

export function initRenderer(canvas) {
  try {
    THREE.ColorManagement.enabled = false;   // colours in shaders are used as written
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(state.w, state.h, false);
    renderer.setClearColor(0x021526, 1);
  } catch (err) {
    console.warn('WebGL unavailable, using the static fallback.', err);
    renderer = null;
  }
  return renderer;
}

export function disposeRenderer() {
  if (renderer) { renderer.dispose(); renderer = null; }
}

/* -------------------------------------------------------------------------
   Full-screen passes and render targets
   ------------------------------------------------------------------------- */
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
export const fsGeo = new THREE.PlaneGeometry(2, 2);
const fsMesh = new THREE.Mesh(fsGeo);
fsMesh.frustumCulled = false;
const fsScene = new THREE.Scene();
fsScene.add(fsMesh);

export function fsPass(material, target) {
  fsMesh.material = material;
  renderer.setRenderTarget(target);
  renderer.render(fsScene, fsCam);
}

export function makeRT(scale = 1, depth = true) {
  return new THREE.WebGLRenderTarget(
    Math.max(2, Math.floor(state.w * state.dpr * scale)),
    Math.max(2, Math.floor(state.h * state.dpr * scale)),
    { type: THREE.HalfFloatType, depthBuffer: depth, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
  );
}

export function sizeRT(rt, scale = 1) {
  rt.setSize(Math.max(2, Math.floor(state.w * state.dpr * scale)), Math.max(2, Math.floor(state.h * state.dpr * scale)));
}

/* Map a DOM "tracker" box onto the z = 0 plane of a straight-on camera */
export function trackWorld(el, cam) {
  const r = el.getBoundingClientRect();
  const vH = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.position.z;
  const u = vH / state.h;
  return {
    x: (r.left + r.width / 2 - state.w / 2) * u,
    y: -(r.top + r.height / 2 - state.h / 2) * u,
    w: r.width * u, h: r.height * u,
  };
}
