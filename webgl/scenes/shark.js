import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { BEAM_FN, makeBackground, makeSnow, Bubbles, bodyGeometry, finGeometry, BaseScene } from '../helpers';
import { FishSchool } from '../fish';
import { sound } from '../../audio/sound';
import { creatureMaterial } from './whale';


/* -------------------------------------------------------------------------
   Scene 2 — Midnight zone: total dark, your cursor is a torch.
   A shark circles; when the beam finds it, it bolts.
   ------------------------------------------------------------------------- */
export function sharkGeometry() {
  const L = 4.2;
  const body = bodyGeometry([[0, 0.01], [0.03, 0.12], [0.1, 0.26], [0.22, 0.36], [0.36, 0.4], [0.5, 0.35], [0.65, 0.25], [0.78, 0.15], [0.88, 0.09], [1, 0.055]], L, 40, 90);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); let y = p.getY(i);
    y *= 0.9;
    if (y < 0) y *= 1 - 0.25 * smoothstep(1.0, 2.1, x);           // flatter underside of the snout
    p.setY(i, y);
  }
  body.computeVertexNormals();
  const dorsal = finGeometry(s => { s.moveTo(0.1, 0); s.quadraticCurveTo(0.12, 0.55, -0.22, 0.95); s.quadraticCurveTo(-0.24, 0.45, -0.55, 0); s.lineTo(0.1, 0); });
  dorsal.translate(0.35, 0.3, 0);
  const pecL = finGeometry(s => { s.moveTo(0, 0); s.quadraticCurveTo(0.02, -0.45, -0.5, -0.9); s.quadraticCurveTo(-0.32, -0.35, -0.4, 0); s.lineTo(0, 0); });
  pecL.rotateX(-0.95); pecL.rotateY(-0.45); pecL.translate(0.9, -0.2, 0.28);
  const pecR = pecL.clone(); pecR.scale(1, 1, -1);
  const caudal = finGeometry(s => {
    s.moveTo(0.05, 0.02);
    s.quadraticCurveTo(-0.2, 0.55, -0.8, 1.1); s.quadraticCurveTo(-0.55, 0.45, -0.46, 0.02);
    s.quadraticCurveTo(-0.58, -0.3, -0.62, -0.62); s.quadraticCurveTo(-0.22, -0.32, 0.05, -0.02);
  });
  caudal.translate(-2.02, 0.02, 0);
  const d2 = finGeometry(s => { s.moveTo(0, 0); s.lineTo(-0.08, 0.17); s.lineTo(-0.22, 0); s.lineTo(0, 0); });
  d2.translate(-1.2, 0.17, 0);
  const anal = d2.clone(); anal.scale(1, -1, 1); anal.translate(-0.05, -0.02, 0);
  return mergeGeometries([body, dorsal, pecL, pecR, caudal, d2, anal]);
}

export class SharkScene extends BaseScene {
  constructor() {
    super({ top: '#0A1A30', bottom: '#010307', glow: '#0F3C66', glowPos: [0.65, 0.5], sun: [0.5, 1.6], rays: 0.08, grain: 0.05, beamColor: '#D5F3FF' });
    this.camera.position.set(0, 0, 12);
    this.distort = 0.45;
    this.tracker = $('[data-track="shark"]');
    this.mat = creatureMaterial({ back: '#5D6B78', belly: '#E3E8EC', fog: '#020611', fogNear: 9, fogFar: 26, swim: 2.4, amp: 0.2, axis: 'z', tailX: -2.6, headX: 1.2, wave: 1.7, beam: true });
    this.shark = new THREE.Mesh(sharkGeometry(), this.mat);
    this.scene.add(this.shark);
    this.snow = makeSnow({ count: 1400, color: '#DDF3FF', opacity: 0.06 });
    this.scene.add(this.snow);
    this.angle = 0;
    this.boost = { v: 0 };
    this.lit = false;
    this.beam = new THREE.Vector2(0.65, 0.55);
    this._f = new THREE.Vector3(); this._u = new THREE.Vector3(); this._s = new THREE.Vector3(); this._m = new THREE.Matrix4();
  }
  update(t, dt) {
    super.update(t);
    const tr = trackWorld(this.tracker, this.camera);
    const sc = Math.min(tr.w, tr.h) / 5.4;
    this.angle += dt * (0.32 + this.boost.v * 1.1);
    const a = this.angle;
    const Rx = Math.max(1.4, tr.w * 0.26), Rz = 2.4;
    const cx = tr.x, cy = tr.y, cz = -1;
    const x = cx + Math.cos(a) * Rx, z = cz + Math.sin(a) * Rz, y = cy + Math.sin(a * 2) * 0.35;
    const f = this._f.set(-Math.sin(a) * Rx, Math.cos(a * 2) * 0.35, Math.cos(a) * Rz).normalize();
    const u = this._u.set(0, 1, 0).addScaledVector(f, -f.y).normalize();
    const s = this._s.crossVectors(f, u);
    this.shark.matrixAutoUpdate = false;
    this._m.makeBasis(f, u, s).scale(new THREE.Vector3(sc, sc, sc)).setPosition(x, y, z);
    this.shark.matrix.copy(this._m);
    this.shark.matrixWorldNeedsUpdate = true;
    this.mat.uniforms.uTime.value = t * (1 + this.boost.v * 1.5);

    // Torch: follows the pointer (or sweeps by itself on touch screens)
    const target = (env.finePointer && state.mouse.moved)
      ? [state.mouse.x / state.w, 1 - state.mouse.y / state.h]
      : [0.5 + Math.sin(t * 0.5) * 0.3, 0.5 + Math.cos(t * 0.37) * 0.18];
    this.beam.x = lerp(this.beam.x, target[0], 0.15);
    this.beam.y = lerp(this.beam.y, target[1], 0.15);
    const on = state.intro.v;
    this.bg.material.uniforms.uBeam.value.set(this.beam.x, this.beam.y, on);
    this.snow.material.uniforms.uBeam.value.set(this.beam.x, this.beam.y, on);
    // 3D beam: from just below the camera toward the pointer at the shark's depth
    const origin = this.camera.position.clone().add(new THREE.Vector3(0, -2.2, 0));
    this.raycaster.setFromCamera(new THREE.Vector2(this.beam.x * 2 - 1, this.beam.y * 2 - 1), this.camera);
    const aim = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -cz), new THREE.Vector3()) || new THREE.Vector3(0, 0, cz);
    this.mat.uniforms.uBeamPos.value.copy(origin);
    this.mat.uniforms.uBeamDir.value.copy(aim.sub(origin).normalize());
    this.mat.uniforms.uBeamOn.value = on;

    // Caught in the light?
    const sp = new THREE.Vector3(x, y, z).project(this.camera);
    const dx = (sp.x * 0.5 + 0.5 - this.beam.x) * state.w, dy = (sp.y * 0.5 + 0.5 - this.beam.y) * state.h;
    const lit = Math.hypot(dx, dy) < Math.max(110, sc * 70) && state.started;
    if (lit && !this.lit) { sound.shark(); gsap.fromTo(this.boost, { v: 1 }, { v: 0, duration: 2.4, ease: 'power2.out' }); }
    this.lit = lit;
    this.bg.material.uniforms.uGlowPos.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    this.snow.material.uniforms.uTime.value = t;
    this.snow.material.uniforms.uScroll.value = (window.scrollY || 0) * 0.004;
    this.camera.position.x = state.mouse.sx * 0.3;
    this.camera.lookAt(0, 0, 0);
  }
  cursor() { return 'TORCH'; }
}
