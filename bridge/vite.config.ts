import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const bridgeRoot = fileURLToPath(new URL('.', import.meta.url));
const bridgeEntry = fileURLToPath(new URL('./src/index.ts', import.meta.url));

export default defineConfig({
  root: bridgeRoot,
  build: {
    lib: {
      entry: bridgeEntry,
      name: 'AppsInTossGodotBridge',
      formats: ['iife'],
      fileName: () => 'apps-in-toss-godot-bridge.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
