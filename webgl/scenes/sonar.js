import * as THREE from 'three';
import gsap from 'gsap';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld, env } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { makeBackground, makeSnow, makeMatcap, BaseScene } from '../helpers';
import { sound } from '../../audio/sound';

/* -------------------------------------------------------------------------
   Scene 3 — sonar seabed (how we work)
   ------------------------------------------------------------------------- */
export class SonarScene extends BaseScene {
  constructor() {
    super({ top: '#0B1424', bottom: '#020306', glow: '#DDFF6B', grain: 0.05 });
    this.camera.position.set(0, 2.8, 10);
    this.camera.lookAt(0, -1.2, 0);
    this.section = $('.how');
    this.bg.material.uniforms.uGlowPos.value.set(0.5, 0.25);
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#DDFF6B') }, uLure: { value: new THREE.Vector2() }, uLureOn: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uLureOn; uniform vec3 uColor; uniform vec2 uLure;
        varying vec3 vWorld;
        float line(float v, float w){ float f = fract(v); float d = min(f, 1.0 - f); float aa = fwidth(v) * w; return 1.0 - smoothstep(0.0, aa, d); }
        void main(){
          vec2 p = vWorld.xz;
          float r = length(p);
          float ang = atan(p.y, p.x);
          float grid = max(line(p.x * 0.5, 1.2), line(p.y * 0.5, 1.2));
          float range = line(r * 0.25, 1.5);
          float wave = line(r * 0.5 - uTime * 0.18, 2.5);
          float sweepA = uTime * 0.7;
          float da = mod(sweepA - ang, 6.28318);
          float sweep = exp(-da * 4.5) * smoothstep(16.0, 1.0, r);
          float blips = 0.0;
          for (int i = 0; i < 7; i++) {
            float fi = float(i);
            vec2 b = vec2(cos(fi * 2.3 + 0.4), sin(fi * 2.3 + 0.4)) * (2.5 + mod(fi * 3.7, 9.0));
            float age = mod(sweepA - atan(b.y, b.x), 6.28318) / 0.7;
            float d = length(p - b);
            blips += exp(-d * d * 6.0) * exp(-age * 0.9) * 1.4 + exp(-d * d * 60.0) * 0.25;
          }
          float fall = smoothstep(20.0, 2.0, r);
          float lure = exp(-length(p - uLure) * 0.55) * uLureOn;
          vec3 col = uColor * (grid * 0.06 + range * 0.18 + wave * 0.24 + sweep * 0.22 + blips) * fall;
          col += uColor * lure * 0.45;
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44, 1, 1), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    this.scene.add(floor);

    // The lure: an anglerfish light that follows the cursor
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    this.lureMat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 120 * state.dpr }, uTime: { value: 0 } },
      vertexShader: `uniform float uSize; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize * (8.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; void main(){ float r = length(gl_PointCoord - 0.5); float a = pow(smoothstep(0.5, 0.0, r), 2.0) * (0.85 + 0.15 * sin(uTime * 7.0)) + smoothstep(0.08, 0.0, r); gl_FragColor = vec4(vec3(0.87, 1.0, 0.42) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.lure = new THREE.Points(lg, this.lureMat);
    this.lure.position.set(0, 0.2, 2);
    this.scene.add(this.lure);
    this.lureTarget = new THREE.Vector3(0, 0.2, 2);

    this.snow = makeSnow({ count: 700, color: '#DDFF6B', opacity: 0.35 });
    this.scene.add(this.snow);
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.5);
  }
  update(t) {
    super.update(t);
    this.camera.position.x = state.mouse.sx * 0.8;
    this.camera.position.y = 2.8 + state.mouse.sy * 0.4;
    this.camera.lookAt(0, -1.2, 0);
    if (state.mouse.moved) {
      this.raycaster.setFromCamera(new THREE.Vector2(state.mouse.nx, state.mouse.ny), this.camera);
      const pt = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
      if (pt) this.lureTarget.set(clamp(pt.x, -7, 7), clamp(pt.y, -1.6, 3), 1.5);
    } else {
      this.lureTarget.set(Math.sin(t * 0.4) * 3, 0.2 + Math.sin(t * 0.9) * 0.4, 1.5);
    }
    this.lure.position.lerp(this.lureTarget, 0.05);
    this.lure.position.y += Math.sin(t * 2.0) * 0.004;
    this.floorMat.uniforms.uTime.value = t;
    this.floorMat.uniforms.uLure.value.set(this.lure.position.x, this.lure.position.z);
    this.floorMat.uniforms.uLureOn.value = 1;
    this.lureMat.uniforms.uTime.value = t;
    this.snow.material.uniforms.uTime.value = t;
    this.snow.material.uniforms.uScroll.value = (window.scrollY || 0) * 0.004;
  }
}
