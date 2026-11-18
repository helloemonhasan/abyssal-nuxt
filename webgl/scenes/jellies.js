import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld } from '../core';
import { NOISE, FS_VERT, MATCAP_FN } from '../glsl';
import { BEAM_FN, makeBackground, makeSnow, Bubbles, bodyGeometry, finGeometry, BaseScene } from '../helpers';
import { FishSchool } from '../fish';
import { sound } from '../../audio/sound';
import { Jellyfish, GlowPost } from './jellyfish';


/* -------------------------------------------------------------------------
   Scene 3 — Abyssal zone: a swarm of bioluminescent jellyfish.
   Click any of them to send a ping through its bell.
   ------------------------------------------------------------------------- */
export const JELLY_PALETTES = [
  ['#7A3FD1', '#F3A6FF', '#5FFBF1', '#FFE38A', '#FFC9FF', '#FFE38A'],
  ['#155E9E', '#7FF5FF', '#B26BFF', '#DDFF6B', '#C8FFFB', '#DDFF6B'],
  ['#8A2D6E', '#FF9ED8', '#FFD27F', '#7FF5FF', '#FFD6F1', '#7FF5FF'],
  ['#1B6FA8', '#5FFBF1', '#B26BFF', '#DDFF6B', '#9FFFF6', '#DDFF6B'],
  ['#5A3DC8', '#C9B6FF', '#7FF5FF', '#FFE38A', '#E6DBFF', '#FFE38A'],
];

export class JelliesScene extends BaseScene {
  constructor() {
    super({ top: '#0B1A33', bottom: '#020309', glow: '#7A3FD1', glowPos: [0.35, 0.5], sun: [0.5, 1.5], rays: 0.1, grain: 0.05 });
    this.distort = 0.5;
    this.tracker = $('[data-track="jelly"]');
    this.main = new Jellyfish({ palette: JELLY_PALETTES[0] });
    this.scene.add(this.main.group);
    const homes = [[-5.2, 1.5, -4], [3.8, -1.0, -5], [5.6, 2.4, -7], [-2.4, -2.6, -6], [1.2, 3.2, -8]];
    const n = mqMobile() ? 3 : homes.length;
    this.others = homes.slice(0, n).map((h, i) => {
      const j = new Jellyfish({ tentacles: 18, arms: i % 2 === 0, palette: JELLY_PALETTES[(i + 1) % JELLY_PALETTES.length] });
      j.home = new THREE.Vector3(...h);
      j.s = 0.32 + (i % 3) * 0.1;
      j.rise = 0.12 + (i % 4) * 0.04;
      j.offset = i * 2.3;
      this.scene.add(j.group);
      return j;
    });
    this.all = [this.main, ...this.others];
    this.snow = makeSnow({ count: 1000, color: '#E8D6FF', opacity: 0.45 });
    this.scene.add(this.snow);
    this.post = new GlowPost();
    this.center = new THREE.Vector2(0.5, 0.5);
    this.hovered = null;
    this.hit = null;
  }
  resize() { super.resize(); this.post.resize(); }
  update(t, dt) {
    super.update(t);
    const tr = trackWorld(this.tracker, this.camera);
    const vH = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z;
    const sc = (Math.min(tr.h, vH * 0.66) / 4.3) * lerp(0.7, 1, state.intro.v);
    const j = this.main;
    j.update(t);
    j.group.scale.setScalar(sc);
    j.group.position.set(tr.x + state.mouse.sx * 0.25, tr.y + 1.25 * sc + Math.sin(t * 0.8) * 0.08 * sc + j.pulse * 0.05 * sc, 0);
    j.group.rotation.set(0.12 + state.mouse.sy * 0.15, t * 0.12, -state.mouse.sx * 0.1 + Math.sin(t * 0.4) * 0.05);
    this.others.forEach((o, i) => {
      o.update(t * (0.85 + i * 0.07) + o.offset);
      const span = 14;
      const y = ((o.home.y + t * o.rise + span / 2) % span + span) % span - span / 2;
      o.group.position.set(o.home.x + Math.sin(t * 0.2 + i) * 0.5, y, o.home.z);
      o.group.scale.setScalar(o.s);
      o.group.rotation.set(0.15, t * 0.1 + i, Math.sin(t * 0.3 + i) * 0.1);
    });
    this.snow.material.uniforms.uTime.value = t;
    this.snow.material.uniforms.uScroll.value = (window.scrollY || 0) * 0.004;
    this.setGlowAt(j.bell);
    const v = j.bell.getWorldPosition(new THREE.Vector3()).project(this.camera);
    this.center.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    this.hovered = null; this.hit = null;
    if (state.started && state.mouse.moved) {
      this.raycaster.setFromCamera(new THREE.Vector2(state.mouse.nx, state.mouse.ny), this.camera);
      for (const jj of this.all) {
        const h = this.raycaster.intersectObject(jj.bell, false)[0];
        if (h && (!this.hit || h.distance < this.hit.distance)) { this.hit = h; this.hovered = jj; }
      }
    }
  }
  render(target) { this.post.render(this.scene, this.camera, target, this.center, this.main.boost.v); }
  onClick() {
    if (!this.hovered) {
      this.raycaster.setFromCamera(new THREE.Vector2(state.mouse.nx, state.mouse.ny), this.camera);
      for (const jj of this.all) {
        const h = this.raycaster.intersectObject(jj.bell, false)[0];
        if (h) { this.hovered = jj; this.hit = h; break; }
      }
    }
    if (!this.hovered) return false;
    this.hovered.ping(this.hit.point);
    sound.ping();
    return true;
  }
  cursor() { return this.hovered ? 'PING' : ''; }
}
