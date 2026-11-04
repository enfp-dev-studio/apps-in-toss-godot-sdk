// 출시 빌드 프리셋 확인 — 출시 .ait는 lock의 출시 프리셋(godot.web.exportPreset)으로만 만든다.
// 셸에 남은 GODOT_EXPORT_PRESET(개발 도구 프리셋 등)이 조용히 출시 .ait를 만들지 않게 build 처음에 멈춘다.
// 테스트 빌드(--debug-console, AIT_DEBUG_CONSOLE=1)는 개발 도구 프리셋을 쓸 수 있다(설치 가이드).
// 의도한 경우에만 AIT_ALLOW_EXPORT_PRESET=1로 허용한다.
import fs from 'node:fs';
import path from 'node:path';

const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const lockPath = path.join(gameDir, '.ait/platform.lock.json');
const lockPreset = fs.existsSync(lockPath)
  ? JSON.parse(fs.readFileSync(lockPath, 'utf8')).godot?.web?.exportPreset ?? 'Apps in Toss Web'
  : 'Apps in Toss Web';
const override = process.env.GODOT_EXPORT_PRESET;
const testBuild = process.env.AIT_DEBUG_CONSOLE === '1';

if (!testBuild && override && override !== lockPreset && process.env.AIT_ALLOW_EXPORT_PRESET !== '1') {
  console.error(
    `[ait-godot] GODOT_EXPORT_PRESET="${override}"가 설정돼 있습니다. 출시 빌드는 "${lockPreset}" 프리셋으로만 만듭니다. ` +
      '셸에서 unset GODOT_EXPORT_PRESET 하거나, 의도했다면 AIT_ALLOW_EXPORT_PRESET=1을 주세요.',
  );
  process.exit(1);
}
console.log(`[ait-godot] export 프리셋: ${override ?? lockPreset}${testBuild ? ' (테스트 빌드)' : ''}`);
