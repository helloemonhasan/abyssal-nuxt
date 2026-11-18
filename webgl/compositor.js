import * as THREE from 'three';
import gsap from 'gsap';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld, env } from './core';
import { FS_VERT } from './glsl';

/* -------------------------------------------------------------------------
   Compositor — wipes from the current section's picture to the next one
   ------------------------------------------------------------------------- */
export class Compositor {
  constructor() {
    this.rtA = makeRT(1, true);
    this.rtB = makeRT(1, true);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tA: { value: null }, tB: { value: null }, uProgress: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(state.w, state.h) } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tA, tB; uniform float uProgress, uTime; uniform vec2 uRes; varying vec2 vUv;
        // Five columns: 1/8, 1/8, 3/8, 1/8, 2/8 of the screen width
        float columnIndex(float x){
          float i = 0.0;
          if (x > 0.125) i = 1.0;
          if (x > 0.25)  i = 2.0;
          if (x > 0.625) i = 3.0;
          if (x > 0.75)  i = 4.0;
          return i;
        }
        void main(){
          float col = columnIndex(vUv.x);
          float stagger = (col / 4.0) * 0.75 + vUv.x * 0.25;   // left columns lead, slight diagonal inside each
          float spread = 0.55;
          float local = clamp(uProgress * (1.0 + spread) - spread * stagger, 0.0, 1.0);
          float edge = local * local * (3.0 - 2.0 * local);
          float mid = 1.0 - abs(edge * 2.0 - 1.0);
          edge += sin(vUv.x * 28.0 + uTime * 2.4) * 0.012 * mid;     // a little swell on the waterline
          float aa = 1.5 / uRes.y;
          float m = 1.0 - smoothstep(edge - aa, edge + aa, vUv.y);
          vec3 a = texture2D(tA, vUv).rgb;
          vec3 b = texture2D(tB, vUv).rgb;
          vec3 c = mix(a, b, m);
          float line = exp(-pow((vUv.y - edge) * uRes.y / 2.5, 2.0)) * step(0.002, edge) * step(edge, 0.998);
          c += vec3(0.37, 0.98, 0.95) * line * 0.7;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
  }
  resize() { sizeRT(this.rtA); sizeRT(this.rtB); this.mat.uniforms.uRes.value.set(state.w, state.h); }
  render(scenes, a, b, p, t) {
    if (b === null || a === b || p <= 0.0001) return scenes[a].render(null);
    if (p >= 0.9999) return scenes[b].render(null);
    scenes[a].render(this.rtA);
    scenes[b].render(this.rtB);
    this.mat.uniforms.tA.value = this.rtA.texture;
    this.mat.uniforms.tB.value = this.rtB.texture;
    this.mat.uniforms.uProgress.value = p;
    this.mat.uniforms.uTime.value = t;
    fsPass(this.mat, null);
  }
}
