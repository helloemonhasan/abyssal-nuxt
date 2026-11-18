import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { BEAM_FN, makeBackground, makeSnow, Bubbles, bodyGeometry, finGeometry, BaseScene } from '../helpers';
import { FishSchool } from '../fish';
import { sound } from '../../audio/sound';


/* -------------------------------------------------------------------------
   Scene 0 — Sunlight zone (hero): surface shimmer, god rays, a fish school,
   bubbles. Move to scatter the school, click to splash.
   ------------------------------------------------------------------------- */
export class SunlightScene extends BaseScene {
  constructor() {
    super({ top: '#2490B5', bottom: '#052C45', glow: '#7FE9FF', glowPos: [0.7, 0.55], sun: [0.74, 1.14], sunColor: '#FFF4D6', rays: 0.62, surface: 0.55, caustic: 0.06, grain: 0.035 });
    this.distort = 1.0;
    this.fish = new FishSchool({ count: 420, scale: 0.2, back: '#0F4A63', belly: '#D9EFF3', sheen: '#A6F8FF', fog: '#1E7595', fogNear: 7, fogFar: 21 });
    this.scene.add(this.fish.mesh);
    this.bubbles = new Bubbles({ count: 220 });
    this.scene.add(this.bubbles.points);
    this.snow = makeSnow({ count: 650, color: '#E8FFFF', opacity: 0.32 });
    this.scene.add(this.snow);
    this.cursorPt = null;
    this.sunBase = 0.74;
  }
  path(t, out) {
    return out.set(2.3 + Math.sin(t * 0.11) * 2.5, -0.2 + Math.sin(t * 0.17) * 0.9, -1.2 + Math.cos(t * 0.13) * 1.6);
  }
  update(t, dt) {
    super.update(t);
    this.camera.position.x = state.mouse.sx * 0.45;
    this.camera.position.y = state.mouse.sy * 0.3;
    this.camera.lookAt(0, 0, 0);
    const u = this.bg.material.uniforms;
    u.uSun.value.x = this.sunBase + state.mouse.sx * 0.05;
    this.cursorPt = (state.started && state.mouse.moved) ? this.mouseWorld(this.fish.center.z) : null;
    this.fish.update(t, dt, this.cursorPt, (tt, out) => this.path(tt, out));
    this.bubbles.update(t, dt, this.camera, 3);
    this.snow.material.uniforms.uTime.value = t;
    this.snow.material.uniforms.uScroll.value = (window.scrollY || 0) * 0.004;
  }
  onClick() {
    const p = this.mouseWorld(this.fish.center.z);
    if (!p) return false;
    this.fish.scatter(p, 3.4, 1);
    this.bubbles.spawn(p.x, p.y, p.z, 40, 0.6);
    sound.splash();
    return 'ripple';
  }
  cursor() { return 'SPLASH'; }
}
