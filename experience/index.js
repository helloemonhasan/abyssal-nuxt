/* The experience: wires the WebGL stage, smooth scroll, sound and DOM interactions
   onto the markup rendered by the Vue components. Returns a destroy() function. */
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, resetState, renderer, initRenderer, disposeRenderer } from '../webgl/core';
import { Compositor } from '../webgl/compositor';
import { JellyScene, MARKERS } from '../webgl/scenes/jelly';
import { ShellScene } from '../webgl/scenes/shell';
import { UrchinScene } from '../webgl/scenes/urchin';
import { SonarScene } from '../webgl/scenes/sonar';
import { SurfaceScene } from '../webgl/scenes/surface';
import { sound } from '../audio/sound';

gsap.registerPlugin(ScrollTrigger);

export function createExperience() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  resetState();

  // Every window/document listener is removed on destroy()
  const ac = new AbortController();
  const on = (target, type, fn, opts) => target.addEventListener(type, fn, { ...(typeof opts === 'object' ? opts : {}), signal: ac.signal });

  initRenderer($('.stage'));
  if (!renderer) document.documentElement.classList.add('no-gl');
  // Section colours (also used by the no-WebGL fallback)
  $$('.sec').forEach(s => { s.style.setProperty('--sec-fg', s.dataset.fg); s.style.setProperty('--sec-bg', s.dataset.bg); });


  /* -------------------------------------------------------------------------
     Build the stage
     ------------------------------------------------------------------------- */
  let scenes = [], compositor = null;
  if (renderer) {
    scenes = [new JellyScene(), new ShellScene(), new UrchinScene(), new SonarScene(), new SurfaceScene()];
    compositor = new Compositor();
  }
  const sections = $$('.sec');
  const footer = $('.footer');

  /* -------------------------------------------------------------------------
     Smooth scroll
     ------------------------------------------------------------------------- */
  let lenis = null;
  const lenisRaf = t => { if (lenis) lenis.raf(t * 1000); };
  if (!env.reducedMotion) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(lenisRaf);
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  } else {
    document.documentElement.style.overflow = 'hidden';
  }
  function scrollToTarget(target) {
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: t => 1 - Math.pow(1 - t, 4) });
    else if (target === 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    else target.scrollIntoView({ behavior: 'smooth' });
  }

  /* -------------------------------------------------------------------------
     DOM: split text, reveals, hero claims
     ------------------------------------------------------------------------- */
  function splitWords(el) {
    const out = [];
    [...el.childNodes].forEach(node => {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { out.push(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); i.textContent = part;
          w.appendChild(i); out.push(w);
        });
      } else out.push(node.cloneNode(true));
    });
    el.textContent = '';
    out.forEach(n => el.appendChild(n));
    return $$('.w > span', el);
  }

  $$('[data-split]').forEach(el => {
    const words = splitWords(el);
    gsap.from(words, { yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.05, scrollTrigger: { trigger: el, start: 'top 88%' } });
  });
  $$('[data-reveal]').filter(el => !el.closest('.hero')).forEach(el => {
    gsap.from(el, { y: 40, autoAlpha: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%' } });
  });
  $$('.step').forEach((el, i) => {
    gsap.from(el, { y: 80, autoAlpha: 0, duration: 1.4, ease: 'expo.out', delay: (i % 4) * 0.08, scrollTrigger: { trigger: el, start: 'top 92%' } });
  });

  const claims = $$('.claim');
  gsap.set('.claim .ln > span', { yPercent: 105 });
  let claimIndex = 0;
  function showClaim(i, delay = 0) {
    gsap.fromTo($$('.ln > span', claims[i]), { yPercent: 105 }, { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.08, delay });
  }
  function hideClaim(i) {
    gsap.to($$('.ln > span', claims[i]), { yPercent: -105, duration: 0.8, ease: 'expo.in', stagger: 0.05 });
  }
  function cycleClaims() {
    hideClaim(claimIndex);
    claimIndex = (claimIndex + 1) % claims.length;
    showClaim(claimIndex, 0.55);
    gsap.delayedCall(5, cycleClaims);
  }

  /* -------------------------------------------------------------------------
     Header: theme colour, depth meter, active links
     ------------------------------------------------------------------------- */
  const root = document.documentElement;
  const depthNum = $('.depth__num');
  const shEl = $('.sh');
  const depthZone = $('.depth__zone');
  let lastFg = '', lastZone = '', lastDepth = -1;
  function updateHeader() {
    const mid = state.h * 0.5;
    let active = sections[0];
    for (const s of sections) { const r = s.getBoundingClientRect(); if (r.top <= mid) active = s; }
    const fr = footer.getBoundingClientRect();
    const fg = fr.top <= state.h * 0.15 ? footer.dataset.fg : active.dataset.fg;
    const zone = fr.top <= mid ? 'Surface' : active.dataset.zone;
    if (fg !== lastFg) { root.style.setProperty('--fg', fg); lastFg = fg; }
    shEl.classList.toggle('is-footer', fr.top < state.h - 60);
    shEl.classList.toggle('is-top', (window.scrollY || 0) < state.h * 0.25);
    if (zone !== lastZone) { depthZone.textContent = zone; lastZone = zone; }
    const max = Math.max(1, document.documentElement.scrollHeight - state.h);
    const y = window.scrollY || 0;
    const contactTop = $('.contact').offsetTop;
    // Depth climbs to the Challenger Deep, then you resurface for the contact section
    let depth = y < contactTop - state.h ? (y / Math.max(1, contactTop - state.h)) * 10994 : 10994 * (1 - clamp((y - (contactTop - state.h)) / Math.max(1, max - (contactTop - state.h))));
    depth = Math.round(clamp(depth, 0, 10994));
    if (depth !== lastDepth) { depthNum.textContent = String(depth).padStart(5, '0'); lastDepth = depth; }
  }

  /* -------------------------------------------------------------------------
     Service markers (DOM labels pinned to points on the jellyfish)
     ------------------------------------------------------------------------- */
  const markersEl = $('.markers');
  markersEl.innerHTML = MARKERS.map(m => `<div class="marker"><span class="marker__dot"></span><span class="marker__line"></span><span class="marker__label">${m}</span></div>`).join('');
  const markerEls = $$('.marker', markersEl);
  let markerWidths = [];
  function measureMarkers() { markerWidths = markerEls.map(el => el.offsetWidth); }
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
  function updateMarkers(visibility) {
    if (!scenes.length || mqMobile()) return;
    const js = scenes[0], j = js.jelly, cam = js.camera;
    const sp = js.servicesProgress;
    const center = j.bell.getWorldPosition(_c).clone().project(cam);
    const cx = (center.x * 0.5 + 0.5) * state.w;
    j.group.updateMatrixWorld();
    markerEls.forEach((el, i) => {
      const reveal = smoothstep(0.06 + i * 0.075, 0.12 + i * 0.075, sp) * (1 - smoothstep(0.9, 0.98, sp));
      _v.copy(j.anchors[i]); j.bell.localToWorld(_v);
      _n.copy(j.anchors[i]).normalize().transformDirection(j.bell.matrixWorld);
      const facing = _n.dot(_c.copy(cam.position).sub(_v).normalize());
      const op = reveal * smoothstep(0.05, 0.35, facing) * visibility;
      const p = _v.clone().project(cam);
      const x = (p.x * 0.5 + 0.5) * state.w, y = (-p.y * 0.5 + 0.5) * state.h;
      const left = x < cx;
      el.classList.toggle('is-left', left);
      const w = markerWidths[i] || 0;
      el.style.opacity = op.toFixed(3);
      el.style.transform = `translate3d(${(left ? x - w + 5 : x - 5).toFixed(1)}px, ${(y - el.offsetHeight / 2).toFixed(1)}px, 0)`;
    });
  }

  /* -------------------------------------------------------------------------
     Cursor
     ------------------------------------------------------------------------- */
  const cursorEl = $('.cursor');
  const cursorLabel = $('.cursor__label');
  const cur = { x: state.w / 2, y: state.h / 2 };
  let cursorText = '';
  if (env.finePointer) root.classList.add('has-cursor');
  let overFooter = false;
  on(document, 'pointerover', e => {
    cursorEl.classList.toggle('is-link', !!e.target.closest('a, button, input, .step'));
    overFooter = !!e.target.closest('.footer');
  });
  function updateCursor() {
    cur.x = lerp(cur.x, state.mouse.x, 0.22);
    cur.y = lerp(cur.y, state.mouse.y, 0.22);
    cursorEl.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0)`;
    let label = '';
    if (state.started && scenes.length && !overFooter && !cursorEl.classList.contains('is-link')) {
      const { cur: a, next: b, p } = state.stage;
      const s = scenes[p > 0.5 && b !== null ? sections[b].dataset.scene : sections[a].dataset.scene];
      label = s && s.cursor ? s.cursor() : '';
    }
    if (label !== cursorText) {
      cursorText = label;
      cursorEl.classList.toggle('has-label', !!label);
      if (label) cursorLabel.textContent = label;
    }
  }

  /* -------------------------------------------------------------------------
     Input
     ------------------------------------------------------------------------- */
  on(window, 'pointermove', e => {
    state.mouse.x = e.clientX; state.mouse.y = e.clientY;
    state.mouse.nx = (e.clientX / state.w) * 2 - 1;
    state.mouse.ny = -(e.clientY / state.h) * 2 + 1;
    state.mouse.moved = true;
  }, { passive: true });

  on(window, 'pointerdown', e => {
    if (!state.started) return;
    if (e.target.closest('a, button, input, form, .step, .gate')) return;
    state.mouse.x = e.clientX; state.mouse.y = e.clientY;
    state.mouse.nx = (e.clientX / state.w) * 2 - 1;
    state.mouse.ny = -(e.clientY / state.h) * 2 + 1;
    if (!scenes.length) return;
    const { cur: a, next: b, p } = state.stage;
    const idx = p > 0.5 && b !== null ? b : a;
    scenes[sections[idx].dataset.scene]?.onClick();
  });

  on(document, 'click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href');
    sound.click();
    scrollToTarget(id === '#top' ? 0 : $(id));
  });

  // Haptic sounds
  $$('[data-sfx="hover"]').forEach(el => el.addEventListener('pointerenter', () => sound.hover()));
  $$('[data-sfx="step"]').forEach(el => el.addEventListener('pointerenter', () => sound.step(+el.dataset.i)));

  // Sound toggle
  const sndBtn = $('.snd');
  sndBtn.addEventListener('click', () => {
    if (!sound.ready) sound.init();
    sound.setOn(!sound.on);
    sndBtn.setAttribute('aria-pressed', String(sound.on));
  });

  // Newsletter (no backend in this concept)
  $('.signup').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('.signup__input'), msg = $('.signup__msg');
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    msg.textContent = ok ? "You're on the list. See you at depth." : 'Please enter a valid email address.';
    if (ok) { input.value = ''; sound.chime(); }
  });

  /* -------------------------------------------------------------------------
     Gate → dive
     ------------------------------------------------------------------------- */
  const gate = $('.gate');
  gsap.set('.sh', { autoAlpha: 0 });
  gsap.set('.hero [data-reveal]', { autoAlpha: 0, y: 30 });
  gsap.set('.gline > span', { yPercent: 110 });
  gsap.to('.gline > span', { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: 0.1, delay: 0.2 });
  gsap.from('.gate__meta', { autoAlpha: 0, y: 20, duration: 1.2, ease: 'expo.out', delay: 0.7 });

  // Loading readout: fonts + first frames
  const pct = $('.gate__pct');
  const load = { v: 0 };
  gsap.to(load, { v: 70, duration: 0.9, ease: 'power2.out', onUpdate: () => { pct.textContent = Math.round(load.v); } });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    measureMarkers();
    gsap.to(load, { v: 100, duration: 0.5, onUpdate: () => { pct.textContent = Math.round(load.v); },
      onComplete: () => { $('.gate__loading').textContent = 'Cabin sealed'; } });
    ScrollTrigger.refresh();
  });

  function start() {
    if (state.started) return;
    state.started = true;
    sound.init();
    sound.setOn(true);
    sndBtn.setAttribute('aria-pressed', String(sound.on));
    sound.tone({ freq: 196, to: 98, dur: 2.2, vol: 0.12, verb: 0.9 });

    const cols = $$('.tcols i');
    const tl = gsap.timeline();
    tl.to('.gate__inner, .gate__loading', { autoAlpha: 0, y: -30, duration: 0.5, ease: 'power2.in' })
      .set(cols, { transformOrigin: 'bottom' }, 0)
      .to(cols, { scaleY: 1, duration: 0.75, ease: 'expo.inOut', stagger: 0.06 }, 0.1)
      .add(() => { gate.style.display = 'none'; })
      .set(cols, { transformOrigin: 'top' })
      .to(cols, { scaleY: 0, duration: 0.95, ease: 'expo.inOut', stagger: 0.06 })
      .add(intro, '-=0.8');
    gsap.to(state.intro, { v: 1, duration: 2.6, ease: 'expo.out', delay: 0.6 });
  }
  function intro() {
    if (lenis) lenis.start(); else document.documentElement.style.overflow = '';
    gsap.to('.sh', { autoAlpha: 1, duration: 0.4 });
    gsap.from('.logo span', { yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.05 });
    gsap.from('.sh__nav > *', { autoAlpha: 0, y: -12, duration: 1, ease: 'expo.out', stagger: 0.06, delay: 0.2 });
    gsap.from('.sh__bottom > *', { autoAlpha: 0, y: 16, duration: 1, ease: 'expo.out', stagger: 0.08, delay: 0.3 });
    gsap.to('.hero [data-reveal]', { autoAlpha: 1, y: 0, duration: 1.4, ease: 'expo.out', stagger: 0.1, delay: 0.5 });
    showClaim(0, 0.2);
    gsap.delayedCall(5.5, cycleClaims);
  }
  gate.addEventListener('click', start);
  gate.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } });
  gate.focus({ preventScroll: true });

  /* -------------------------------------------------------------------------
     Resize
     ------------------------------------------------------------------------- */
  let resizeTimer = 0;
  on(window, 'resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      state.w = innerWidth; state.h = innerHeight;
      if (renderer) {
        renderer.setSize(state.w, state.h, false);
        scenes.forEach(s => s.resize());
        compositor.resize();
      }
      measureMarkers();
      ScrollTrigger.refresh();
    }, 120);
  });

  /* -------------------------------------------------------------------------
     Frame loop
     ------------------------------------------------------------------------- */
  function computeStage() {
    let a = 0;
    for (let i = 0; i < sections.length; i++) if (sections[i].getBoundingClientRect().top <= 0.5) a = i;
    let b = null, p = 0;
    if (a < sections.length - 1) {
      b = a + 1;
      p = clamp(1 - sections[b].getBoundingClientRect().top / state.h);
    }
    state.stage.cur = a; state.stage.next = b; state.stage.p = p;
    return state.stage;
  }

  const weights = [0, 0, 0, 0, 0];
  const tick = (time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.05);
    state.time += dt;
    const t = state.time;
    const m = state.mouse;
    m.sx = lerp(m.sx, m.nx, 0.05);
    m.sy = lerp(m.sy, m.ny, 0.05);

    const st = computeStage();
    const sa = +sections[st.cur].dataset.scene;
    const sb = st.next !== null ? +sections[st.next].dataset.scene : null;

    if (renderer) {
      const active = new Set([sa]);
      if (sb !== null && st.p > 0) active.add(sb);
      active.forEach(i => scenes[i].update(t, dt));
      compositor.render(scenes, sa, sb, st.p, t);
      const jellyVis = sa === 0 ? (sb === 0 || sb === null ? 1 : 1 - st.p) : 0;
      updateMarkers(jellyVis);
    }

    weights.fill(0);
    if (sb === null || sb === sa) weights[sa] = 1;
    else { weights[sa] = 1 - st.p; weights[sb] = st.p; }
    sound.mix(weights);

    updateHeader();
    if (env.finePointer) updateCursor();
  };
  gsap.ticker.add(tick);

  return function destroy() {
    ac.abort();
    gsap.ticker.remove(tick);
    gsap.killTweensOf(cycleClaims);
    if (lenis) { gsap.ticker.remove(lenisRaf); lenis.destroy(); lenis = null; }
    ScrollTrigger.getAll().forEach(st => st.kill());
    scenes.forEach(s => s.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    }));
    disposeRenderer();
    sound.dispose();
    document.documentElement.classList.remove('has-cursor', 'no-gl');
  };
}
