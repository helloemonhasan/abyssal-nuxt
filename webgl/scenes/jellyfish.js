import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { BEAM_FN, makeBackground, makeSnow, Bubbles, bodyGeometry, finGeometry, BaseScene } from '../helpers';
import { FishSchool } from '../fish';
import { sound } from '../../audio/sound';

export class Jellyfish {
  constructor(opts = {}) {
    this.group = new THREE.Group();
    this.rings = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0));
    this.ringIndex = 0;
    this.pulse = 0;
    this.boost = { v: 0 };

    /* Bell: a lathed profile, shaded with noise colour, fresnel rim and ripple rings */
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 0.6;
      pts.push(new THREE.Vector2(Math.sin(a) + 0.0001, Math.cos(a) * 0.82));
    }
    pts.push(new THREE.Vector2(0.9, -0.3), new THREE.Vector2(0.82, -0.33));
    const bellGeo = new THREE.LatheGeometry(pts, 96);

    this.bellUniforms = {
      uTime: { value: 0 }, uPulse: { value: 0 }, uOpacity: { value: 1 }, uBoost: { value: 0 },
      uRings: { value: this.rings }, uRingSpread: { value: 1.8 },
      uC1: { value: new THREE.Color('#1B6FA8') }, uC2: { value: new THREE.Color('#5FFBF1') },
      uC3: { value: new THREE.Color('#B26BFF') }, uC4: { value: new THREE.Color('#DDFF6B') },
      uRim: { value: new THREE.Color('#9FFFF6') }, uRingColor: { value: new THREE.Color('#DDFF6B') },
    };
    if (opts.palette) {
      ['uC1', 'uC2', 'uC3', 'uC4', 'uRim', 'uRingColor'].forEach((k, i) => { if (opts.palette[i]) this.bellUniforms[k].value.set(opts.palette[i]); });
    }
    const bellMat = new THREE.ShaderMaterial({
      uniforms: this.bellUniforms,
      vertexShader: NOISE + /* glsl */`
        uniform float uTime, uPulse, uRingSpread;
        uniform vec4 uRings[8];
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vView; varying float vRing;
        void main(){
          vec3 p = position;
          float h = clamp((0.82 - p.y) / 1.15, 0.0, 1.0);          // 0 = crown, 1 = rim
          p.xz *= 1.0 - uPulse * 0.13 * h;                          // swim contraction
          p.y *= 1.0 + uPulse * 0.05;
          float n = snoise(position * 1.7 + vec3(0.0, uTime * 0.25, 0.0));
          p += normal * n * 0.035;
          float ring = 0.0;
          for (int i = 0; i < 8; i++) {
            vec4 r = uRings[i];
            if (r.w > 0.0 && r.w < 1.0) {
              float d = distance(position, r.xyz);
              float front = r.w * uRingSpread;
              ring += exp(-pow((d - front) * 8.0, 2.0)) * (1.0 - r.w);
            }
          }
          p += normal * ring * 0.09;
          vRing = ring;
          vLocal = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: NOISE + /* glsl */`
        uniform float uTime, uOpacity, uBoost;
        uniform vec3 uC1, uC2, uC3, uC4, uRim, uRingColor;
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vView; varying float vRing;
        void main(){
          float n1 = snoise(vLocal * 2.0 + vec3(0.0, -uTime * 0.3, uTime * 0.1));
          float n2 = snoise(vLocal * 4.5 - vec3(uTime * 0.2));
          vec3 col = mix(uC1, uC2, smoothstep(-0.5, 0.7, n1));
          col = mix(col, uC3, smoothstep(0.25, 0.95, n2) * 0.75);
          float veins = pow(1.0 - abs(snoise(vLocal * vec3(3.0, 7.0, 3.0) + vec3(0.0, uTime * 0.2, 0.0))), 9.0);
          col += uC4 * veins * 0.8;
          float fres = pow(1.0 - abs(dot(normalize(vNormal), vView)), 2.0);
          col += uRim * fres * (0.9 + uBoost);
          col += uRingColor * vRing * 2.2;
          float a = (0.06 + fres * 0.55 + veins * 0.22 + vRing * 0.9 + uBoost * 0.2) * uOpacity;
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.bell = new THREE.Mesh(bellGeo, bellMat);
    this.group.add(this.bell);

    /* Glowing core */
    const coreMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.bellUniforms.uTime, uOpacity: this.bellUniforms.uOpacity, uBoost: this.bellUniforms.uBoost },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV;
        void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uOpacity, uBoost; varying vec3 vN; varying vec3 vV;
        void main(){
          float f = pow(abs(dot(normalize(vN), vV)), 2.5);
          float beat = 0.75 + 0.25 * sin(uTime * 3.2);
          vec3 col = mix(vec3(0.70, 0.42, 1.0), vec3(0.37, 0.98, 0.95), f) * (beat + uBoost);
          gl_FragColor = vec4(col, f * 0.55 * uOpacity);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), coreMat);
    core.position.y = 0.12;
    core.scale.set(1, 0.75, 1);
    this.group.add(core);

    /* Tentacles: line segments posed entirely in the vertex shader */
    const N = opts.tentacles || (mqMobile() ? 24 : 40), SEG = 64;
    const verts = N * SEG * 2;
    const aT = new Float32Array(verts), aAng = new Float32Array(verts), aSeed = new Float32Array(verts), aLen = new Float32Array(verts);
    let k = 0;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + Math.random() * 0.1;
      const seed = Math.random();
      const len = 2.0 + Math.random() * 1.6;
      for (let s = 0; s < SEG; s++) {
        for (const tt of [s / SEG, (s + 1) / SEG]) { aT[k] = tt; aAng[k] = ang; aSeed[k] = seed; aLen[k] = len; k++; }
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    tg.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    tg.setAttribute('aAng', new THREE.BufferAttribute(aAng, 1));
    tg.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    tg.setAttribute('aLen', new THREE.BufferAttribute(aLen, 1));
    const tentacleMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.bellUniforms.uTime, uPulse: this.bellUniforms.uPulse, uOpacity: this.bellUniforms.uOpacity,
        uColA: { value: new THREE.Color('#9FFFF6') }, uColB: { value: new THREE.Color('#B26BFF') },
      },
      vertexShader: /* glsl */`
        attribute float aT, aAng, aSeed, aLen;
        uniform float uTime, uPulse;
        varying float vT; varying float vSeed;
        void main(){
          float R = 0.9 * (1.0 - uPulse * 0.13);
          float t = aT;
          vec3 p = vec3(cos(aAng) * R, -0.3, sin(aAng) * R);
          p.y -= t * aLen;
          p.xz *= 1.0 - t * 0.4;
          p.x += sin(uTime * 1.2 + t * 6.0 + aSeed * 6.28) * 0.24 * t + sin(uTime * 0.7 + t * 3.0 + aSeed * 3.0) * 0.12 * t;
          p.z += cos(uTime * 1.0 + t * 5.0 + aSeed * 4.0) * 0.22 * t;
          p.y += uPulse * 0.14 * t;
          vT = t; vSeed = aSeed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColA, uColB; uniform float uTime, uOpacity;
        varying float vT; varying float vSeed;
        void main(){
          float a = pow(1.0 - vT, 1.3) * 0.8;
          float spark = smoothstep(0.93, 1.0, fract(vT * 9.0 - uTime * 0.7 + vSeed * 5.0));
          vec3 c = mix(uColA, uColB, vT) + spark * 0.9;
          gl_FragColor = vec4(c, (a + spark * a) * uOpacity);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.tentacles = new THREE.LineSegments(tg, tentacleMat);
    this.tentacles.frustumCulled = false;
    this.group.add(this.tentacles);

    /* Oral arms: four frilled ribbons */
    const armMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.bellUniforms.uTime, uOpacity: this.bellUniforms.uOpacity, uPulse: this.bellUniforms.uPulse },
      vertexShader: /* glsl */`
        uniform float uTime, uPulse; varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){
          float t = uv.x;
          vec3 p = position;
          p += normal * sin(t * 42.0 + uTime * 3.0) * 0.022 * t;
          p.x += sin(uTime * 0.9 + t * 4.0) * 0.18 * t;
          p.z += cos(uTime * 0.8 + t * 3.5) * 0.14 * t;
          p.y += uPulse * 0.1 * t;
          vT = t; vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity; varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){
          float f = pow(1.0 - abs(dot(normalize(vN), vV)), 1.5);
          vec3 c = mix(vec3(0.95, 0.6, 1.0), vec3(0.37, 0.98, 0.95), vT);
          gl_FragColor = vec4(c, f * (1.0 - vT) * 0.6 * uOpacity);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    for (let i = 0; i < (opts.arms === false ? 0 : 4); i++) {
      const a = (i / 4) * Math.PI * 2;
      const path = new THREE.LineCurve3(new THREE.Vector3(Math.cos(a) * 0.12, -0.05, Math.sin(a) * 0.12), new THREE.Vector3(Math.cos(a) * 0.3, -2.3, Math.sin(a) * 0.3));
      const arm = new THREE.Mesh(new THREE.TubeGeometry(path, 48, 0.05, 6, false), armMat);
      arm.frustumCulled = false;
      this.group.add(arm);
    }

    // Everything here also renders on layer 1 (the glow layer)
    this.group.traverse(o => o.layers.enable(1));

  }

  ping(worldPoint) {
    const local = this.bell.worldToLocal(worldPoint.clone());
    const r = this.rings[this.ringIndex];
    gsap.killTweensOf(r);
    r.set(local.x, local.y, local.z, 0.0001);
    gsap.to(r, { w: 0.9999, duration: 2.8, ease: 'power1.out', onComplete: () => { r.w = 0; } });
    this.ringIndex = (this.ringIndex + 1) % this.rings.length;
    gsap.fromTo(this.boost, { v: 1 }, { v: 0, duration: 1.6, ease: 'expo.out' });
  }

  update(t) {
    this.pulse = Math.pow(0.5 + 0.5 * Math.sin(t * 1.6), 2.0);
    this.bellUniforms.uTime.value = t;
    this.bellUniforms.uPulse.value = this.pulse;
    this.bellUniforms.uBoost.value = this.boost.v;
  }
}

