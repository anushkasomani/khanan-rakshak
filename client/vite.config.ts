import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
      ],

      manifest: {
        name: 'Khanan Rakshak — Coal Mine Safety Platform',
        short_name: 'Khanan Rakshak',
        description:
          'Coal mine safety, grievance, and regulatory compliance platform.',

        theme_color: '#09090b',
        background_color: '#09090b',

        display: 'standalone',
        orientation: 'portrait-primary',

        start_url: '/',
        scope: '/',

        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        navigateFallbackDenylist: [
          /\/api\//,
        ],

        runtimeCaching: [
          {
            urlPattern: /\/api\/sos\//,
            handler: 'NetworkOnly',
          },

          {
            urlPattern: /\/api\/auth\//,
            handler: 'NetworkOnly',
          },

          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',

            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,

              cacheableResponse: {
                statuses: [0, 200],
              },

              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 300,
              },
            },
          },

          {
            urlPattern: /\.(png|jpg|jpeg|svg|woff2?)$/,

            handler: 'CacheFirst',

            options: {
              cacheName: 'static-assets',

              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],

  server: {
    host: '0.0.0.0',
    port: 5173,

    // Allow ngrok to access the Vite development server
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],

    proxy: {
      '/api': {
        target:
          process.env.API_PROXY_TARGET || 'http://localhost:5002',

        changeOrigin: true,
      },
    },
  },
});