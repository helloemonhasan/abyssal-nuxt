/* The experience: wires the WebGL stage, smooth scroll, sound and DOM interactions
   onto the markup rendered by the Vue components. Returns a destroy() function. */
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { $, $$, clamp, lerp, smoothstep, mqMobile, state, env, resetState, renderer, initRenderer, disposeRenderer } from '../webgl/core';
import { Compositor } from '../webgl/compositor';
import { SunlightScene } from '../webgl/scenes/sunlight';
import { WhaleScene, WHALE_LABELS, WHALE_LAYOUT } from '../webgl/scenes/whale';
import { SharkScene } from '../webgl/scenes/shark';
import { JelliesScene } from '../webgl/scenes/jellies';
import { SonarScene } from '../webgl/scenes/sonar';
import { ResurfaceScene } from '../webgl/scenes/resurface';
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
    scenes = [new SunlightScene(), new WhaleScene(), new SharkScene(), new JelliesScene(), new SonarScene(), new ResurfaceScene()];
    compositor = new Compositor();
  }
  const sections = $$('.sec');
  const footer = $('.footer');
  const root = document.documentElement;

  /* -------------------------------------------------------------------------
     Smooth scroll
     ------------------------------------------------------------------------- */
  let lenis = null;
  const lenisRaf = t => { if (lenis) lenis.raf(t * 1000); };
  if (!env.reducedMotion) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.9 });
    lenis.on('scroll', e => { ScrollTrigger.update(); state.scrollV = e.velocity || 0; });
    gsap.ticker.add(lenisRaf);
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  } else {
    root.style.overflow = 'hidden';
  }
  function scrollToTarget(target) {
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: t => 1 - Math.pow(1 - t, 4) });
    else if (target === 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    else target.scrollIntoView({ behavior: 'smooth' });
  }

  /* -------------------------------------------------------------------------
     Split text and reveals
     ------------------------------------------------------------------------- */
  function splitWords(el) {
    const walk = (node, into) => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { into.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w';
            const i = document.createElement('span'); i.textContent = part;
            w.appendChild(i); into.appendChild(w);
          });
        } else if (child.nodeName === 'BR') {
          into.appendChild(document.createElement('br'));
        } else {
          const clone = child.cloneNode(false);
          walk(child, clone);
          into.appendChild(clone);
        }
      });
    };
    const frag = document.createDocumentFragment();
    walk(el, frag);
    el.textContent = '';
    el.appendChild(frag);
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
    gsap.delayedCall(5.5, cycleClaims);
  }

  /* -------------------------------------------------------------------------
     Instruments: theme colour, depth readout, depth rail, live timecode
     ------------------------------------------------------------------------- */
  const shEl = $('.sh');
  const depthNum = $('.depth__num'), depthZone = $('.depth__zone'), tempEl = $('.temp'), presEl = $('.pres');
  const tcEl = $('.tc');
  const railTicks = $('.rail__ticks');
  const MAX_DEPTH = 10994, RAIL_K = 0.06;   // px per metre at a 1920 artboard
  (function buildRail() {
    let html = '';
    for (let d = 0; d <= 11000; d += 250) {
      const major = d % 1000 === 0;
      html += `<i class="rail__tick${major ? ' is-major' : ''}" style="top:${(d * RAIL_K).toFixed(1)}rem">${major ? `<span>${d === 0 ? '0 m' : d / 1000 + ' km'}</span>` : ''}</i>`;
    }
    railTicks.innerHTML = html;
  })();
  let lastFg = '', lastZone = '', lastDepth = -1;
  const contactEl = $('.contact');
  function updateInstruments() {
    const mid = state.h * 0.5;
    let active = sections[0];
    for (const s of sections) { const r = s.getBoundingClientRect(); if (r.top <= mid) active = s; }
    const fr = footer.getBoundingClientRect();
    const fg = fr.top <= state.h * 0.15 ? footer.dataset.fg : active.dataset.fg;
    const zone = fr.top <= mid ? 'Surface' : active.dataset.zone;
    if (fg !== lastFg) { root.style.setProperty('--fg', fg); lastFg = fg; }
    if (zone !== lastZone) { depthZone.textContent = zone; lastZone = zone; }
    shEl.classList.toggle('is-footer', fr.top < state.h - 60);
    shEl.classList.toggle('is-light', fg === '#03263A');
    shEl.classList.toggle('is-top', (window.scrollY || 0) < state.h * 0.25);
    const max = Math.max(1, root.scrollHeight - state.h);
    const y = window.scrollY || 0;
    const turn = Math.max(1, contactEl.offsetTop - state.h);
    let depth = y < turn ? (y / turn) * MAX_DEPTH : MAX_DEPTH * (1 - clamp((y - turn) / Math.max(1, max - turn)));
    depth = Math.round(clamp(depth, 0, MAX_DEPTH));
    if (depth !== lastDepth) {
      lastDepth = depth;
      depthNum.textContent = String(depth).padStart(5, '0');
      tempEl.textContent = (2 + 16.4 * Math.exp(-depth / 500)).toFixed(1) + ' °C';
      presEl.textContent = Math.round(1 + depth / 10).toLocaleString('en-US') + ' atm';
      const railH = state.h * 0.56;
      const remPx = parseFloat(getComputedStyle(root).fontSize);
      railTicks.style.transform = `translate3d(0, ${(railH / 2 - depth * RAIL_K * remPx).toFixed(1)}px, 0)`;
    }
    if (state.started) {
      const s = state.time - startedAt;
      const f = Math.floor((s % 1) * 25), ss = Math.floor(s) % 60, mm = Math.floor(s / 60) % 60, hh = Math.floor(s / 3600);
      tcEl.textContent = [hh, mm, ss, f].map(v => String(v).padStart(2, '0')).join(':');
    }
  }
  let startedAt = 0;

  /* -------------------------------------------------------------------------
     Species tickers (speed up while you scroll)
     ------------------------------------------------------------------------- */
  const marquees = $$('.marquee').map(m => {
    const track = $('.marquee__track', m);
    track.innerHTML += track.innerHTML;
    return { el: m, track, x: 0, dir: +m.dataset.dir || -1, half: 0 };
  });
  function measureMarquees() { marquees.forEach(m => { m.half = m.track.scrollWidth / 2; }); }
  function updateMarquees(dt) {
    const boost = Math.min(Math.abs(state.scrollV) * 18, 900);
    marquees.forEach(m => {
      if (!m.half) return;
      m.x += m.dir * (55 + boost) * dt;
      if (m.x <= -m.half) m.x += m.half;
      if (m.x > 0) m.x -= m.half;
      m.track.style.transform = `translate3d(${m.x.toFixed(1)}px, 0, 0)`;
    });
  }

  /* -------------------------------------------------------------------------
     Service labels riding on the whale
     ------------------------------------------------------------------------- */
  const markersEl = $('.markers');
  markersEl.innerHTML = WHALE_LABELS.map((m, i) => `<div class="marker${WHALE_LAYOUT[i][0] ? ' is-down' : ''}"><span class="marker__label"><b>0${i + 1}</b>${m}</span><span class="marker__line" style="height:${WHALE_LAYOUT[i][1]}rem"></span><span class="marker__dot"></span></div>`).join('');
  const markerEls = $$('.marker', markersEl);
  let markerSizes = [];
  function measureMarkers() { markerSizes = markerEls.map(el => [el.offsetWidth, el.offsetHeight]); }
  const _v = new THREE.Vector3();
  function updateMarkers(visibility) {
    if (!scenes.length || mqMobile()) return;
    const ws = scenes[1], cam = ws.camera, sp = ws.sp;
    ws.group.updateMatrixWorld();
    markerEls.forEach((el, i) => {
      const reveal = smoothstep(0.08 + i * 0.05, 0.13 + i * 0.05, sp) * (1 - smoothstep(0.9, 0.98, sp));
      _v.copy(ws.anchors[i]); ws.whale.localToWorld(_v);
      const p = _v.project(cam);
      const x = (p.x * 0.5 + 0.5) * state.w, y = (-p.y * 0.5 + 0.5) * state.h;
      const edge = smoothstep(0.04, 0.14, x / state.w) * (1 - smoothstep(0.86, 0.96, x / state.w));
      const op = reveal * edge * visibility;
      const [w, h] = markerSizes[i] || [0, 0];
      const down = WHALE_LAYOUT[i][0] === 1;
      el.style.opacity = op.toFixed(3);
      el.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px, ${(down ? y - 4 : y - h + 4).toFixed(1)}px, 0)`;
    });
  }

  /* -------------------------------------------------------------------------
     Cursor
     ------------------------------------------------------------------------- */
  const cursorEl = $('.cursor');
  const cursorLabel = $('.cursor__label');
  const cur = { x: state.w / 2, y: state.h / 2 };
  let cursorText = '';
  let overUi = false;
  if (env.finePointer) root.classList.add('has-cursor');
  on(document, 'pointerover', e => {
    const link = !!e.target.closest('a, button, input, .step');
    cursorEl.classList.toggle('is-link', link);
    overUi = link || !!e.target.closest('.footer');
  });
  function activeSceneIndex() {
    const { cur: a, next: b, p } = state.stage;
    return +sections[p > 0.5 && b !== null ? b : a].dataset.scene;
  }
  function updateCursor() {
    cur.x = lerp(cur.x, state.mouse.x, 0.22);
    cur.y = lerp(cur.y, state.mouse.y, 0.22);
    cursorEl.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0)`;
    let label = '';
    if (state.started && scenes.length && !overUi) label = scenes[activeSceneIndex()].cursor();
    if (label !== cursorText) {
      cursorText = label;
      cursorEl.classList.toggle('has-label', !!label);
      if (label) cursorLabel.textContent = label;
    }
  }

  /* -------------------------------------------------------------------------
     Input
     ------------------------------------------------------------------------- */
  const setMouse = e => {
    state.mouse.x = e.clientX; state.mouse.y = e.clientY;
    state.mouse.nx = (e.clientX / state.w) * 2 - 1;
    state.mouse.ny = -(e.clientY / state.h) * 2 + 1;
  };
  on(window, 'pointermove', e => { setMouse(e); state.mouse.moved = true; }, { passive: true });
  on(window, 'pointerdown', e => {
    if (!state.started || !scenes.length) return;
    if (e.target.closest('a, button, input, form, .step, .gate, .footer')) return;
    setMouse(e);
    const res = scenes[activeSceneIndex()].onClick();
    if (res === 'ripple') compositor.ripple(e.clientX / state.w, 1 - e.clientY / state.h, 1);
  });
  on(document, 'click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href');
    sound.click();
    scrollToTarget(id === '#top' ? 0 : $(id));
  });
  $$('[data-sfx="hover"]').forEach(el => el.addEventListener('pointerenter', () => sound.hover()));
  $$('[data-sfx="step"]').forEach(el => el.addEventListener('pointerenter', () => sound.step(+el.dataset.i)));

  const sndBtn = $('.snd');
  sndBtn.addEventListener('click', () => {
    if (!sound.ready) sound.init();
    sound.setOn(!sound.on);
    sndBtn.setAttribute('aria-pressed', String(sound.on));
  });

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
  gsap.set(['.sh', '.hud', '.rail'], { autoAlpha: 0 });
  gsap.set('.hero [data-reveal]', { autoAlpha: 0, y: 30 });
  gsap.set('.gline > span', { yPercent: 110 });
  gsap.to('.gline > span', { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: 0.1, delay: 0.2 });
  gsap.from(['.gate__brief', '.gate__meta'], { autoAlpha: 0, y: 20, duration: 1.2, ease: 'expo.out', delay: 0.7, stagger: 0.1 });

  const pct = $('.gate__pct');
  const load = { v: 0 };
  gsap.to(load, { v: 70, duration: 0.9, ease: 'power2.out', onUpdate: () => { pct.textContent = Math.round(load.v); } });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    measureMarkers(); measureMarquees();
    gsap.to(load, { v: 100, duration: 0.5, onUpdate: () => { pct.textContent = Math.round(load.v); },
      onComplete: () => { $('.gate__loading').textContent = 'Cabin sealed'; } });
    ScrollTrigger.refresh();
  });

  function start() {
    if (state.started) return;
    state.started = true;
    startedAt = state.time;
    sound.init();
    sound.setOn(true);
    sndBtn.setAttribute('aria-pressed', String(sound.on));
    sound.tone({ freq: 196, to: 98, dur: 2.2, vol: 0.12, verb: 0.9 });
    sound.splash();
    if (compositor) compositor.ripple(0.5, 0.5, 1.4);
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
    window.scrollTo(0, 0);
    if (lenis) { lenis.scrollTo(0, { immediate: true, force: true }); lenis.start(); } else root.style.overflow = '';
    gsap.to(['.sh', '.hud', '.rail'], { autoAlpha: 1, duration: 0.6 });
    gsap.from('.logo span, .logo sup', { yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.05 });
    gsap.from('.sh__nav > *, .sh__rec', { autoAlpha: 0, y: -12, duration: 1, ease: 'expo.out', stagger: 0.06, delay: 0.2 });
    gsap.from('.sh__scroll', { autoAlpha: 0, y: 16, duration: 1, ease: 'expo.out', delay: 0.3 });
    gsap.from('.hud__c', { scale: 2.2, autoAlpha: 0, duration: 1.4, ease: 'expo.out', stagger: 0.06, delay: 0.2 });
    gsap.to('.hero [data-reveal]', { autoAlpha: 1, y: 0, duration: 1.4, ease: 'expo.out', stagger: 0.1, delay: 0.5 });
    showClaim(0, 0.2);
    gsap.delayedCall(6, cycleClaims);
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
      measureMarkers(); measureMarquees();
      lastDepth = -1;
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

  const weights = [0, 0, 0, 0, 0, 0];
  const tick = (time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.05);
    state.time += dt;
    const t = state.time;
    const m = state.mouse;
    m.sx = lerp(m.sx, m.nx, 0.05);
    m.sy = lerp(m.sy, m.ny, 0.05);
    state.scrollV *= 0.92;

    const st = computeStage();
    const sa = +sections[st.cur].dataset.scene;
    const sb = st.next !== null ? +sections[st.next].dataset.scene : null;

    if (renderer) {
      const active = new Set([sa]);
      if (sb !== null && st.p > 0) active.add(sb);
      active.forEach(i => scenes[i].update(t, dt));
      compositor.render(scenes, sa, sb, st.p, t);
      const whaleVis = sa === 1 ? (sb === 1 || sb === null ? 1 : 1 - st.p) : 0;
      updateMarkers(whaleVis);
    }

    weights.fill(0);
    if (sb === null || sb === sa) weights[sa] = 1;
    else { weights[sa] = 1 - st.p; weights[sb] = st.p; }
    sound.mix(weights);

    updateInstruments();
    updateMarquees(dt);
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
