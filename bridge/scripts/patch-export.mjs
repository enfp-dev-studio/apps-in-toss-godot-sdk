import fs from 'node:fs';
import path from 'node:path';

const exportDir = process.argv[2];
if (!exportDir) {
  console.error('Usage: npm run patch -- /path/to/godot-web-export');
  process.exit(1);
}

const indexPath = path.join(exportDir, 'index.html');
const bundleSrc = path.resolve('dist/apps-in-toss-godot-bridge.js');
const bundleDst = path.join(exportDir, 'apps-in-toss-godot-bridge.js');

if (!fs.existsSync(indexPath)) throw new Error(`index.html not found: ${indexPath}`);
if (!fs.existsSync(bundleSrc)) throw new Error(`Bridge bundle not found: ${bundleSrc}. Run npm run build first.`);

fs.copyFileSync(bundleSrc, bundleDst);
let html = fs.readFileSync(indexPath, 'utf8');
const tag = '<script type="module" src="./apps-in-toss-godot-bridge.js"></script>';
if (!html.includes(tag)) {
  html = html.replace('</head>', `  ${tag}\n</head>`);
  fs.writeFileSync(indexPath, html);
}
console.log(`Patched ${indexPath}`);
