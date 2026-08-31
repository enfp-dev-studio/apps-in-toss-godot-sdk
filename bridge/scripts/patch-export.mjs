import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bridgeDir = path.resolve(here, '..');
const root = path.resolve(bridgeDir, '../..');

const defaultExportDir = path.join(root, 'build/godot-web');
const exportDir = path.resolve(process.argv[2] ?? process.env.GODOT_EXPORT_DIR ?? defaultExportDir);

const indexPath = path.join(exportDir, 'index.html');
const bundleSrc = path.join(bridgeDir, 'dist/apps-in-toss-godot-bridge.js');
const bundleDst = path.join(exportDir, 'apps-in-toss-godot-bridge.js');

if (!fs.existsSync(indexPath)) throw new Error(`index.html not found: ${indexPath}`);
if (!fs.existsSync(bundleSrc)) throw new Error(`Bridge bundle not found: ${bundleSrc}. Run npm run build first.`);

fs.copyFileSync(bundleSrc, bundleDst);
let html = fs.readFileSync(indexPath, 'utf8');
// Classic script로 head에서 동기 실행해 Godot 엔진 시작 전 bridge를 보장합니다.
const tag = '<script src="./apps-in-toss-godot-bridge.js"></script>';
if (!html.includes(tag)) {
  if (!html.includes('</head>')) throw new Error(`Closing </head> tag not found: ${indexPath}`);
  html = html.replace('</head>', `  ${tag}\n</head>`);
  fs.writeFileSync(indexPath, html);
}
console.log(`Patched ${indexPath}`);
