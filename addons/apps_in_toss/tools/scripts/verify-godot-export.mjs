import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEBUG_CONSOLE_EXPORT_FILE, DEV_ONLY_EXPORT_FILES } from './export-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultExportDir = path.resolve(here, '../build/godot-web');
const exportDir = path.resolve(process.argv[2] ?? process.env.GODOT_EXPORT_DIR ?? defaultExportDir);
const projectDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? path.join(path.dirname(here), 'godot'));
const indexPath = path.join(exportDir, 'index.html');
// dev 모드(AIT_BRIDGE_MOCK=1)에서는 mock 브리지가 주입된다.
const withMock = process.env.AIT_BRIDGE_MOCK === '1';
// 테스트 빌드(build --debug-console, AIT_DEBUG_CONSOLE=1)에서만 debug-console을 허용한다.
const withDebugConsole = !withMock && process.env.AIT_DEBUG_CONSOLE === '1';
const bridgeName = withMock ? 'apps-in-toss-godot-bridge.mock.js' : 'apps-in-toss-godot-bridge.js';
const bridgePath = path.join(exportDir, bridgeName);
const manifestPath = path.join(exportDir, 'ait-platform-manifest.json');

if (!fs.existsSync(indexPath)) throw new Error(`index.html not found: ${indexPath}`);
if (!fs.existsSync(bridgePath)) throw new Error(`Godot bridge bundle not found: ${bridgePath}`);
if (!withMock && !fs.existsSync(manifestPath)) throw new Error(`AIT platform manifest not found: ${manifestPath}`);

let manifest;
try {
  manifest = withMock ? null : JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  throw new Error(`AIT platform manifest is not valid JSON: ${String(error)}`);
}
if (!withMock && (!manifest.platformVersion || !manifest.platformLockSha256)) {
  throw new Error('AIT platform manifest must include platformVersion and platformLockSha256.');
}
const lockPath = path.resolve(
  process.env.AIT_PLATFORM_LOCK ??
    (fs.existsSync(path.join(projectDir, '.ait/platform.lock.json'))
      ? path.join(projectDir, '.ait/platform.lock.json')
      : path.join(path.dirname(here), '.ait/platform.lock.json')),
);
if (!withMock && fs.existsSync(lockPath)) {
  const lockSha256 = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
  if (manifest.platformLockSha256 !== lockSha256) {
    throw new Error(
      `AIT platform manifest does not match ${lockPath}. Re-run npm run ait:manifest after changing the lock.`,
    );
  }
}

const entries = fs.readdirSync(exportDir, { withFileTypes: true });
const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
const wasm = files.find((file) => file.endsWith('.wasm'));
const pack = files.find((file) => file.endsWith('.pck'));
const threadedWorkers = files.filter((file) => file.endsWith('.worker.js'));

if (!wasm) throw new Error('Godot .wasm file is missing from the export.');
if (!pack) throw new Error('Godot .pck file is missing from the export.');
if (threadedWorkers.length > 0) {
  throw new Error(
    `Threaded Godot Web export is not supported by this Apps in Toss profile: ${threadedWorkers.join(', ')}. ` +
      'Disable Web export option variant/thread_support and export again.',
  );
}

const html = fs.readFileSync(indexPath, 'utf8');
// release 빌드에 개발 전용 파일(mock 브리지·DevTools 패널·debug-console)이 섞여 .ait로 나가지 않도록 여기서 막는다.
// 테스트 빌드는 debug-console 하나만 허용한다.
if (!withMock) {
  const forbidden = DEV_ONLY_EXPORT_FILES.filter(
    (file) => !(withDebugConsole && file === DEBUG_CONSOLE_EXPORT_FILE),
  );
  const devFile = forbidden.find((file) => fs.existsSync(path.join(exportDir, file)));
  const devRef = forbidden.find((file) => html.includes(file));
  const offender = devFile ?? devRef;
  if (offender) {
    throw new Error(
      `Release export에 개발 전용 파일이 포함되어 있습니다: ${offender}. release 빌드 전에 build/godot-web을 비우거나 다시 빌드하세요.`,
    );
  }
}
const bridgeTag = `<script src="./${bridgeName}"></script>`;
if (countOccurrences(html, bridgeTag) !== 1) {
  throw new Error('Apps in Toss Godot bridge script must appear exactly once in index.html.');
}
if (withDebugConsole) {
  const consoleTag = `<script src="./${DEBUG_CONSOLE_EXPORT_FILE}"></script>`;
  if (!fs.existsSync(path.join(exportDir, DEBUG_CONSOLE_EXPORT_FILE))) {
    throw new Error(`Debug console bundle not found: ${DEBUG_CONSOLE_EXPORT_FILE}. Run the test build again.`);
  }
  if (countOccurrences(html, consoleTag) !== 1) {
    throw new Error('Debug console script must appear exactly once in index.html.');
  }
  if (html.indexOf(consoleTag) < html.indexOf(bridgeTag)) {
    throw new Error('Debug console script must come after the Apps in Toss Godot bridge script.');
  }
  if (manifest.debugConsole !== true) {
    throw new Error('Test build manifest must record "debugConsole": true.');
  }
} else if (manifest?.debugConsole) {
  throw new Error(
    'AIT platform manifest records "debugConsole": true, but this is a release build. Rebuild without --debug-console.',
  );
}
if (/id=["']status-(?:splash|progress)["']/i.test(html)) {
  throw new Error(
    'Default Godot loading overlay detected. Configure html/custom_html_shell to use the Apps in Toss shell.',
  );
}
if (/<iframe\b/i.test(html)) throw new Error('iframe is not allowed in Apps in Toss bundles.');

const bridge = fs.readFileSync(bridgePath, 'utf8');
if (!bridge.includes('AppsInTossGodot')) throw new Error('Bridge bundle does not expose AppsInTossGodot.');
// debug-console은 별도 번들(ait-debug-console.js)로만 들어간다. 브리지 번들에 섞이면 막는다.
const debugConsoleMarker = ['__ait_debug_status', '/ait-attach'].find((marker) => bridge.includes(marker));
if (debugConsoleMarker) {
  throw new Error(`Bridge bundle contains debug-console code (${debugConsoleMarker}). Rebuild the bridge with npm run build.`);
}

const totalBytes = directorySize(exportDir);
// .ait는 압축 해제 기준 100MB 이하여야 콘솔에 올라간다(미니앱 등록하기·FAQ). 단위가 MB·MiB 중
// 무엇인지 문서에 없어서, 100MiB를 넘으면 실패하고 100MB(10^8 바이트)를 넘으면 경고한다.
const BUNDLE_LIMIT_MIB = 100 * 1024 * 1024;
const BUNDLE_LIMIT_MB = 100 * 1000 * 1000;
const sizeText = `${(totalBytes / 1024 / 1024).toFixed(2)} MiB`;
if (totalBytes > BUNDLE_LIMIT_MIB) {
  throw new Error(
    `Export is ${sizeText} uncompressed; Apps in Toss bundles must be 100MB or less uncompressed. ` +
      'Shrink textures/audio (VRAM compression, OGG for music) or move non-startup assets to a CDN.',
  );
}
if (totalBytes > BUNDLE_LIMIT_MB) {
  console.warn(`[AIT verify] WARN export is ${sizeText} uncompressed — close to the 100MB bundle limit.`);
}
console.log(`Verified Godot Apps in Toss bundle: ${files.length} files, ${sizeText} (limit 100MB uncompressed)`);

function directorySize(dir) {
  let sum = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sum += directorySize(full);
    else if (entry.isFile()) sum += fs.statSync(full).size;
  }
  return sum;
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}