export class GlowPost {
  constructor() {
    this.rtScene = makeRT(1, true);
    this.rtGlow = makeRT(0.25, true);
    this.rtA = makeRT(0.25, false);
    this.rtB = makeRT(0.25, false);
    this.trailRead = makeRT(0.25, false);
    this.trailWrite = makeRT(0.25, false);
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tMap; uniform vec2 uDir, uTexel; varying vec2 vUv;
        void main(){
          vec2 o1 = uDir * uTexel * 1.3846, o2 = uDir * uTexel * 3.2308;
          vec4 c = texture2D(tMap, vUv) * 0.2270;
          c += (texture2D(tMap, vUv + o1) + texture2D(tMap, vUv - o1)) * 0.3162;
          c += (texture2D(tMap, vUv + o2) + texture2D(tMap, vUv - o2)) * 0.0703;
          gl_FragColor = c;
        }`,
      depthTest: false, depthWrite: false,
    });
    this.trail = new THREE.ShaderMaterial({
      uniforms: { tPrev: { value: null }, tCur: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uDecay: { value: 0.9 }, uZoom: { value: 0.012 }, uMix: { value: 0.9 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tPrev, tCur; uniform vec2 uCenter; uniform float uDecay, uZoom, uMix; varying vec2 vUv;
        void main(){
          vec2 uv = uCenter + (vUv - uCenter) * (1.0 - uZoom);
          vec4 prev = texture2D(tPrev, uv) * uDecay;
          vec4 cur = texture2D(tCur, vUv) * uMix;
          gl_FragColor = max(prev, cur);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tTrail: { value: null }, tBloom: { value: null }, uIntensity: { value: 0.45 }, uBloom: { value: 0.4 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tScene, tTrail, tBloom; uniform float uIntensity, uBloom; varying vec2 vUv;
        void main(){
          vec3 s = texture2D(tScene, vUv).rgb;
          vec3 g = texture2D(tTrail, vUv).rgb * uIntensity + texture2D(tBloom, vUv).rgb * uBloom;
          gl_FragColor = vec4(1.0 - (1.0 - s) * (1.0 - clamp(g, 0.0, 1.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
  }
  resize() {
    sizeRT(this.rtScene, 1);
    [this.rtGlow, this.rtA, this.rtB, this.trailRead, this.trailWrite].forEach(rt => sizeRT(rt, 0.25));
  }
  render(scene, camera, target, center, boost) {
    renderer.setRenderTarget(this.rtScene);
    renderer.render(scene, camera);

    camera.layers.set(1);
    renderer.setRenderTarget(this.rtGlow);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setClearColor(0x021526, 1);
    camera.layers.enableAll();

    const tx = 1 / this.rtA.width, ty = 1 / this.rtA.height;
    this.blur.uniforms.uTexel.value.set(tx * 1.5, ty * 1.5);
    this.blur.uniforms.tMap.value = this.rtGlow.texture; this.blur.uniforms.uDir.value.set(1, 0); fsPass(this.blur, this.rtA);
    this.blur.uniforms.tMap.value = this.rtA.texture; this.blur.uniforms.uDir.value.set(0, 1); fsPass(this.blur, this.rtB);

    this.trail.uniforms.tPrev.value = this.trailRead.texture;
    this.trail.uniforms.tCur.value = this.rtB.texture;
    this.trail.uniforms.uCenter.value.copy(center);
    fsPass(this.trail, this.trailWrite);
    [this.trailRead, this.trailWrite] = [this.trailWrite, this.trailRead];

    this.comp.uniforms.tScene.value = this.rtScene.texture;
    this.comp.uniforms.tTrail.value = this.trailRead.texture;
    this.comp.uniforms.tBloom.value = this.rtB.texture;
    this.comp.uniforms.uIntensity.value = 0.45 + boost * 0.6;
    fsPass(this.comp, target);
  }
}
