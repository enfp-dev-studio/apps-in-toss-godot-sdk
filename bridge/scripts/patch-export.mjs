import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bridgeDir = path.resolve(here, '..');
const root = path.resolve(bridgeDir, '../..');

const defaultExportDir = path.join(root, 'build/godot-web');
const exportDir = path.resolve(process.argv[2] ?? process.env.GODOT_EXPORT_DIR ?? defaultExportDir);
const withMock = process.env.AIT_BRIDGE_MOCK === '1';

const indexPath = path.join(exportDir, 'index.html');
const bundleName = withMock ? 'apps-in-toss-godot-bridge.mock.js' : 'apps-in-toss-godot-bridge.js';
const bundleSrc = path.join(bridgeDir, 'dist', bundleName);
const bundleDst = path.join(exportDir, bundleName);

if (!fs.existsSync(indexPath)) throw new Error(`index.html not found: ${indexPath}`);
if (!fs.existsSync(bundleSrc)) throw new Error(`Bridge bundle not found: ${bundleSrc}. Run npm run build first.`);

fs.copyFileSync(bundleSrc, bundleDst);
let html = fs.readFileSync(indexPath, 'utf8');

// Classic script로 head에서 동기 실행해 Godot 엔진 시작 전 bridge를 보장합니다.
const tag = `<script src="./${bundleName}"></script>`;
if (!html.includes(tag)) {
  if (!html.includes('</head>')) throw new Error(`Closing </head> tag not found: ${indexPath}`);
  html = html.replace('</head>', `  ${tag}\n</head>`);
  fs.writeFileSync(indexPath, html);
}

// Dev Server 모드(AIT_BRIDGE_MOCK=1): 브리지 뒤에 devtools 플로팅 패널을 얹어
// mock 상태(권한·네트워크·IAP·광고 등)를 브라우저에서 조작한다. Unity SDK의
// Dev Server에 대응하는 개발 전용 모드다. 게임 배포 번들에는 포함되지 않는다.
if (withMock) {
  const panelSrc = path.join(bridgeDir, 'node_modules/@apps-in-toss/devtools/dist/panel/index.js');
  if (!fs.existsSync(panelSrc)) {
    throw new Error(`DevTools panel bundle not found: ${panelSrc}. Run npm install in bridge/.`);
  }
  fs.copyFileSync(panelSrc, path.join(exportDir, 'ait-devtools-panel.js'));
  if (!html.includes('ait-devtools-panel.js')) {
    const panelTag = '<script type="module" src="./ait-devtools-panel.js"></script>';
    html = html.replace('</head>', `  ${panelTag}\n</head>`);
    fs.writeFileSync(indexPath, html);
  }
  console.log('Dev Server mode: mock bridge + DevTools panel injected.');
}

console.log(`Patched ${indexPath}`);