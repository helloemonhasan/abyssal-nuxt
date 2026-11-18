# Abyssal — Into the Deep

An immersive, scroll-driven ocean site built with Nuxt 3, Three.js, GSAP and Lenis. Its interactions follow altermind.studio, with a new concept, copy, sea life and sound.

Live: https://abyssal-nuxt.vercel.app

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run generate   # static, prerendered build in .output/public
```

Node 18.18+ (Node 20 or 22 recommended).

## The dive

| # | Zone | Scene | Try this |
| --- | --- | --- | --- |
| — | Gate | Sunlit water behind the title | Click anywhere to dive: unlocks audio, splash ripple, column wipe |
| 01 | Sunlight, 0–200 m | God rays, shimmering surface, caustics, a 420-fish school, bubbles | Move to scatter the school; click to splash |
| 02 | Twilight, 200–1,000 m (pinned) | A blue whale and her calf glide across as you scroll | Seven service labels ride along the whale |
| 03 | Midnight, 1,000–4,000 m | Total dark, marine snow, a circling shark | Your cursor is a torch; when the beam finds the shark, it bolts |
| 04 | Abyssal, 4,000–6,000 m | A swarm of bioluminescent jellyfish with glow trails | Click any jellyfish to ping it |
| 05 | Hadal, 6,000–10,994 m | Sonar seabed with sweep and blips, an anglerfish lure | The lure follows your cursor |
| 06 | Resurfacing | Looking up at the sunlit surface, a fish school, bubbles | Click the water to release bubbles |

Everything passes through an underwater lens: a gentle wobble, click ripples, slight chromatic fringing, vignette and film grain.

## Design system

- **Type:** Fraunces (display, light weight with italic accents), JetBrains Mono (instrument labels), Manrope (body).
- **Layout:** ROV camera frame corners, a live `ROV-02 · LIVE` timecode, numbered zone lines (`01 — Sunlight zone — 0–200 m`), species tickers, a depth rail on the right edge, and a readout of depth, temperature and pressure.
- **Grain:** an animated SVG film-grain overlay above everything, plus grain in the shaders.
- **Fluid rem:** `html { font-size: clamp(1px, 10px, 10 * 100vw / var(--size)) }`, with `--size` 1920 on desktop and 402 on mobile. In design-file pixels, 1rem = 10px. Display sizes are also capped by viewport height.

## How it is built

```
pages/index.vue          markup is rendered by the components; the experience is imported in onMounted
components/              StageOverlays, TheGate, TheHeader, *Section, Marquee*, SiteFooter
experience/index.js      wires everything: scenes, Lenis, reveals, instruments, tickers, whale labels, cursor, input, gate, loop
webgl/core.js            shared state, renderer, full-screen pass helper, DOM→3D tracker mapping
webgl/helpers.js         water background (rays, surface, caustics, torch beam), marine snow, bubbles, body/fin geometry, BaseScene
webgl/fish.js            instanced fish school: swimming tails, flocking along a path, cursor avoidance, splash scatter
webgl/scenes/*.js        sunlight, whale (+ shared creature shader), shark, jellyfish + jellies, sonar, resurface
webgl/compositor.js      five-column wipe between scenes, then the underwater post pass
webgl/glsl.js            simplex noise, full-screen vertex shader, matcap UV helper
audio/sound.js           all sound generated live with Web Audio: ocean rumble, a pad per zone, whale call, splash, haptics
assets/css/main.css      tokens, type, layout, HUD, rail, grain, components
```

All the creatures are procedural, so there are no model files. Each body is a lathed profile with shaped fins merged on, and a vertex shader makes it swim. Whales undulate vertically, while sharks and fish undulate side to side.

## Customising

- **Copy and sections:** edit the components. Keep the `data-scene`, `data-zone`, `data-fg` and `data-bg` attributes on each `.sec`.
- **Water colours and light per zone:** the `super({ top, bottom, sun, rays, surface, caustic })` call in each scene.
- **Whale labels:** `WHALE_LABELS`, `WHALE_ANCHORS` and `WHALE_LAYOUT` in `webgl/scenes/whale.js`.
- **Fish:** the `FishSchool` options in `sunlight.js` and `resurface.js` (count, size, colours, fog).
- **Real models:** swap a procedural creature for a GLB via `GLTFLoader` (`three/addons/loaders/GLTFLoader.js`) inside its scene.

## Notes

- `three` is pinned to 0.160.0, the version the live prototype was tested with.
- Placeholder content: the founder name, partner claims, the email address and the social links are fictional. Replace them before publishing.
- Without WebGL, the site falls back to solid section colours with all content readable.
