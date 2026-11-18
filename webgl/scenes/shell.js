import * as THREE from 'three';
import gsap from 'gsap';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld, env } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { makeBackground, makeSnow, makeMatcap, BaseScene } from '../helpers';
import { sound } from '../../audio/sound';

/* -------------------------------------------------------------------------
   Scene 1 — the nautilus (who we are)
   ------------------------------------------------------------------------- */
export function shellGeometry() {
  const U = mqMobile() ? 180 : 280, V = 48, turns = 3.1, b = 0.175, a0 = 0.08;
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= U; i++) {
    const u = (i / U) * turns * Math.PI * 2;
    const r = a0 * Math.exp(b * u);
    const tr = r * 0.6;
    for (let j = 0; j <= V; j++) {
      const v = (j / V) * Math.PI * 2;
      const rr = r + tr * Math.cos(v);
      pos.push(rr * Math.cos(u), rr * Math.sin(u), tr * Math.sin(v) * 0.92);
      uvs.push(i / U, j / V);
    }
  }
  for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
    const a = i * (V + 1) + j, c = a + V + 1;
    idx.push(a, c, a + 1, c, c + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.center();
  g.computeBoundingSphere();
  const s = 1 / g.boundingSphere.radius;
  g.scale(s, s, s);
  return g;
}

export class ShellScene extends BaseScene {
  constructor() {
    super({ top: '#2A1152', bottom: '#090316', glow: '#B44CFF', grain: 0.05 });
    this.tracker = $('[data-track="shell"]');
    this.section = $('.who');
    const matcap = makeMatcap({ base: '#1B0B33', mid: '#7E4BB8', highlight: '#FFE9FF', rim: 'rgba(246,198,255,0.85)' });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tMatcap: { value: matcap }, uTime: { value: 0 }, uStripe: { value: new THREE.Color('#3A1460') }, uGlow: { value: new THREE.Color('#F6C6FF') } },
      vertexShader: /* glsl */`
        varying vec3 vNormal; varying vec3 vViewPos; varying vec2 vUv;
        void main(){
          vUv = uv; vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); vViewPos = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: MATCAP_FN + /* glsl */`
        uniform sampler2D tMatcap; uniform float uTime; uniform vec3 uStripe, uGlow;
        varying vec3 vNormal; varying vec3 vViewPos; varying vec2 vUv;
        void main(){
          vec3 n = normalize(vNormal); if (!gl_FrontFacing) n = -n;
          vec3 col = texture2D(tMatcap, matcapUv(n, vViewPos)).rgb;
          float stripe = smoothstep(0.35, 0.65, sin(vUv.x * 95.0 + sin(vUv.y * 6.283) * 1.4) * 0.5 + 0.5);
          stripe *= smoothstep(0.45, 0.95, vUv.x) * smoothstep(0.0, 0.25, abs(vUv.y - 0.5));
          col = mix(col, uStripe, stripe * 0.6);
          float fres = pow(1.0 - abs(dot(n, normalize(vViewPos))), 3.0);
          float wave = 0.5 + 0.5 * sin(vUv.x * 30.0 - uTime * 2.0);
          col += uGlow * fres * (0.35 + wave * 0.35);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.DoubleSide,
    });
    this.shell = new THREE.Mesh(shellGeometry(), this.mat);
    this.group = new THREE.Group();
    this.group.add(this.shell);
    this.scene.add(this.group);
    this.snow = makeSnow({ count: 900, color: '#F6C6FF', opacity: 0.55 });
    this.scene.add(this.snow);
  }
  update(t) {
    super.update(t);
    const r = this.section.getBoundingClientRect();
    const p = clamp((state.h - r.top) / (r.height + state.h));
    const tr = trackWorld(this.tracker, this.camera);
    const s = Math.min(tr.w, tr.h) * 0.46;
    this.group.position.set(tr.x + state.mouse.sx * 0.2, tr.y + Math.sin(t * 0.6) * 0.1 + state.mouse.sy * 0.15, 0);
    this.group.scale.setScalar(s);
    this.shell.rotation.set(0.5 + state.mouse.sy * 0.2, -0.4 + Math.sin(t * 0.3) * 0.25 + state.mouse.sx * 0.3, -p * 2.6 + t * 0.04);
    this.mat.uniforms.uTime.value = t;
    this.snow.material.uniforms.uTime.value = t;
    this.snow.material.uniforms.uScroll.value = (window.scrollY || 0) * 0.004;
    this.setGlowAt(this.group);
  }
}
