import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { BEAM_FN, makeBackground, makeSnow, Bubbles, bodyGeometry, finGeometry, BaseScene } from '../helpers';
import { FishSchool } from '../fish';
import { sound } from '../../audio/sound';


/* -------------------------------------------------------------------------
   Scene 5 — Resurfacing (contact): looking up at the sunlit surface.
   Click the water to release bubbles.
   ------------------------------------------------------------------------- */
export class ResurfaceScene extends BaseScene {
  constructor() {
    super({ top: '#A3DCE7', bottom: '#3B93B2', glow: '#FFFFFF', glowPos: [0.5, 0.98], sun: [0.5, 1.12], sunColor: '#F4FDFF', rays: 0.3, surface: 0.32, caustic: 0.06, grain: 0.03 });
    this.distort = 1.15;
    this.bubbles = new Bubbles({ count: 340, light: true });
    this.scene.add(this.bubbles.points);
    this.fish = new FishSchool({ count: 150, scale: 0.17, back: '#1E6178', belly: '#EAF8FA', sheen: '#FFFFFF', fog: '#9AD8E6', fogNear: 6, fogFar: 19, radius: 1.5 });
    this.scene.add(this.fish.mesh);
  }
  path(t, out) { return out.set(Math.sin(t * 0.09) * 4.6, 2.0 + Math.sin(t * 0.2) * 0.4, -2.2 + Math.cos(t * 0.12) * 1.0); }
  update(t, dt) {
    super.update(t);
    this.camera.position.x = state.mouse.sx * 0.3;
    this.camera.position.y = state.mouse.sy * 0.2;
    this.camera.lookAt(0, 0.3, 0);
    const cursor = (state.started && state.mouse.moved) ? this.mouseWorld(this.fish.center.z) : null;
    this.fish.update(t, dt, cursor, (tt, out) => this.path(tt, out));
    this.bubbles.update(t, dt, this.camera, 8);
  }
  onClick() {
    const p = this.mouseWorld(0);
    if (!p) return false;
    this.bubbles.spawn(p.x, p.y, 0, 34, 0.6);
    const q = this.mouseWorld(this.fish.center.z);
    if (q) this.fish.scatter(q, 3, 1);
    sound.bubbles();
    return 'ripple';
  }
  cursor() { return 'BUBBLES'; }
}
