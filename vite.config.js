import { defineConfig } from 'vite';

export default defineConfig({
  // Set base path to /lrama-corral/ for GitHub Pages
  base: process.env.NODE_ENV === 'production' ? '/lrama-corral/' : '/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0, // Do not inline large files
  },
  server: {
    port: 3000,
    open: true,
    fs: {
      strict: false, // Allow access to wasm files
    },
  },
  assetsInclude: ['**/*.wasm'], // Treat wasm files as assets
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
