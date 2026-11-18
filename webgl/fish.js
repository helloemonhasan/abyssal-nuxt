import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, renderer, fsGeo, fsPass, makeRT, sizeRT, trackWorld } from './core';

/* -------------------------------------------------------------------------
   Fish school — instanced procedural fish that flock along a path,
   scatter from the cursor and burst apart on a splash
   ------------------------------------------------------------------------- */
export function twoSidedTriangle(a, b, c) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0], 2));
  g.setIndex([0, 1, 2, 3, 4, 5]);
  return g;
}
export function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 14, 10);
  body.scale(1, 0.34, 0.13);
  const tail = twoSidedTriangle([-0.42, 0, 0], [-0.8, 0.22, 0], [-0.8, -0.22, 0]);
  const dorsal = twoSidedTriangle([0.08, 0.15, 0], [-0.16, 0.3, 0], [-0.22, 0.13, 0]);
  return mergeGeometries([body, tail, dorsal]);
}

export class FishSchool {
  constructor({ count = 360, scale = 0.22, back = '#12465E', belly = '#D7EEF2', sheen = '#9FF7FF', fog = '#1A6E8E', fogNear = 7, fogFar = 22, spread = 1, radius = 1.7 } = {}) {
    if (mqMobile()) count = Math.floor(count * 0.45);
    this.count = count;
    this.spread = spread;
    this.radius = radius;
    const geo = fishGeometry();
    const phase = new Float32Array(count), speed = new Float32Array(count);
    this.off = new Float32Array(count * 3);
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.push = new Float32Array(count * 3);
    this.head = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.spd = speed;
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.cbrt(Math.random());
      const s = Math.sqrt(1 - u * u);
      this.off[i * 3] = Math.cos(th) * s * r * 2.8;
      this.off[i * 3 + 1] = u * r * 1.0;
      this.off[i * 3 + 2] = Math.sin(th) * s * r * 1.8;
      this.size[i] = scale * (0.7 + Math.random() * 0.55);
      phase[i] = Math.random();
      speed[i] = Math.random();
      this.head[i * 3] = 1;
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speed, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uBack: { value: new THREE.Color(back) }, uBelly: { value: new THREE.Color(belly) },
        uSheen: { value: new THREE.Color(sheen) }, uFog: { value: new THREE.Color(fog) },
        uFogNear: { value: fogNear }, uFogFar: { value: fogFar },
      },
      vertexShader: /* glsl */`
        attribute float aPhase, aSpeed;
        uniform float uTime;
        varying vec3 vN; varying vec3 vLocal; varying vec3 vView; varying float vDepth; varying float vUp;
        void main(){
          vec3 p = position;
          float tailW = 1.0 - smoothstep(-0.7, 0.45, p.x);
          p.z += sin(uTime * (7.0 + aSpeed * 6.0) + aPhase * 6.283 - p.x * 5.0) * 0.17 * tailW;
          vLocal = position;
          mat3 im = mat3(instanceMatrix);
          vN = normalize(normalMatrix * im * normal);
          vUp = normalize(im * normal).y;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          vView = normalize(-mv.xyz); vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uBack, uBelly, uSheen, uFog; uniform float uFogNear, uFogFar, uTime;
        varying vec3 vN; varying vec3 vLocal; varying vec3 vView; varying float vDepth; varying float vUp;
        void main(){
          vec3 n = normalize(vN); float up = vUp; if (!gl_FrontFacing) { n = -n; up = -up; }
          float back = smoothstep(-0.05, 0.1, vLocal.y);
          vec3 col = mix(uBelly, uBack, back);
          col -= smoothstep(0.55, 0.75, sin(vLocal.x * 34.0)) * back * 0.12;
          float fres = pow(1.0 - abs(dot(n, vView)), 2.5);
          float flick = 0.5 + 0.5 * sin(uTime * 3.0 + vLocal.x * 4.0 + gl_FragCoord.x * 0.013);
          col += uSheen * fres * (0.45 + flick * 0.3);
          col += vec3(1.0, 0.97, 0.88) * pow(max(up, 0.0), 5.0) * 0.45;
          col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDepth));
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.first = true;
    this._m = new THREE.Matrix4();
    this._f = new THREE.Vector3(); this._u = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    this.center = new THREE.Vector3();
  }
  scatter(point, radius, strength) {
    for (let i = 0; i < this.count; i++) {
      const dx = this.pos[i * 3] - point.x, dy = this.pos[i * 3 + 1] - point.y, dz = this.pos[i * 3 + 2] - point.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4;
      if (d < radius) {
        const f = (radius - d) / radius * strength;
        this.push[i * 3] += dx / d * f * 2.4; this.push[i * 3 + 1] += dy / d * f * 2.4; this.push[i * 3 + 2] += dz / d * f * 2.4;
      }
    }
  }
  update(t, dt, cursor, pathFn) {
    const C = pathFn(t, this.center);
    const k = 1 - Math.exp(-dt * 2.4);
    const decay = Math.exp(-dt * 1.6);
    const R = this.radius, R2 = R * R;
    const m = this._m, f = this._f, u = this._u, s = this._s;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const a = t * (0.25 + 0.25 * this.spd[i]);
      const ca = Math.cos(a), sa = Math.sin(a);
      const ox = this.off[i3], oy = this.off[i3 + 1], oz = this.off[i3 + 2];
      let tx = C.x + (ox * ca - oz * sa) * this.spread;
      let ty = C.y + oy * this.spread + Math.sin(t * 1.3 + i) * 0.1;
      let tz = C.z + (ox * sa + oz * ca) * this.spread;
      if (cursor) {
        const dx = this.pos[i3] - cursor.x, dy = this.pos[i3 + 1] - cursor.y, dz = this.pos[i3 + 2] - cursor.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R2) {
          const d = Math.sqrt(d2) + 1e-4, q = (R - d) / R;
          this.push[i3] += dx / d * q * 0.16; this.push[i3 + 1] += dy / d * q * 0.16; this.push[i3 + 2] += dz / d * q * 0.1;
        }
      }
      this.push[i3] *= decay; this.push[i3 + 1] *= decay; this.push[i3 + 2] *= decay;
      tx += this.push[i3]; ty += this.push[i3 + 1]; tz += this.push[i3 + 2];
      if (this.first) { this.pos[i3] = tx; this.pos[i3 + 1] = ty; this.pos[i3 + 2] = tz; }
      const nx = this.pos[i3] + (tx - this.pos[i3]) * k;
      const ny = this.pos[i3 + 1] + (ty - this.pos[i3 + 1]) * k;
      const nz = this.pos[i3 + 2] + (tz - this.pos[i3 + 2]) * k;
      const vx = nx - this.pos[i3], vy = ny - this.pos[i3 + 1], vz = nz - this.pos[i3 + 2];
      this.pos[i3] = nx; this.pos[i3 + 1] = ny; this.pos[i3 + 2] = nz;
      // heading eases toward the velocity, kept fairly level so fish stay upright
      const vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (vl > 1e-5) {
        const e = 0.12;
        this.head[i3] += (vx / vl - this.head[i3]) * e;
        this.head[i3 + 1] += (clamp(vy / vl, -0.5, 0.5) - this.head[i3 + 1]) * e;
        this.head[i3 + 2] += (vz / vl - this.head[i3 + 2]) * e;
      }
      f.set(this.head[i3], this.head[i3 + 1], this.head[i3 + 2]).normalize();
      u.copy(this._up).addScaledVector(f, -f.y).normalize();
      s.crossVectors(f, u);
      m.makeBasis(f, u, s);
      const sz = this.size[i];
      m.scale(this._s.set(sz, sz, sz));
      m.setPosition(nx, ny, nz);
      this.mesh.setMatrixAt(i, m);
    }
    this.first = false;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.material.uniforms.uTime.value = t;
  }
}
