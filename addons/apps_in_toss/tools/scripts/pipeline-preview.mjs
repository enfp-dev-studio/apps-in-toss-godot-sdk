#!/usr/bin/env node
// ait-godot preview 서빙 스크립트 — SDK bridge에 설치된 vite를 사용한다.
// Unity Dev Server의 "빌드 → 로컬 서빙"에 대응하는 마지막 단계.
//
// vite를 node_modules/.bin 셔뱅 스크립트로 실행하지 않는다 — GUI Godot은 최소
// PATH만 갖고 오기 때문에 #!/usr/bin/env node 해석이 실패할 수 있다. 대신
// node_modules/vite/bin/vite.js를 현재 node(process.execPath)로 직접 실행한다.
// 이 스크립트 자체가 ait-godot(node)에 의해 실행되므로 execPath는 항상 유효하다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const exportDir = path.resolve(process.env.GODOT_EXPORT_DIR ?? path.join(gameDir, 'build/godot-web'));

if (!fs.existsSync(path.join(exportDir, 'index.html'))) {
  console.error(`[ait-godot preview] export를 찾을 수 없습니다: ${exportDir}\n먼저 "ait-godot build:dev"를 실행하세요.`);
  process.exit(1);
}

/** vite의 실제 JS 진입점(node_modules/vite/bin/vite.js) 절대 경로를 찾는다. */
function resolveViteEntry() {
  const roots = [
    gameDir,
    process.env.AIT_BRIDGE_DIR ? path.resolve(process.env.AIT_BRIDGE_DIR) : null,
    path.resolve(gameDir, '..', 'apps-in-toss-godot-sdk', 'bridge'),
  ].filter(Boolean);
  const cache = path.join(os.tmpdir(), 'ait-godot-sdk');
  try {
    for (const entry of fs.readdirSync(cache)) {
      if (!entry.endsWith('.tmp')) {
        roots.push(path.join(cache, entry, 'bridge'));
      }
    }
  } catch {}
  for (const base of roots) {
    const candidate = path.join(base, 'node_modules/vite/bin/vite.js');
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error(
    '[ait-godot preview] vite를 찾을 수 없습니다.\n' +
      'ait-godot build:dev를 먼저 실행하면 SDK bridge에 의존성이 설치됩니다.'
  );
  process.exit(1);
}

const viteEntry = resolveViteEntry();
// process.execPath = 지금 이 스크립트를 실행 중인 node 자신. PATH 불필요.
// 매니페스트 preview: { host, port }(Unity Configuration의 서버 호스트·포트 대응). 포트가 차 있으면 vite가 다음 포트를 쓴다.
const manifestPath = path.join(gameDir, '.ait/game.manifest.json');
const preview = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).preview ?? {} : {};
const host = preview.host ?? '0.0.0.0';
const port = preview.port ?? 5173;
if (typeof host !== 'string' || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('[ait-godot preview] 매니페스트 preview는 { "host": 문자열, "port": 1~65535 }여야 합니다.');
  process.exit(1);
}
console.log(`[ait-godot preview] http://localhost:${port}/ (vite: ${viteEntry})`);
const result = spawnSync(process.execPath, [viteEntry, exportDir, '--host', host, '--port', String(port)], {
  cwd: gameDir,
  stdio: 'inherit',
});
if (result.error) {
  console.error(`[ait-godot preview] ${String(result.error)}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
