import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built game works from any web address (artifact link, GitHub Pages, etc.).
  base: './',
  // Only probe for the private (gitignored) Mixamo clips when they exist on this machine, so the
  // public build (GitHub Pages) never requests models/private/anims.glb and logs a 404.
  define: { __HAS_PRIVATE_ANIMS__: JSON.stringify(existsSync('public/models/private/anims.glb')) },
  build: {
    target: 'es2022',
    // Rapier stays on the compat build: its WASM is inlined, so Node tests and the browser
    // share one file and nothing extra has to be served. It is already imported dynamically
    // from the player. Splitting it (and the post stack) keeps them out of the first paint chunk.
    // The non-compat package would need a separate .wasm plus a different test loader.
    // The compat chunk is ~4 MB because the WASM is inside it; that is expected.
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@dimforge/rapier3d-compat')) return 'rapier';
          if (id.includes('node_modules/postprocessing') || id.includes('node_modules/n8ao')) return 'post';
        },
      },
    },
  },
});
