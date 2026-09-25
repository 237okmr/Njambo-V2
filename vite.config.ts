import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Sépare les grosses bibliothèques dans leur propre fichier : elles changent rarement, donc le
          // navigateur peut les garder en cache d'une mise à jour à l'autre du reste de l'application.
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-firebase': ['firebase/app', 'firebase/firestore', 'firebase/auth'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: [
        'firebase',
        '@firebase/app',
        '@firebase/firestore',
        '@firebase/auth',
        '@firebase/component',
        '@firebase/util',
      ],
    },
    optimizeDeps: {
      include: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
