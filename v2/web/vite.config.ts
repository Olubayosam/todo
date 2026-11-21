import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// The app is served from a sub-folder (/todo-v2/ now, maybe / later), so every
// URL is relative: assets, the API ("api/") and the service worker scope.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'autoUpdate',
      manifest: {
        name: 'Olubayosam — Today',
        short_name: 'Today',
        description: 'Plan the day, protect your focus.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0e0e0e',
        theme_color: '#0e0e0e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Start focus', url: './#/focus', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Inbox', url: './#/inbox', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Only precache the Latin font subsets; others still load on demand
        globIgnores: ['**/*cyrillic*', '**/*greek*', '**/*vietnamese*'],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost',
        rewrite: (p) => p.replace(/^\/api/, '/todo-v2/api'),
      },
    },
  },
});
