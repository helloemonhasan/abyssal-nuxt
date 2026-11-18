import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld } from './core';
import { NOISE, FS_VERT } from './glsl';

/* -------------------------------------------------------------------------
   Compositor — renders the current section's scene (or wipes between two),
   then puts everything through an underwater lens: a gentle wobble,
   click ripples, chromatic fringing, vignette and grain
   ------------------------------------------------------------------------- */
export class Compositor {
  constructor() {
    this.rtA = makeRT(1, true);
    this.rtB = makeRT(1, true);
    this.rtC = makeRT(1, false);
    this.wipe = new THREE.ShaderMaterial({
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
          float stagger = (col / 4.0) * 0.75 + vUv.x * 0.25;
          float spread = 0.55;
          float local = clamp(uProgress * (1.0 + spread) - spread * stagger, 0.0, 1.0);
          float edge = local * local * (3.0 - 2.0 * local);
          float mid = 1.0 - abs(edge * 2.0 - 1.0);
          edge += sin(vUv.x * 28.0 + uTime * 2.4) * 0.012 * mid;
          float aa = 1.5 / uRes.y;
          float m = 1.0 - smoothstep(edge - aa, edge + aa, vUv.y);
          vec3 c = mix(texture2D(tA, vUv).rgb, texture2D(tB, vUv).rgb, m);
          float line = exp(-pow((vUv.y - edge) * uRes.y / 2.5, 2.0)) * step(0.002, edge) * step(edge, 0.998);
          c += vec3(0.5, 0.97, 1.0) * line * 0.7;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.ripples = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -10, 0));
    this.ri = 0;
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tMap: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(state.w, state.h) },
        uDistort: { value: 0.5 }, uCA: { value: 0.014 }, uRipples: { value: this.ripples },
      },
      vertexShader: FS_VERT,
      fragmentShader: NOISE + /* glsl */`
        uniform sampler2D tMap; uniform float uTime, uDistort, uCA; uniform vec2 uRes; uniform vec4 uRipples[6];
        varying vec2 vUv;
        void main(){
          vec2 uv = vUv; float asp = uRes.x / uRes.y; vec2 A = vec2(asp, 1.0);
          vec2 w = vec2(snoise(vec3(uv * A * 2.2, uTime * 0.22)), snoise(vec3(uv * A * 2.2 + 7.0, uTime * 0.22)));
          uv += w * 0.0028 * uDistort;
          float ring = 0.0;
          for (int i = 0; i < 6; i++) {
            vec4 r = uRipples[i];
            float age = uTime - r.z;
            if (r.w > 0.0 && age > 0.0 && age < 2.6) {
              vec2 d = (uv - r.xy) * A;
              float dist = length(d);
              float front = age * 0.42;
              float k = exp(-pow((dist - front) * 13.0, 2.0)) * (1.0 - age / 2.6) * r.w;
              uv -= (d / (dist + 1e-4)) / A * k * 0.022;
              ring += k;
            }
          }
          vec2 dc = uv - 0.5; float e = dot(dc, dc);
          vec3 col;
          col.r = texture2D(tMap, uv + dc * e * uCA).r;
          col.g = texture2D(tMap, uv).g;
          col.b = texture2D(tMap, uv - dc * e * uCA).b;
          col += vec3(0.85, 0.98, 1.0) * ring * 0.08;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
  }
  ripple(u, v, strength = 1) {
    this.ripples[this.ri].set(u, v, state.time, strength);
    this.ri = (this.ri + 1) % this.ripples.length;
  }
  resize() {
    sizeRT(this.rtA); sizeRT(this.rtB); sizeRT(this.rtC);
    this.wipe.uniforms.uRes.value.set(state.w, state.h);
    this.post.uniforms.uRes.value.set(state.w, state.h);
  }
  render(scenes, a, b, p, t) {
    let src, distort;
    if (b === null || a === b || p <= 0.0001) { scenes[a].render(this.rtA); src = this.rtA; distort = scenes[a].distort; }
    else if (p >= 0.9999) { scenes[b].render(this.rtA); src = this.rtA; distort = scenes[b].distort; }
    else {
      scenes[a].render(this.rtA);
      scenes[b].render(this.rtB);
      this.wipe.uniforms.tA.value = this.rtA.texture;
      this.wipe.uniforms.tB.value = this.rtB.texture;
      this.wipe.uniforms.uProgress.value = p;
      this.wipe.uniforms.uTime.value = t;
      fsPass(this.wipe, this.rtC);
      src = this.rtC;
      distort = lerp(scenes[a].distort, scenes[b].distort, p);
    }
    this.post.uniforms.tMap.value = src.texture;
    this.post.uniforms.uTime.value = t;
    this.post.uniforms.uDistort.value = distort;
    fsPass(this.post, null);
  }
}
