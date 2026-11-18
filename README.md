# Abyssal — Into the Deep

An immersive, scroll-driven deep-sea site built with Nuxt 3, Three.js, GSAP and Lenis. Its interactions follow altermind.studio, with a new concept, copy, models and sound.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run generate   # static, prerendered build in .output/public
```

Node 18.18+ (Node 20 or 22 recommended).

## What happens on the page

| Section | Zone | 3D scene | Interaction |
| --- | --- | --- | --- |
| Gate | — | Jellyfish behind the gate | Click anywhere to dive: unlocks audio, column wipe, intro |
| Hero | Sunlight | Jellyfish | Three rotating claims; mouse parallax |
| What we explore | Twilight | Same jellyfish, pinned 420vh | Seven service labels pin to the bell as you scroll; click the bell for a sonar ping (ripple ring + echo) |
| Who we are | Midnight | Procedural nautilus shell (matcap) | Scroll rotates the shell |
| Who we dive with | Abyssal | Urchin, 460 instanced spines | Spines retract and glow under the cursor |
| How we work | Hadal | Sonar seabed with sweep and blips | An anglerfish lure follows the cursor; step cards have animated icons and tones |
| Contact | Resurfacing | Caustics and light rays | Click to release bubbles |

The header changes colour per section. A depth meter counts down to 10,994 m (the Challenger Deep), then resurfaces for the contact section.

## How it is built

```
pages/index.vue          markup is rendered by the components; the experience is imported in onMounted
components/              StageOverlays (canvas, markers, cursor, wipe columns), TheGate, TheHeader, *Section, SiteFooter
experience/index.js      wires everything: scenes, Lenis, ScrollTrigger reveals, header, markers, cursor, input, gate, frame loop
webgl/core.js            shared state, renderer, full-screen pass helper, DOM→3D tracker mapping
webgl/helpers.js         per-scene background shader, marine-snow particles, procedural matcaps, BaseScene
webgl/scenes/*.js        jelly (+ glow post-processing), shell, urchin, sonar, surface
webgl/compositor.js      five-column wipe shader between section scenes
webgl/glsl.js            simplex noise, full-screen vertex shader, matcap UV helper
audio/sound.js           all sound generated live with Web Audio (no files)
assets/css/main.css      design tokens and components
```

Key techniques, same as the reference:

- **One fixed canvas.** Every section owns a scene. A scene renders into its own render target, and a full-screen shader wipes from the current one to the next. The wipe is scrubbed by scroll position, not time. Its columns are 1/8, 1/8, 3/8, 1/8 and 2/8 of the width, with a glowing waterline edge.
- **DOM trackers.** Empty boxes in the HTML (`[data-track]`) reserve space in the layout. The 3D objects are positioned and scaled to sit inside them, so 3D lines up with the 12-column grid.
- **Fluid rem.** `html { font-size: clamp(1px, 10px, 10 * 100vw / var(--size)) }` with `--size` 1920 on desktop and 402 on mobile. In design-file pixels, 1rem = 10px.
- **Glow.** The jellyfish renders a second time on a glow layer at quarter resolution. That pass is blurred and fed back into itself, zooming toward the bell for a radial trail, then screen-blended over the scene.
- **Sound.** Brown-noise ocean rumble, plus one detuned pad per scene that crossfades with scroll, plus haptic tones for hover, click, ping, steps and bubbles. Everything plays through a generated reverb.

## Customising

- **Copy and sections:** edit the components. Keep the `data-scene`, `data-zone`, `data-fg` and `data-bg` attributes on each `.sec`.
- **Colours per scene:** the `super({ top, bottom, glow })` call at the top of each scene class.
- **Service labels:** `MARKERS` and `MARKER_ANCHORS` in `webgl/scenes/jelly.js`.
- **Easing:** `--ease` in `main.css` (expo-out, `cubic-bezier(.19,1,.22,1)`).
- **Real assets:** swap a procedural object for a GLB via `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js` inside the relevant scene.

## Notes

- `three` is pinned to 0.160.0, the version the live prototype was tested with.
- Placeholder content: the founder name, partner claims, the email address and the social links are fictional. Replace them before publishing.
- Without WebGL, the site falls back to solid section colours with all content readable.
