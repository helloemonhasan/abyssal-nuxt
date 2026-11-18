import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld } from './core';
import { NOISE, FS_VERT } from './glsl';

/* -------------------------------------------------------------------------
   Shared building blocks
   ------------------------------------------------------------------------- */

/* Beam test in screen space: a torch held below the frame, aimed at uBeam.xy */
export const BEAM_FN = /* glsl */`
float beamMask(vec2 uv, vec3 beam, float asp){
  vec2 A = vec2(asp, 1.0);
  vec2 O = vec2(0.5, -0.15) * A;
  vec2 M = beam.xy * A;
  vec2 dir = normalize(M - O + 1e-5);
  vec2 v = uv * A - O;
  float along = dot(v, dir);
  float perp = length(v - dir * along);
  float width = 0.03 + along * 0.2;
  return (1.0 - smoothstep(width * 0.35, width, perp)) * step(0.0, along) * exp(-along * 0.5) * beam.z;
}
`;

/* Full-screen water: depth gradient, sun shafts, a shimmering surface, caustics, torch beam, grain */
export function makeBackground(o) {
  const opt = Object.assign({
    top: '#0B4A63', bottom: '#021320', glow: '#000000', glowPos: [0.65, 0.5],
    sun: [0.7, 1.15], sunColor: '#FFF4D6', rays: 0, surface: 0, caustic: 0, grain: 0.04, beamColor: '#CFF6FF',
  }, o);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(opt.top) }, uBottom: { value: new THREE.Color(opt.bottom) },
      uGlow: { value: new THREE.Color(opt.glow) }, uGlowPos: { value: new THREE.Vector2(...opt.glowPos) },
      uSun: { value: new THREE.Vector2(...opt.sun) }, uSunColor: { value: new THREE.Color(opt.sunColor) },
      uRays: { value: opt.rays }, uSurface: { value: opt.surface }, uCaustic: { value: opt.caustic }, uGrain: { value: opt.grain },
      uBeam: { value: new THREE.Vector3(0.5, 0.5, 0) }, uBeamColor: { value: new THREE.Color(opt.beamColor) },
      uTime: { value: 0 }, uRes: { value: new THREE.Vector2(state.w, state.h) },
    },
    vertexShader: FS_VERT,
    fragmentShader: NOISE + BEAM_FN + /* glsl */`
      uniform vec3 uTop, uBottom, uGlow, uSunColor, uBeam, uBeamColor;
      uniform vec2 uGlowPos, uSun, uRes;
      uniform float uTime, uRays, uSurface, uCaustic, uGrain;
      varying vec2 vUv;
      float ridge(vec3 p){ return pow(1.0 - abs(snoise(p)), 6.0); }
      void main(){
        vec2 uv = vUv; float asp = uRes.x / uRes.y; vec2 A = vec2(asp, 1.0);
        float n = snoise(vec3(uv * A * 1.3, uTime * 0.04));
        vec3 col = mix(uBottom, uTop, smoothstep(-0.05, 1.05, uv.y + n * 0.06));
        vec2 gp = (uv - uGlowPos) * A;
        col += uGlow * exp(-dot(gp, gp) * 2.6) * 0.45;

        vec2 d = (uv - uSun) * A;
        float r = length(d);
        float ang = atan(d.x, -d.y);
        if (uRays > 0.0) {
          float s1 = snoise(vec3(ang * 7.0, uTime * 0.07, 0.0)) * 0.5 + 0.5;
          float s2 = snoise(vec3(ang * 16.0 + 3.0, uTime * 0.11, 1.0)) * 0.5 + 0.5;
          float shafts = pow(s1, 3.0) * 0.8 + pow(s2, 4.0) * 0.6;
          float fall = 1.0 - smoothstep(0.0, 1.8, r);
          col += uSunColor * shafts * fall * uRays * (0.3 + 0.7 * uv.y) * 0.55;
          col += uSunColor * exp(-r * r * 2.5) * 0.3 * uRays;
        }
        if (uSurface > 0.0) {
          float m = smoothstep(0.7, 1.0, uv.y);
          vec2 q = vec2(uv.x * asp * 3.2, uv.y * 10.0);
          float rip = ridge(vec3(q, uTime * 0.35)) + ridge(vec3(q * 1.7 + 4.0, -uTime * 0.28)) * 0.6;
          col += uSunColor * rip * m * uSurface * 0.5;
          col += uSunColor * m * m * uSurface * 0.22;
        }
        if (uCaustic > 0.0) {
          vec2 cq = uv * A * 2.4;
          float c = ridge(vec3(cq, uTime * 0.2)) + ridge(vec3(cq * 1.4 + 9.0, -uTime * 0.16)) * 0.7;
          col += uSunColor * c * uCaustic * smoothstep(0.0, 0.9, uv.y);
        }
        if (uBeam.z > 0.0) {
          float cone = beamMask(uv, uBeam, asp);
          vec2 sp = uv * A - uBeam.xy * A;
          float spot = exp(-dot(sp, sp) * 9.0) * uBeam.z;
          float dust = snoise(vec3(uv * A * 9.0, uTime * 0.3)) * 0.5 + 0.5;
          col += uBeamColor * (cone * (0.14 + dust * 0.08) + spot * 0.3);
        }
        float vig = 1.0 - smoothstep(0.25, 1.35, length((uv - 0.5) * vec2(asp * 0.8, 1.0)));
        col *= mix(0.62, 1.0, vig);
        col += (hash12(uv * uRes + fract(uTime * 7.0) * 113.0) - 0.5) * uGrain;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(fsGeo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

/* Marine snow: drifting motes that rise as you scroll; brighter inside a torch beam */
export function makeSnow({ count = 1100, color = '#CFFFFF', size = 1, opacity = 0.7, spread = [18, 12, 12] }) {
  if (mqMobile()) count = Math.floor(count * 0.45);
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread[0];
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
    pos[i * 3 + 2] = -Math.random() * spread[2] + 3;
    rnd[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uScroll: { value: 0 }, uColor: { value: new THREE.Color(color) },
      uSize: { value: size }, uOpacity: { value: opacity }, uDpr: { value: state.dpr }, uHeight: { value: spread[1] },
      uBeam: { value: new THREE.Vector3(0.5, 0.5, 0) }, uRes: { value: new THREE.Vector2(state.w, state.h) },
    },
    vertexShader: BEAM_FN + /* glsl */`
      attribute float aRnd;
      uniform float uTime, uScroll, uSize, uDpr, uHeight;
      uniform vec3 uBeam; uniform vec2 uRes;
      varying float vAlpha; varying float vBeam;
      void main(){
        vec3 p = position;
        float h = uHeight;
        p.y = mod(p.y - uTime * 0.12 * (0.3 + aRnd) + uScroll * (0.5 + aRnd * 0.7) + h * 0.5, h) - h * 0.5;
        p.x += sin(uTime * 0.3 + aRnd * 40.0) * 0.18;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * uDpr * (0.6 + aRnd * 1.6) * (14.0 / -mv.z);
        vec4 clip = projectionMatrix * mv;
        gl_Position = clip;
        vAlpha = (0.25 + 0.75 * aRnd) * smoothstep(-26.0, -7.0, mv.z) * (1.0 - smoothstep(-3.0, -1.0, mv.z));
        vBeam = 0.0;
        if (uBeam.z > 0.0) vBeam = beamMask(clip.xy / clip.w * 0.5 + 0.5, uBeam, uRes.x / uRes.y);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying float vAlpha; varying float vBeam;
      void main(){
        float r = length(gl_PointCoord - 0.5);
        float glow = pow(1.0 - smoothstep(0.0, 0.5, r), 1.6);
        float core = 1.0 - smoothstep(0.0, 0.14, r);
        gl_FragColor = vec4(uColor * (1.0 + vBeam * 1.5), (glow * 0.35 + core) * vAlpha * (uOpacity + vBeam * 1.4));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, material);
  pts.frustumCulled = false;
  return pts;
}

