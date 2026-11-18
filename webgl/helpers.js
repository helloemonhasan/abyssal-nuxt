import * as THREE from 'three';
import gsap from 'gsap';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld, env } from './core';
import { NOISE, FS_VERT } from './glsl';

/* -------------------------------------------------------------------------
   Shared building blocks
   ------------------------------------------------------------------------- */
export function makeBackground({ top, bottom, glow = '#000000', caustic = 0, rays = 0, grain = 0.05 }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) },
      uGlow: { value: new THREE.Color(glow) }, uGlowPos: { value: new THREE.Vector2(0.65, 0.5) },
      uTime: { value: 0 }, uCaustic: { value: caustic }, uRays: { value: rays }, uGrain: { value: grain },
      uRes: { value: new THREE.Vector2(state.w, state.h) },
    },
    vertexShader: FS_VERT,
    fragmentShader: NOISE + /* glsl */`
      uniform vec3 uTop, uBottom, uGlow; uniform vec2 uGlowPos, uRes;
      uniform float uTime, uCaustic, uRays, uGrain;
      varying vec2 vUv;
      float ridge(vec3 p){ return pow(1.0 - abs(snoise(p)), 7.0); }
      void main(){
        vec2 uv = vUv; float asp = uRes.x / uRes.y;
        vec2 q = uv * vec2(asp, 1.0);
        float n = snoise(vec3(q * 1.4, uTime * 0.04));
        vec3 col = mix(uBottom, uTop, smoothstep(-0.1, 1.05, uv.y + n * 0.07));
        vec2 gp = (uv - uGlowPos) * vec2(asp, 1.0);
        col += uGlow * exp(-dot(gp, gp) * 2.6) * 0.5;
        if (uCaustic > 0.0) {
          float c = ridge(vec3(q * 2.2, uTime * 0.18)) + ridge(vec3(q * 3.1 + 7.0, -uTime * 0.14)) * 0.7;
          col += vec3(1.0) * c * uCaustic * smoothstep(0.0, 1.0, uv.y);
        }
        if (uRays > 0.0) {
          float x = (uv.x - 0.5) * asp + uv.y * 0.25;
          float r = smoothstep(0.86, 1.0, sin(x * 7.0 + uTime * 0.15) * 0.5 + 0.5)
                  + smoothstep(0.9, 1.0, sin(x * 13.0 - uTime * 0.11 + 2.0) * 0.5 + 0.5) * 0.6;
          col += vec3(1.0) * r * uRays * smoothstep(0.15, 1.0, uv.y);
        }
        float vig = smoothstep(1.35, 0.25, length((uv - 0.5) * vec2(asp * 0.8, 1.0)));
        col *= mix(0.6, 1.0, vig);
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

/* Marine snow: drifting points that rise as you scroll, so you feel the descent */
export function makeSnow({ count = 1100, color = '#CFFFFF', size = 1, opacity = 0.7, spread = [16, 12, 12] }) {
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
    },
    vertexShader: /* glsl */`
      attribute float aRnd;
      uniform float uTime, uScroll, uSize, uDpr, uHeight;
      varying float vAlpha;
      void main(){
        vec3 p = position;
        float h = uHeight;
        p.y = mod(p.y - uTime * 0.12 * (0.3 + aRnd) + uScroll * (0.5 + aRnd * 0.7) + h * 0.5, h) - h * 0.5;
        p.x += sin(uTime * 0.3 + aRnd * 40.0) * 0.18;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * uDpr * (0.6 + aRnd * 1.6) * (14.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vAlpha = (0.25 + 0.75 * aRnd) * smoothstep(-24.0, -7.0, mv.z) * smoothstep(-1.0, -3.0, mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying float vAlpha;
      void main(){
        float r = length(gl_PointCoord - 0.5);
        float glow = pow(smoothstep(0.5, 0.0, r), 1.6);
        float core = smoothstep(0.14, 0.0, r);
        gl_FragColor = vec4(uColor, (glow * 0.35 + core) * vAlpha * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, material);
  pts.frustumCulled = false;
  return pts;
}

/* Procedural matcap: lighting painted into a sphere image (no lights needed) */
export function makeMatcap({ base, mid, highlight, rim }) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  const g = x.createRadialGradient(92, 78, 6, 128, 128, 132);
  g.addColorStop(0, highlight); g.addColorStop(0.28, mid); g.addColorStop(1, base);
  x.fillStyle = g; x.beginPath(); x.arc(128, 128, 128, 0, Math.PI * 2); x.fill();
  const r = x.createRadialGradient(128, 128, 92, 128, 128, 128);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, rim);
  x.fillStyle = r; x.beginPath(); x.arc(128, 128, 128, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/* -------------------------------------------------------------------------
   Base scene
   ------------------------------------------------------------------------- */
export class BaseScene {
  constructor(bg) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, state.w / state.h, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.bg = makeBackground(bg);
    this.scene.add(this.bg);
  }
  resize() {
    this.camera.aspect = state.w / state.h;
    this.camera.updateProjectionMatrix();
    this.bg.material.uniforms.uRes.value.set(state.w, state.h);
  }
  setGlowAt(obj) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(this.camera);
    this.bg.material.uniforms.uGlowPos.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
  }
  update(t) { this.bg.material.uniforms.uTime.value = t; }
  render(target) { renderer.setRenderTarget(target); renderer.render(this.scene, this.camera); }
  onClick() { return false; }
}
