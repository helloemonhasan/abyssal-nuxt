<template>
  <div class="page">
    <StageOverlays />
    <TheGate />
    <TheHeader />
    <main id="top">
      <HeroSection />
      <MarqueeSurface />
      <ServicesSection />
      <WhoSection />
      <WithSection />
      <HowSection />
      <MarqueeDeep />
      <ContactSection />
    </main>
    <SiteFooter />
  </div>
</template>

<script setup>
// The experience (Three.js, GSAP, Lenis, Web Audio) runs only in the browser.
// It is imported lazily so nothing touches `window` during prerendering.
let destroy = null;

onMounted(async () => {
  const { createExperience } = await import('~/experience');
  destroy = createExperience();
});

onBeforeUnmount(() => {
  if (destroy) destroy();
  destroy = null;
});
</script>
