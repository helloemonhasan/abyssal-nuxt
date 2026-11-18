<!-- Click-to-dive gate: unlocks audio and starts the intro -->
<template>
  <div class="gate" role="button" tabindex="0" aria-label="Start the experience">
    <div class="gate__inner">
      <h1 class="gate__title" aria-label="Descend into the unknown">
        <span class="gline"><span>DESCEND</span></span>
        <span class="gline"><span>INTO THE</span></span>
        <span class="gline"><span>UNKNOWN</span></span>
      </h1>
      <div class="gate__meta">
        <p class="eyebrow gate__cta"><span class="gate__ring"></span>Click anywhere to dive</p>
        <p class="eyebrow gate__hint">Use headphones for the best experience</p>
      </div>
    </div>
    <p class="gate__loading eyebrow">Pressurising cabin <span class="gate__pct">0</span>%</p>
  </div>
</template>
