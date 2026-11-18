import * as THREE from 'three';
import gsap from 'gsap';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld, env } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { makeBackground, makeSnow, makeMatcap, BaseScene } from '../helpers';
import { sound } from '../../audio/sound';

/* -------------------------------------------------------------------------
   Scene 4 — resurfacing (contact): caustics, light rays, bubbles on click
   ------------------------------------------------------------------------- */
export class SurfaceScene extends BaseScene {
  constructor() {
    super({ top: '#DDF2F2', bottom: '#79C7D8', glow: '#FFFFFF', caustic: 0.12, rays: 0.1, grain: 0.03 });
    this.bg.material.uniforms.uGlowPos.value.set(0.5, 0.95);
    this.N = mqMobile() ? 160 : 320;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.N * 3);
    this.size = new Float32Array(this.N);
    this.life = new Float32Array(this.N);
    this.vel = new Float32Array(this.N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uDpr: { value: state.dpr } },
      vertexShader: /* glsl */`
        attribute float aSize, aLife; uniform float uDpr; varying float vLife;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uDpr * (120.0 / -mv.z) * step(0.001, aLife); gl_Position = projectionMatrix * mv; vLife = aLife; }`,
      fragmentShader: /* glsl */`
        varying float vLife;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
          if (r > 1.0) discard;
          float edge = smoothstep(1.0, 0.82, r) - smoothstep(0.82, 0.5, r) * 0.85;
          float hl = smoothstep(0.32, 0.0, length(c - vec2(-0.16, -0.18)));
          vec3 col = mix(vec3(0.03, 0.32, 0.42), vec3(1.0), hl);
          gl_FragColor = vec4(col, (edge * 0.55 + hl * 0.9) * clamp(vLife * 3.0, 0.0, 1.0));
        }`,
      transparent: true, depthWrite: false,
    });
    this.bubbles = new THREE.Points(g, mat);
    this.bubbles.frustumCulled = false;
    this.scene.add(this.bubbles);
    this.ambient = 0;
    this.cursorIdx = 0;
  }
  spawn(x, y, count, spread = 0.4) {
    let made = 0;
    for (let i = 0; i < this.N && made < count; i++) {
      const k = (this.cursorIdx + i) % this.N;
      if (this.life[k] > 0) continue;
      this.pos[k * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 2] = (Math.random() - 0.5) * 2;
      this.size[k] = 0.4 + Math.random() * Math.random() * 2.4;
      this.vel[k] = 0.8 + Math.random() * 1.6;
      this.life[k] = 1;
      made++;
      this.cursorIdx = k + 1;
    }
  }
  mouseWorld() {
    const v = new THREE.Vector3(state.mouse.nx, state.mouse.ny, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    const d = -this.camera.position.z / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(d));
  }
  update(t, dt) {
    super.update(t);
    const vH = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z;
    this.ambient += dt;
    while (this.ambient > 0.12) {
      this.ambient -= 0.12;
      this.spawn((Math.random() - 0.5) * vH * this.camera.aspect, -vH * 0.6, 1, 0.2);
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
    this.camera.position.x = state.mouse.sx * 0.2;
  }
  onClick() {
    const p = this.mouseWorld();
    this.spawn(p.x, p.y, 34, 0.6);
    sound.bubbles();
    return true;
  }
  cursor() { return 'BUBBLES'; }
}
