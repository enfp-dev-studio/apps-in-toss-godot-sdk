import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultExportDir = path.resolve(here, '../build/godot-web');
const exportDir = path.resolve(process.argv[2] ?? process.env.GODOT_EXPORT_DIR ?? defaultExportDir);
const projectDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? path.join(path.dirname(here), 'godot'));
const indexPath = path.join(exportDir, 'index.html');
const bridgePath = path.join(exportDir, 'apps-in-toss-godot-bridge.js');
const manifestPath = path.join(exportDir, 'ait-platform-manifest.json');

if (!fs.existsSync(indexPath)) throw new Error(`index.html not found: ${indexPath}`);
if (!fs.existsSync(bridgePath)) throw new Error(`Godot bridge bundle not found: ${bridgePath}`);
if (!fs.existsSync(manifestPath)) throw new Error(`AIT platform manifest not found: ${manifestPath}`);

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  throw new Error(`AIT platform manifest is not valid JSON: ${String(error)}`);
}
if (!manifest.platformVersion || !manifest.platformLockSha256) {
  throw new Error('AIT platform manifest must include platformVersion and platformLockSha256.');
}
const lockPath = path.resolve(
  process.env.AIT_PLATFORM_LOCK ??
    (fs.existsSync(path.join(projectDir, '.ait/platform.lock.json'))
      ? path.join(projectDir, '.ait/platform.lock.json')
      : path.join(path.dirname(here), '.ait/platform.lock.json')),
);
if (fs.existsSync(lockPath)) {
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
const bridgeTag = '<script src="./apps-in-toss-godot-bridge.js"></script>';
if ((html.match(new RegExp(bridgeTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length !== 1) {
  throw new Error('Apps in Toss Godot bridge script must appear exactly once in index.html.');
}
if (/id=["']status-(?:splash|progress)["']/i.test(html)) {
  throw new Error(
    'Default Godot loading overlay detected. Configure html/custom_html_shell to use the Apps in Toss shell.',
  );
}
if (/<iframe\b/i.test(html)) throw new Error('iframe is not allowed in Apps in Toss bundles.');

const bridge = fs.readFileSync(bridgePath, 'utf8');
if (!bridge.includes('AppsInTossGodot')) throw new Error('Bridge bundle does not expose AppsInTossGodot.');

const totalBytes = files.reduce((sum, file) => sum + fs.statSync(path.join(exportDir, file)).size, 0);
console.log(`Verified Godot Apps in Toss bundle: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
