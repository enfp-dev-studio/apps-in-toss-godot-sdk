import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AppsInTossGodotBridge',
      formats: ['es'],
      fileName: () => 'apps-in-toss-godot-bridge.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
