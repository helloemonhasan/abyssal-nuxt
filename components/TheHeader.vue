<!-- Fixed header (logo, live timecode, nav, sound) plus depth readout and depth rail -->
<template>
  <div class="chrome">
  <header class="sh">
    <div class="sh__top">
      <a href="#top" class="logo" data-sfx="hover" aria-label="Abyssal, back to top"><span>a</span><span>b</span><span>y</span><span>s</span><span>s</span><span>a</span><span>l</span><sup>°</sup></a>
      <p class="mono sh__rec"><span class="rec-dot"></span>ROV-02 · Live <span class="tc">00:00:00:00</span></p>
      <nav class="sh__nav" aria-label="Main">
        <a href="#explore" class="uline" data-sfx="hover">Expeditions</a>
        <a href="#crew" class="uline" data-sfx="hover">Crew</a>
        <a href="#dive" class="uline" data-sfx="hover">The dive</a>
        <a href="#contact" class="btn btn--sm" data-sfx="hover"><span class="btn__in"><span class="btn__label">Get in touch</span><span class="btn__label" aria-hidden="true">Get in touch</span></span></a>
        <button class="snd" type="button" aria-label="Toggle sound" aria-pressed="false" data-sfx="hover"><i></i><i></i><i></i><i></i></button>
      </nav>
    </div>
    <div class="sh__bottom">
      <div class="readout">
        <p class="mono readout__k">Depth</p>
        <p class="readout__v"><span class="depth__num">00000</span><small>m</small></p>
        <p class="mono readout__meta"><span class="depth__zone">Sunlight zone</span><span class="temp">18.4 °C</span><span class="pres">1 atm</span></p>
      </div>
      <p class="mono sh__scroll">Scroll to descend <span class="sh__arrow">↓</span></p>
    </div>
  </header>
  <div class="rail" aria-hidden="true"><div class="rail__ticks"></div><div class="rail__needle"></div></div>
  </div>
</template>
