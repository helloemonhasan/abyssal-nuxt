<!-- Fixed header: logo, nav, sound toggle, depth meter -->
<template>
  <header class="sh">
    <div class="sh__top">
      <a href="#top" class="logo" data-sfx="hover" aria-label="Abyssal, back to top">
        <span>A</span><span>B</span><span>Y</span><span>S</span><span>S</span><span>A</span><span>L</span>
      </a>
      <nav class="sh__nav" aria-label="Main">
        <a href="#explore" class="uline" data-sfx="hover">Expeditions</a>
        <a href="#crew" class="uline" data-sfx="hover">Crew</a>
        <a href="#dive" class="uline" data-sfx="hover">The dive</a>
        <a href="#contact" class="btn btn--sm" data-sfx="hover"><span class="btn__in"><span class="btn__label">Get in touch</span><span class="btn__label" aria-hidden="true">Get in touch</span></span></a>
        <button class="snd" type="button" aria-label="Toggle sound" aria-pressed="false" data-sfx="hover"><i></i><i></i><i></i><i></i></button>
      </nav>
    </div>
    <div class="sh__bottom">
      <div class="depth">
        <span class="eyebrow depth__label">Depth</span>
        <span class="depth__value"><span class="depth__num">00000</span> m</span>
        <span class="eyebrow depth__zone">Sunlight zone</span>
      </div>
      <div class="sh__scroll eyebrow">Scroll to descend <span class="sh__arrow">↓</span></div>
    </div>
  </header>
</template>
