<!-- Footer: newsletter, sitemap, base, socials -->
<template>
  <footer class="footer" data-fg="#03263A">
    <div class="site footer__grid">
      <div class="footer__news">
        <h2 class="h3">Stay in the <em>loop</em></h2>
        <form class="signup" novalidate>
          <label class="sr" for="email">Email address</label>
          <input id="email" class="signup__input" type="email" placeholder="Your email address" autocomplete="email" required>
          <button class="signup__btn" type="submit" data-sfx="hover" aria-label="Subscribe">→</button>
        </form>
        <p class="small signup__msg" role="status"></p>
      </div>
      <div>
        <p class="mono footer__label">Sitemap</p>
        <ul class="footer__list">
          <li><a href="#explore" class="uline" data-sfx="hover">Expeditions</a></li>
          <li><a href="#crew" class="uline" data-sfx="hover">Crew</a></li>
          <li><a href="#dive" class="uline" data-sfx="hover">Field notes</a></li>
        </ul>
      </div>
      <div>
        <p class="mono footer__label">Base</p>
        <p class="small">Lisbon, Portugal<br>Diving worldwide</p>
      </div>
      <div>
        <p class="mono footer__label">Find us</p>
        <ul class="footer__list">
          <li><a href="#top" class="uline" data-sfx="hover">Instagram</a></li>
          <li><a href="#top" class="uline" data-sfx="hover">YouTube</a></li>
        </ul>
      </div>
    </div>
    <div class="site footer__base">
      <p class="footer__logo" aria-hidden="true">abyssal<sup>°</sup></p>
      <p class="mono footer__copy">© 2026 Abyssal · A concept site</p>
    </div>
  </footer>
</template>
