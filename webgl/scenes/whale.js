import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { BEAM_FN, makeBackground, makeSnow, Bubbles, bodyGeometry, finGeometry, BaseScene } from '../helpers';
import { FishSchool } from '../fish';
import { sound } from '../../audio/sound';


/* -------------------------------------------------------------------------
   Scene 1 — Twilight zone: a blue whale and her calf glide across while
   the section is pinned. Service labels ride along the whale's body.
   ------------------------------------------------------------------------- */
export function whaleGeometry() {
  const L = 6;
  const body = bodyGeometry([[0, 0.03], [0.02, 0.2], [0.06, 0.34], [0.13, 0.44], [0.24, 0.5], [0.36, 0.5], [0.5, 0.44], [0.63, 0.34], [0.75, 0.22], [0.85, 0.13], [0.93, 0.08], [1, 0.05]], L, 48, 110);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); let y = p.getY(i);
    y *= 0.84;
    if (y > 0) y *= 1 - 0.28 * smoothstep(1.4, 3.0, x);          // flat, broad head
    if (y < 0) y *= 1 + 0.12 * smoothstep(0.6, 2.4, x);          // throat bulge
    p.setY(i, y);
  }
  body.computeVertexNormals();

  const pecL = finGeometry(s => { s.moveTo(0, 0); s.quadraticCurveTo(0.22, -0.65, 0.1, -1.55); s.lineTo(0, -1.6); s.quadraticCurveTo(-0.12, -0.75, -0.24, -0.05); s.lineTo(0, 0); });
  pecL.rotateX(-1.0); pecL.rotateY(-0.45); pecL.translate(1.45, -0.22, 0.38);
  const pecR = pecL.clone(); pecR.scale(1, 1, -1);
  const dorsal = finGeometry(s => { s.moveTo(0, 0); s.quadraticCurveTo(-0.12, 0.14, -0.32, 0.22); s.lineTo(-0.36, 0.17); s.quadraticCurveTo(-0.34, 0.05, -0.42, 0); s.lineTo(0, 0); });
  dorsal.translate(-1.35, 0.33, 0);
  const fluke = finGeometry(s => {
    s.moveTo(0.05, 0);
    s.quadraticCurveTo(-0.25, 0.45, -0.95, 1.0); s.lineTo(-0.82, 0.42); s.quadraticCurveTo(-0.7, 0.12, -0.64, 0);
    s.quadraticCurveTo(-0.7, -0.12, -0.82, -0.42); s.lineTo(-0.95, -1.0); s.quadraticCurveTo(-0.25, -0.45, 0.05, 0);
  });
  fluke.rotateX(-Math.PI / 2); fluke.translate(-2.92, 0, 0);
  return mergeGeometries([body, pecL, pecR, dorsal, fluke]);
}

