import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import aitDevtools from '@apps-in-toss/devtools/unplugin';

const bridgeRoot = fileURLToPath(new URL('.', import.meta.url));
const bridgeEntry = fileURLToPath(new URL('./src/index.ts', import.meta.url));

/**
 * Bridge bundle.
 *
 * - Production (default, `npm run build`): packages the real
 *   @apps-in-toss/web-framework. No devtools code is included.
 * - Dev Server (`AIT_BRIDGE_MOCK=1 npm run build`): the unplugin swaps the SDK
 *   for the devtools mock facade and injects the floating DevTools panel, so the
 *   same bridge runs with mock responses in a plain browser. Mirrors the Unity
 *   SDK Dev Server flow. The mock build must never ship: run-in-sdk 'patch'
 *   copies only dist/, and CI builds without AIT_BRIDGE_MOCK.
 *
 * `forceEnable` is required because `vite build` runs with NODE_ENV=production,
 * where the devtools plugin disables itself by default. `mock: true` keeps the
 * alias on; `panel` injection is delegated to patch-export.mjs, which copies the
 * standalone panel bundle into the export dir (the bridge IIFE has no ESM entry
 * the plugin's import-injection could attach to reliably).
 */
const withMock = process.env.AIT_BRIDGE_MOCK === '1';

export default defineConfig({
  root: bridgeRoot,
  plugins: [
    ...(withMock
      ? [aitDevtools.vite({ mock: true, panel: false, forceEnable: true })]
      : []),
  ],
  build: {
    lib: {
      entry: bridgeEntry,
      name: 'AppsInTossGodotBridge',
      formats: ['iife'],
      fileName: () =>
        withMock ? 'apps-in-toss-godot-bridge.mock.js' : 'apps-in-toss-godot-bridge.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});