/* Rising bubbles: an ambient stream plus bursts on click */
export class Bubbles {
  constructor({ count = 300, light = false } = {}) {
    if (mqMobile()) count = Math.floor(count * 0.5);
    this.N = count;
    this.pos = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.life = new Float32Array(count);
    this.vel = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uDpr: { value: state.dpr }, uEdge: { value: new THREE.Color(light ? '#0A5770' : '#DDF8FF') } },
      vertexShader: /* glsl */`
        attribute float aSize, aLife; uniform float uDpr; varying float vLife;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uDpr * (120.0 / -mv.z) * step(0.001, aLife); gl_Position = projectionMatrix * mv; vLife = aLife; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uEdge; varying float vLife;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
          if (r > 1.0) discard;
          float edge = (1.0 - smoothstep(0.82, 1.0, r)) - (1.0 - smoothstep(0.5, 0.82, r)) * 0.85;
          float hl = 1.0 - smoothstep(0.0, 0.32, length(c - vec2(-0.16, -0.18)));
          vec3 col = mix(uEdge, vec3(1.0), hl);
          gl_FragColor = vec4(col, (edge * 0.6 + hl * 0.9) * clamp(vLife * 3.0, 0.0, 1.0));
        }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.ambient = 0;
    this.cursorIdx = 0;
  }
  spawn(x, y, z, count, spread = 0.4) {
    let made = 0;
    for (let i = 0; i < this.N && made < count; i++) {
      const k = (this.cursorIdx + i) % this.N;
      if (this.life[k] > 0) continue;
      this.pos[k * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.size[k] = 0.4 + Math.random() * Math.random() * 2.4;
      this.vel[k] = 0.8 + Math.random() * 1.6;
      this.life[k] = 1;
      made++;
      this.cursorIdx = k + 1;
    }
  }
  update(t, dt, camera, rate) {
    const vH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const vW = vH * camera.aspect;
    this.ambient += dt * rate;
    while (this.ambient >= 1) {
      this.ambient -= 1;
      this.spawn((Math.random() - 0.5) * vW, -vH * 0.6, (Math.random() - 0.5) * 3, 1, 0.2);
    }
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.pos[i * 3 + 1] += this.vel[i] * dt * (0.6 + this.size[i] * 0.25);
      this.pos[i * 3] += Math.sin(t * 2.5 + i) * 0.004;
      if (this.pos[i * 3 + 1] > vH * 0.62) this.life[i] -= dt * 1.5;
      this.life[i] -= dt * 0.03;
      if (this.life[i] <= 0) this.life[i] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
  }
}

/* Smooth body-of-revolution helper: keys are [t, radius], t = 0 at the nose, 1 at the tail */
export function sampleProfile(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, r0] = keys[i], [t1, r1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / Math.max(1e-6, t1 - t0);
      return r0 + (r1 - r0) * (1 - Math.cos(Math.PI * f)) / 2;
    }
  }
  return keys[keys.length - 1][1];
}
export function bodyGeometry(keys, length, radial = 48, steps = 90) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(new THREE.Vector2(Math.max(sampleProfile(keys, t), 0.0005), (0.5 - t) * length));
  }
  const g = new THREE.LatheGeometry(pts, radial);
  g.rotateZ(-Math.PI / 2);           // length along x, nose at +x
  return g;
}
export function finGeometry(build, curveSegments = 10) {
  const s = new THREE.Shape();
  build(s);
  return new THREE.ShapeGeometry(s, curveSegments);
}

/* -------------------------------------------------------------------------
   Base scene
   ------------------------------------------------------------------------- */
export class BaseScene {
  constructor(bg) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, state.w / state.h, 0.1, 120);
    this.camera.position.set(0, 0, 10);
    this.bg = makeBackground(bg);
    this.scene.add(this.bg);
    this.distort = 0.5;
    this.raycaster = new THREE.Raycaster();
  }
  resize() {
    this.camera.aspect = state.w / state.h;
    this.camera.updateProjectionMatrix();
    this.bg.material.uniforms.uRes.value.set(state.w, state.h);
    this.scene.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.uRes && o !== this.bg) o.material.uniforms.uRes.value.set(state.w, state.h); });
  }
  setGlowAt(obj) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(this.camera);
    this.bg.material.uniforms.uGlowPos.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
  }
  /* Where the pointer ray meets the plane z = planeZ */
  mouseWorld(planeZ = 0) {
    this.raycaster.setFromCamera(new THREE.Vector2(state.mouse.nx, state.mouse.ny), this.camera);
    const p = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ), p);
    return hit ? p : null;
  }
  update(t) { this.bg.material.uniforms.uTime.value = t; }
  render(target) { renderer.setRenderTarget(target); renderer.render(this.scene, this.camera); }
  onClick() { return false; }
  cursor() { return ''; }
}
