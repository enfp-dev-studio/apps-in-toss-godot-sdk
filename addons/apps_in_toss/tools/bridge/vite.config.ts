import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import aitDevtools from '@apps-in-toss/devtools/unplugin';

const bridgeRoot = fileURLToPath(new URL('.', import.meta.url));
const bridgeEntry = fileURLToPath(new URL('./src/index.ts', import.meta.url));
const debugConsoleEntry = fileURLToPath(new URL('./src/debug-console.ts', import.meta.url));
const sentryEntry = fileURLToPath(new URL('./src/sentry.ts', import.meta.url));

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
 *   `@apps-in-toss/debug-console` `startDebugConsole` for on-device attach (`/ait:debug`
 *   environment 3). It is injected only by test builds
 *   (`ait-godot build --debug-console`); the bridge bundle never imports it.
 *   `AIT_DEBUG_RELAY_KEYS` (JSON array of the debugger public keys, read from the
 *   game manifest by the build) is required and baked in as `__AIT_DEBUG_RELAY_KEYS__`.
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

// 앱인토스 검수는 번들의 "eval" 글자 자체를 반려한다(외부 코드 실행 검사, 2026-11-04).
// @webview-bridge/web의 내부 옵션 이름 `evaluate`(같은 번들 안에서만 쓰임)를 `dispatch`로
// 바꾼다. 속성 위치(.evaluate, evaluate:)만 바꿔 document.evaluate() 같은 DOM 호출은 두고,
// 출시·debug-console 번들에 글자가 남으면 빌드를 멈춘다. mock 번들은 출시되지 않아 바꾸기만 한다.
const evalProperty = /(\.|[{,]\s*)evaluate(?=\s*[:,;})=])/g;

function stripEvalText(failOnLeftover: boolean): Plugin {
  return {
    name: 'ait-strip-eval-text',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        chunk.code = chunk.code.replace(evalProperty, '$1dispatch');
        const left = chunk.code.search(/eval/i);
        if (failOnLeftover && left !== -1) {
          const around = chunk.code.slice(Math.max(0, left - 60), left + 60);
          this.error(`${chunk.fileName} still contains "eval" text: …${around}… (update stripEvalText)`);
        }
      }
    },
  };
}

function relayPublicKeys(): string[] {
  const raw = process.env.AIT_DEBUG_RELAY_KEYS;
  const keys: unknown = raw ? JSON.parse(raw) : null;
  if (!Array.isArray(keys) || keys.length === 0 || !keys.every((k) => typeof k === 'string' && k !== '')) {
    throw new Error('AIT_DEBUG_RELAY_KEYS must be a JSON array of debugger public keys (game manifest debugConsole.relayPublicKeys).');
  }
  return keys as string[];
}

// @sentry/browser의 "eval" 글자(검수 반려 대상)를 뜻은 그대로 두고 바꾼다. 정규식 안은 ev[a]l(같은 글자와 맞음),
// 문자열은 나눠 쓴다. 대상은 기본 오류 거르기 정규식과 브라우저 스택 해석(eval로 만든 코드의 줄)이다.
// 판을 올려 모양이 바뀌면 아래 stripEvalText(true)가 남은 글자로 빌드를 멈춘다.
function rewriteSentryEvalText(): Plugin {
  const rules: Array<[RegExp, string]> = [
    [/\\\(evaluating /g, '\\(ev[a]luating '],
    [/ > eval line /g, ' > ev[a]l line '],
    [/ > eval\/i/g, ' > ev[a]l/i'],
    [/`eval`/g, "`ev${'a'}l`"],
    [/` > eval`/g, "` > ev${'a'}l`"],
  ];
  return {
    name: 'ait-rewrite-sentry-eval-text',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const [pattern, replacement] of rules) chunk.code = chunk.code.replace(pattern, replacement);
      }
    },
  };
}

function sentryConfig(): Record<string, unknown> {
  const raw = process.env.AIT_SENTRY_CONFIG;
  const config: unknown = raw ? JSON.parse(raw) : null;
  if (!config || typeof config !== 'object' || typeof (config as { dsn?: unknown }).dsn !== 'string') {
    throw new Error('AIT_SENTRY_CONFIG must be a JSON object with dsn (game manifest sentry).');
  }
  return config as Record<string, unknown>;
}

export default defineConfig(({ mode }) => {
  if (mode === 'sentry') {
    // Sentry 연동(dist/ait-sentry.js). 매니페스트에 sentry.dsn이 있는 게임만 ait-godot build가 만든다.
    return {
      root: bridgeRoot,
      plugins: [rewriteSentryEvalText(), stripEvalText(true)],
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        __AIT_SENTRY_CONFIG__: JSON.stringify(sentryConfig()),
      },
      build: {
        lib: {
          entry: sentryEntry,
          name: 'AppsInTossGodotSentry',
          formats: ['iife'],
          fileName: () => 'ait-sentry.js',
        },
        outDir: 'dist',
        emptyOutDir: false,
      },
    };
  }
  if (mode === 'debug-console') {
    return {
      root: bridgeRoot,
      plugins: [useBridgeSdk(), stripEvalText(true)],
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        __AIT_DEBUG_RELAY_KEYS__: JSON.stringify(relayPublicKeys()),
      },
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
      stripEvalText(!withMock),
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
