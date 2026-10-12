import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built game works from any web address (artifact link, GitHub Pages, etc.).
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 4500 },
});
