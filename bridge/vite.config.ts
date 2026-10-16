import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import aitDevtools from '@apps-in-toss/devtools/unplugin';

const bridgeRoot = fileURLToPath(new URL('.', import.meta.url));
const bridgeEntry = fileURLToPath(new URL('./src/index.ts', import.meta.url));
const debugConsoleEntry = fileURLToPath(new URL('./src/debug-console.ts', import.meta.url));

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
 * - Debug console (`npm run build:debug-console`, mode `debug-console`): builds
 *   only `dist/ait-debug-console.js`, a separate IIFE with
 *   `@apps-in-toss/debug-console/auto` for on-device attach (`/ait:debug`
 *   environment 3). It is injected only by test builds
 *   (`ait-godot build --debug-console`); the bridge bundle never imports it.
 *
 * `forceEnable` is required because `vite build` runs with NODE_ENV=production,
 * where the devtools plugin disables itself by default. `mock: true` keeps the
 * alias on; `panel` injection is delegated to patch-export.mjs, which copies the
 * standalone panel bundle into the export dir (the bridge IIFE has no ESM entry
 * the plugin's import-injection could attach to reliably).
 */
const withMock = process.env.AIT_BRIDGE_MOCK === '1';

// debug-console은 SDK를 `import('@apps-in-toss/web-framework')`로 불러 쓴다.
// 테스트 빌드에서는 브리지가 먼저 올린 window.AppsInToss를 쓰게 바꿔
// web-framework 사본이 한 번 더 번들되지 않게 한다.
const sdkDynamicImport = /import\(\s*["']@apps-in-toss\/web-framework["']\s*\)/g;
const bridgeSdk =
  '(globalThis.AppsInToss ? Promise.resolve(globalThis.AppsInToss) : Promise.reject(new Error("Apps in Toss Godot bridge is not loaded")))';

function useBridgeSdk(): Plugin {
  let replaced = 0;
  return {
    name: 'ait-debug-console-bridge-sdk',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@apps-in-toss/debug-console')) return null;
      const next = code.replace(sdkDynamicImport, () => {
        replaced += 1;
        return bridgeSdk;
      });
      return next === code ? null : { code: next, map: null };
    },
    generateBundle(_options, bundle) {
      if (replaced === 0) this.error('debug-console SDK import was not found; check the package version.');
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.code.includes('@apps-in-toss/web-framework')) {
          this.error(`${chunk.fileName} still imports @apps-in-toss/web-framework.`);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'debug-console') {
    return {
      root: bridgeRoot,
      plugins: [useBridgeSdk()],
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        lib: {
          entry: debugConsoleEntry,
          name: 'AppsInTossGodotDebugConsole',
          formats: ['iife'],
          fileName: () => 'ait-debug-console.js',
        },
        outDir: 'dist',
        // 같은 dist의 출시 브리지 번들을 지우지 않는다.
        emptyOutDir: false,
      },
    };
  }

  return {
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
  };
});