export function creatureMaterial({ back, belly, fog, fogNear, fogFar, sun = '#DDF6FF', swim = 1.1, amp = 0.32, axis = 'y', tailX = -3.1, headX = 1.0, wave = 0.9, caustic = 0.35, pleats = 0, beam = false }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uBack: { value: new THREE.Color(back) }, uBelly: { value: new THREE.Color(belly) },
      uFog: { value: new THREE.Color(fog) }, uFogNear: { value: fogNear }, uFogFar: { value: fogFar },
      uSunColor: { value: new THREE.Color(sun) }, uCaustic: { value: caustic }, uPleats: { value: pleats },
      uBeamPos: { value: new THREE.Vector3() }, uBeamDir: { value: new THREE.Vector3(0, 0, -1) }, uBeamOn: { value: 0 },
      uRim: { value: new THREE.Color('#5FD7FF') }, uAmbient: { value: beam ? 0.03 : 0.45 },
    },
    defines: { AXIS_Y: axis === 'y' ? 1 : 0, USE_BEAM: beam ? 1 : 0 },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vWN; varying vec3 vWorld; varying vec3 vView; varying float vDepth;
      void main(){
        vec3 p = position;
        float w = 1.0 - smoothstep(${tailX.toFixed(2)}, ${headX.toFixed(2)}, p.x);
        float s = sin(uTime * ${swim.toFixed(2)} - p.x * ${wave.toFixed(2)}) * ${amp.toFixed(3)} * w * w;
        #if AXIS_Y
          p.y += s;
        #else
          p.z += s;
        #endif
        vLocal = position;
        vN = normalize(normalMatrix * normal);
        vWN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(p, 1.0); vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp; vView = normalize(-mv.xyz); vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: NOISE + /* glsl */`
      uniform vec3 uBack, uBelly, uFog, uSunColor, uBeamPos, uBeamDir, uRim;
      uniform float uTime, uFogNear, uFogFar, uCaustic, uPleats, uBeamOn, uAmbient;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vWN; varying vec3 vWorld; varying vec3 vView; varying float vDepth;
      void main(){
        vec3 n = normalize(vN); vec3 wn = normalize(vWN);
        if (!gl_FrontFacing) { n = -n; wn = -wn; }
        float back = smoothstep(-0.16, 0.1, vLocal.y + sin(vLocal.x * 3.0) * 0.03);
        vec3 alb = mix(uBelly, uBack, back);
        float mott = snoise(vLocal * vec3(2.2, 6.0, 6.0)) * 0.5 + 0.5;
        alb *= 0.82 + mott * 0.3;
        float pleat = smoothstep(0.35, 0.65, sin(vLocal.z * 46.0)) * (1.0 - back) * smoothstep(0.3, 1.6, vLocal.x) * uPleats;
        alb *= 1.0 - pleat * 0.22;
        vec3 col;
        #if USE_BEAM
          vec3 L = vWorld - uBeamPos; float dist = length(L); vec3 ld = L / dist;
          float cone = smoothstep(0.94, 0.985, dot(ld, uBeamDir));
          float diff = max(dot(wn, -ld), 0.0);
          float att = 1.0 / (1.0 + dist * dist * 0.01);
          col = alb * (uAmbient + cone * diff * att * 2.6 * uBeamOn);
          float fres = pow(1.0 - abs(dot(n, vView)), 3.0);
          col += uRim * fres * 0.16;
          col += vec3(1.0) * pow(max(dot(reflect(ld, wn), vView), 0.0), 24.0) * cone * uBeamOn * 0.6;
          col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDepth) * 0.85);
        #else
          float diff = max(dot(wn, normalize(vec3(0.2, 1.0, 0.3))), 0.0);
          col = alb * (uAmbient + diff * 0.7);
          float c = pow(1.0 - abs(snoise(vec3(vWorld.xz * 1.1, uTime * 0.25))), 6.0);
          col += uSunColor * c * uCaustic * max(wn.y, 0.0);
          float fres = pow(1.0 - abs(dot(n, vView)), 3.0);
          col += uSunColor * fres * 0.16;
          col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDepth));
        #endif
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

export const WHALE_LABELS = ['Bioluminescence', 'Hydrothermal vents', 'Trench mapping', 'Marine acoustics', 'Deep-sea film', 'Species discovery', 'Ocean data &amp; AI'];
export const WHALE_ANCHORS = [[2.75, 0.12, 0], [1.9, 0.3, 0.2], [1.3, -0.45, 0.4], [0.4, 0.42, 0.15], [-0.5, -0.38, 0.2], [-1.45, 0.42, 0], [-3.3, 0, 0.7]];
/* up or down from the body, and how long the leader line is (rem) */
export const WHALE_LAYOUT = [[0, 12], [0, 4.5], [1, 5], [0, 17], [1, 12], [0, 6], [1, 6]];

export class WhaleScene extends BaseScene {
  constructor() {
    super({ top: '#0F5A79', bottom: '#021A2B', glow: '#2E9CBF', glowPos: [0.5, 0.45], sun: [0.45, 1.3], sunColor: '#DDF6FF', rays: 0.5, surface: 0.15, caustic: 0.02, grain: 0.04 });
    this.camera.position.set(0, 0, 14);
    this.distort = 0.6;
    this.section = $('.services');
    const geo = whaleGeometry();
    const opts = { back: '#2B4A5F', belly: '#9FB3BD', fog: '#0B3F58', fogNear: 11, fogFar: 34, swim: 1.1, amp: 0.32, axis: 'y', pleats: 1 };
    this.mat = creatureMaterial(opts);
    this.calfMat = creatureMaterial({ ...opts, swim: 1.6 });
    this.whale = new THREE.Mesh(geo, this.mat);
    this.calf = new THREE.Mesh(geo, this.calfMat);
    this.group = new THREE.Group(); this.group.add(this.whale);
    this.calfGroup = new THREE.Group(); this.calfGroup.add(this.calf);
    this.scene.add(this.group, this.calfGroup);
    this.snow = makeSnow({ count: 900, color: '#D8F6FF', opacity: 0.55 });
    this.scene.add(this.snow);
    this.anchors = WHALE_ANCHORS.map(a => new THREE.Vector3(...a));
    this.sp = 0;
    this.called = false;
  }
  update(t) {
    super.update(t);
    const s = this.section.getBoundingClientRect();
    const sp = clamp(-s.top / Math.max(1, s.height - state.h));
    this.sp = sp;
    const sc = mqMobile() ? 0.9 : 1.55;
    const x = lerp(13.5, -13.5, sp);
    this.group.position.set(x, -0.9 + Math.sin(t * 0.3) * 0.25, 0);
    this.group.scale.setScalar(sc);
    this.group.rotation.set(state.mouse.sy * 0.08, Math.PI + state.mouse.sx * 0.1, Math.sin(t * 0.3) * 0.05);
    this.calfGroup.position.set(x + 3.6 + Math.sin(t * 0.5) * 0.3, 0.9 + Math.sin(t * 0.45) * 0.3, -1.5);
    this.calfGroup.scale.setScalar(sc * 0.45);
    this.calfGroup.rotation.set(0, Math.PI + 0.08, Math.sin(t * 0.5) * 0.08);
    this.mat.uniforms.uTime.value = t;
    this.calfMat.uniforms.uTime.value = t + 1.3;
    this.camera.position.x = state.mouse.sx * 0.5;
    this.camera.position.y = state.mouse.sy * 0.3;
    this.camera.lookAt(0, -0.3, 0);
    this.snow.material.uniforms.uTime.value = t;
    this.snow.material.uniforms.uScroll.value = (window.scrollY || 0) * 0.004;
    this.setGlowAt(this.group);
    if (!this.called && sp > 0.28) { this.called = true; sound.whale(); }
    if (sp < 0.05) this.called = false;
  }
}
