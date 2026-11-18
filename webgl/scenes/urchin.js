import * as THREE from 'three';
import gsap from 'gsap';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld, env } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { makeBackground, makeSnow, makeMatcap, BaseScene } from '../helpers';
import { sound } from '../../audio/sound';

/* -------------------------------------------------------------------------
   Scene 2 — the urchin (who we dive with): spines retract from the cursor
   ------------------------------------------------------------------------- */
export class UrchinScene extends BaseScene {
  constructor() {
    super({ top: '#053F33', bottom: '#010E0B', glow: '#2EE6A8', grain: 0.05 });
    this.tracker = $('[data-track="urchin"]');
    this.section = $('.with');
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const matcap = makeMatcap({ base: '#011A14', mid: '#1E7A62', highlight: '#E9FFF7', rim: 'rgba(166,255,224,0.9)' });
    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.52, 5),
      new THREE.ShaderMaterial({
        uniforms: { tMatcap: { value: matcap }, uTime: { value: 0 } },
        vertexShader: NOISE + /* glsl */`
          uniform float uTime; varying vec3 vNormal; varying vec3 vViewPos; varying float vBump;
          void main(){
            float b = pow(abs(snoise(position * 9.0)), 0.5) * 0.04;
            vec3 p = position + normal * b; vBump = b;
            vNormal = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(p, 1.0); vViewPos = -mv.xyz;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: MATCAP_FN + /* glsl */`
          uniform sampler2D tMatcap; varying vec3 vNormal; varying vec3 vViewPos; varying float vBump;
          void main(){
            vec3 col = texture2D(tMatcap, matcapUv(normalize(vNormal), vViewPos)).rgb * (0.6 + vBump * 10.0);
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    this.group.add(body);

    const COUNT = mqMobile() ? 260 : 460;
    const cone = new THREE.ConeGeometry(0.022, 1, 6, 1, true);
    cone.translate(0, 0.5, 0);
    const phase = new Float32Array(COUNT);
    this.spineMat = new THREE.ShaderMaterial({
      uniforms: {
        tMatcap: { value: matcap }, uTime: { value: 0 },
        uMouseDir: { value: new THREE.Vector3(0, 0, 1) }, uMouseOn: { value: 0 },
        uGlow: { value: new THREE.Color('#A6FFE0') },
      },
      vertexShader: /* glsl */`
        attribute float aPhase;
        uniform float uTime, uMouseOn; uniform vec3 uMouseDir;
        varying vec3 vNormal; varying vec3 vViewPos; varying float vNear; varying float vTip;
        void main(){
          vec3 dir = normalize((instanceMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float near = smoothstep(0.78, 0.97, dot(dir, uMouseDir)) * uMouseOn;
          float s = 1.0 - near * 0.78 + sin(uTime * 1.4 + aPhase * 6.283) * 0.05;
          vec3 p = position; p.y *= s;
          p.x += sin(uTime * 0.8 + aPhase * 12.0) * 0.04 * position.y;
          vNear = near; vTip = position.y;
          vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vViewPos = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: MATCAP_FN + /* glsl */`
        uniform sampler2D tMatcap; uniform vec3 uGlow; uniform float uTime;
        varying vec3 vNormal; varying vec3 vViewPos; varying float vNear; varying float vTip;
        void main(){
          vec3 n = normalize(vNormal); if (!gl_FrontFacing) n = -n;
          vec3 col = texture2D(tMatcap, matcapUv(n, vViewPos)).rgb;
          col += uGlow * smoothstep(0.6, 1.0, vTip) * (0.25 + vNear * 1.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.DoubleSide,
    });
    const spines = new THREE.InstancedMesh(cone, this.spineMat, COUNT);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
      d.set(Math.cos(th) * rad, y, Math.sin(th) * rad).normalize();
      q.setFromUnitVectors(up, d);
      const len = 0.55 + Math.random() * 0.5;
      m.compose(d.clone().multiplyScalar(0.48), q, new THREE.Vector3(1, len, 1));
      spines.setMatrixAt(i, m);
      phase[i] = Math.random();
    }
    cone.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    spines.frustumCulled = false;
    this.group.add(spines);

    this.snow = makeSnow({ count: 800, color: '#A6FFE0', opacity: 0.5 });
    this.scene.add(this.snow);
    this.raycaster = new THREE.Raycaster();
    this.sphere = new THREE.Sphere();
    this.on = { v: 0 };
    this.wasOn = false;
    this.hovered = false;
  }
  update(t) {
    super.update(t);
    const r = this.section.getBoundingClientRect();
    const p = clamp((state.h - r.top) / (r.height + state.h));
    const tr = trackWorld(this.tracker, this.camera);
    const s = Math.min(tr.w, tr.h) * 0.31;
    this.group.position.set(tr.x + state.mouse.sx * 0.2, tr.y + Math.sin(t * 0.7) * 0.08 + state.mouse.sy * 0.12, 0);
    this.group.scale.setScalar(s);
    this.group.rotation.set(0.3 + state.mouse.sy * 0.1, t * 0.08 + p * 2.2, 0.1);
    this.group.updateMatrixWorld();

    // Where does the cursor touch the urchin? → a direction in its local space
    let hit = false;
    if (state.started && state.mouse.moved) {
      this.raycaster.setFromCamera(new THREE.Vector2(state.mouse.nx, state.mouse.ny), this.camera);
      this.sphere.set(this.group.position, s * 1.05);
      const point = this.raycaster.ray.intersectSphere(this.sphere, new THREE.Vector3());
      if (point) {
        hit = true;
        const local = this.group.worldToLocal(point.clone()).normalize();
        this.spineMat.uniforms.uMouseDir.value.lerp(local, 0.25).normalize();
      }
    }
    this.hovered = hit;
    if (hit && !this.wasOn) sound.chime();
    this.wasOn = hit;
    this.on.v = lerp(this.on.v, hit ? 1 : 0, 0.08);
    this.spineMat.uniforms.uMouseOn.value = this.on.v;
    this.spineMat.uniforms.uTime.value = t;
    this.snow.material.uniforms.uTime.value = t;
    this.snow.material.uniforms.uScroll.value = (window.scrollY || 0) * 0.004;
    this.setGlowAt(this.group);
  }
  cursor() { return this.hovered ? 'TOUCH' : ''; }
}
