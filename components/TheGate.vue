<!-- Click-to-dive gate: unlocks audio and starts the intro -->
<template>
  <div class="gate" role="button" tabindex="0" aria-label="Start the experience">
    <div class="gate__inner">
      <p class="mono gate__brief">ROV-02 · Descent briefing · 38°42′N 9°08′W</p>
      <h1 class="gate__title" aria-label="Descend into the unknown">
        <span class="gline"><span>Descend</span></span>
        <span class="gline"><span><em>into</em> the</span></span>
        <span class="gline"><span>unknown</span></span>
      </h1>
      <div class="gate__meta">
        <p class="mono gate__cta"><span class="gate__ring"></span>Click anywhere to dive</p>
        <p class="mono gate__hint">Headphones on · every sound is made live</p>
      </div>
    </div>
    <p class="gate__loading mono">Pressurising cabin <span class="gate__pct">0</span>%</p>
  </div>
</template>
