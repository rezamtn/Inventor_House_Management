import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon-*.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'مدیریت خانه',
        short_name: 'خانه من',
        description: 'مدیریت موجودی خانه',
        theme_color: '#12121c',
        background_color: '#12121c',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'fa',
        dir: 'rtl',
        prefer_related_applications: false,
        icons: [
          { src: 'icon-96.png',  sizes: '96x96',   type: 'image/png' },
          { src: 'icon-144.png', sizes: '144x144',  type: 'image/png' },
          { src: 'icon-192.png', sizes: '192x192',  type: 'image/png' },
          { src: 'icon-256.png', sizes: '256x256',  type: 'image/png' },
          { src: 'icon-384.png', sizes: '384x384',  type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512',  type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512',  type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ]
})
