import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import svgr from 'vite-plugin-svgr';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isDev = mode === 'development';

  return {
    plugins: [
      react(),
      svgr(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png', 'screenshots/*.png'],

        srcDir: 'public',
        filename: 'sw.js',
        strategies: 'injectManifest',
        injectManifest: {
          injectionPoint: undefined,
        },

        devOptions: {
          enabled: isDev,
          type: 'module',
        },

        manifest: {
          id: '/',
          name: isDev ? 'Bearny (Dev)' : 'Bearny',
          short_name: isDev ? 'Bearny (Dev)' : 'Bearny',
          description: 'Beaready after Rehab',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'icons/pwa-48x48.png',
              sizes: '48x48',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-72x72.png',
              sizes: '72x72',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-96x96.png',
              sizes: '96x96',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-128x128.png',
              sizes: '128x128',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-144x144.png',
              sizes: '144x144',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-152x152.png',
              sizes: '152x152',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-256x256.png',
              sizes: '256x256',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-384x384.png',
              sizes: '384x384',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
          screenshots: [
            {
              src: 'screenshots/screenshot-desktop.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
            },
            {
              src: 'screenshots/screenshot-mobile.png',
              sizes: '540x720',
              type: 'image/png',
              form_factor: 'narrow',
            },
          ],
        },
      }),
    ],
    server: {
      host: true, // or '0.0.0.0'
      port: 3000,
      https: false,
      allowedHosts: ['dev.reha-advisor.ch'],
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL),
      'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(env.VITE_SENTRY_DSN ?? ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
