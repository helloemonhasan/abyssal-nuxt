// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Abyssal — Into the Deep',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Abyssal is a deep-ocean exploration studio. We dive where light ends and bring what we find back to the surface.' },
        { property: 'og:title', content: 'Abyssal — Into the Deep' },
        { property: 'og:type', content: 'website' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@400;500;600;700&family=Unbounded:wght@400;500&display=swap' },
      ],
    },
  },

  // Static, prerendered output like the reference site: `npm run generate`
  nitro: { prerender: { routes: ['/'] } },

  vite: {
    optimizeDeps: { include: ['three', 'gsap', 'gsap/ScrollTrigger', 'lenis'] },
  },
})
