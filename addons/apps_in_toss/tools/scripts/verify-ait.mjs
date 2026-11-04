// 최종 .ait 검사 — export 폴더가 아니라 콘솔에 올릴 .ait를 직접 열어 본다.
// export 폴더 검사(verify-godot-export.mjs) 뒤에 다른 빌드가 .ait를 덮어쓰거나,
// 셸에 남은 GODOT_EXPORT_PRESET 때문에 개발 프리셋으로 묶인 경우를 여기서 잡는다.
//
//   node verify-ait.mjs [<게임>.ait]   (기본: <게임 폴더>/<gameId>.ait)
//   ait-godot verify-ait [<게임>.ait]
//
// 실패: ait-godot build의 플랫폼 매니페스트 없음, 출시 프리셋이 아님, 개발 전용 파일이나 그 <script src>,
//       검수가 반려하는 "eval"·Function 생성자 글자(게임 package.json인 project-package.json 포함).
// 경고: 테스트 빌드(--debug-console), 빌드 도장 없음, 지금 export 폴더와 다른 .ait.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DEBUG_CONSOLE_EXPORT_FILE, DEV_ONLY_EXPORT_FILES } from './export-dir.mjs';
import { formatFindings, isTextFile, referencesScript, scanReleaseText } from './release-scan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const SOURCES = 'sources/';
const PLATFORM_MANIFEST = 'ait-platform-manifest.json';

function fail(message) {
  console.error(`[AIT verify-ait] ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// .ait 포맷 리더는 토스 CLI가 쓰는 @apps-in-toss/ait-format이다(브리지 의존성에 들어 있다).
function loadReader() {
  const candidates = [
    process.env.AIT_BRIDGE_DIR,
    process.env.GODOT_SDK_DIR && path.join(process.env.GODOT_SDK_DIR, 'bridge'),
    path.resolve(here, '../bridge'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      return createRequire(path.join(dir, 'package.json'))('@apps-in-toss/ait-format').AITReader;
    } catch {
      // 다음 후보
    }
  }
  fail(`@apps-in-toss/ait-format을 찾지 못했습니다. 브리지 의존성을 설치하세요: npm --prefix addons/apps_in_toss/tools/bridge ci`);
}

const manifestPath = path.join(gameDir, '.ait/game.manifest.json');
const gameId = fs.existsSync(manifestPath) ? readJson(manifestPath).gameId : null;
const aitPath = path.resolve(process.argv[2] ?? path.join(gameDir, `${gameId ?? 'game'}.ait`));
if (!fs.existsSync(aitPath)) fail(`.ait 파일이 없습니다: ${aitPath} — ait-godot build로 먼저 만드세요.`);

const lockPath = path.join(gameDir, '.ait/platform.lock.json');
const releasePreset = fs.existsSync(lockPath)
  ? readJson(lockPath).godot?.web?.exportPreset ?? 'Apps in Toss Web'
  : 'Apps in Toss Web';

const AITReader = loadReader();
let reader;
try {
  reader = AITReader.fromBuffer(new Uint8Array(fs.readFileSync(aitPath)));
} catch (error) {
  fail(`.ait를 열 수 없습니다: ${aitPath} (${error.message})`);
}

const decoder = new TextDecoder();
const entries = reader.listEntries();
const readText = async (name) => decoder.decode(await reader.readEntry(name));
const errors = [];
const warnings = [];

const manifestEntry = `${SOURCES}${PLATFORM_MANIFEST}`;
let platformManifest = null;
if (!entries.includes(manifestEntry)) {
  errors.push(`${manifestEntry}가 없습니다 — ait-godot build로 만든 .ait가 아닙니다(개발 빌드나 다른 도구의 결과일 수 있습니다).`);
} else {
  try {
    platformManifest = JSON.parse(await readText(manifestEntry));
  } catch (error) {
    errors.push(`${manifestEntry}가 올바른 JSON이 아닙니다 (${error.message}).`);
  }
}

const isTestBuild = platformManifest?.debugConsole === true;
if (platformManifest) {
  if (!platformManifest.exportPreset) {
    warnings.push('플랫폼 매니페스트에 exportPreset이 없습니다(이전 SDK로 만든 빌드). 다시 build하면 기록됩니다.');
  } else if (platformManifest.exportPreset !== releasePreset) {
    // 테스트 빌드는 개발 도구 프리셋을 쓸 수 있다(설치 가이드). 출시 빌드만 막는다.
    (isTestBuild ? warnings : errors).push(`"${platformManifest.exportPreset}" 프리셋으로 내보낸 .ait입니다. 출시 프리셋은 "${releasePreset}"입니다 — 셸의 GODOT_EXPORT_PRESET을 지우고 다시 build하세요.`);
  }
  if (!platformManifest.build?.time) warnings.push('빌드 도장(build.time)이 없습니다. 다시 build하면 기록됩니다.');
}

// 개발 전용 파일 — 테스트 빌드만 debug-console 하나를 허용한다.
const forbidden = DEV_ONLY_EXPORT_FILES.filter((file) => !(isTestBuild && file === DEBUG_CONSOLE_EXPORT_FILE));
for (const entry of entries) {
  if (forbidden.includes(path.posix.basename(entry))) errors.push(`개발 전용 파일이 들어 있습니다: ${entry}`);
}
const indexEntry = `${SOURCES}index.html`;
if (!entries.includes(indexEntry)) {
  errors.push(`${indexEntry}가 없습니다.`);
} else {
  const html = await readText(indexEntry);
  for (const file of forbidden) {
    if (referencesScript(html, file)) errors.push(`${indexEntry}가 개발 전용 스크립트를 불러옵니다: ${file}`);
  }
}

// 검수가 반려하는 글자 — .ait 안의 모든 글자 파일(bundle.json, project-package.json 포함).
const findings = [];
for (const entry of entries) {
  if (isTextFile(entry)) findings.push(...scanReleaseText(entry, await readText(entry)));
}
if (findings.length > 0) {
  errors.push(`검수가 외부 코드 실행으로 반려하는 글자("eval"·Function 생성자)가 있습니다:\n${formatFindings(findings)}`);
}

// 지금 export 폴더와 같은 빌드인지
const exportManifestPath = path.join(gameDir, 'build/godot-web', PLATFORM_MANIFEST);
if (platformManifest && fs.existsSync(exportManifestPath)) {
  const exported = readJson(exportManifestPath);
  if (exported.build?.time && platformManifest.build?.time && exported.build.time !== platformManifest.build.time) {
    warnings.push(`.ait의 빌드(${platformManifest.build.time})가 지금 build/godot-web(${exported.build.time})과 다릅니다. 다른 빌드가 덮어썼는지 확인하세요.`);
  }
}
if (isTestBuild) {
  warnings.push('테스트 빌드(--debug-console)입니다. 실기기 원격 디버깅이 들어 있으니 검수에 제출하지 마세요.');
}

const shown = path.relative(gameDir, aitPath) || aitPath;
for (const warning of warnings) console.warn(`[AIT verify-ait] WARN ${warning}`);
for (const error of errors) console.error(`[AIT verify-ait] ERROR ${error}`);
if (errors.length > 0) fail(`${shown}: ${errors.length}개 문제 — 이 .ait는 올리지 마세요.`);
const stamp = platformManifest?.build;
console.log(
  `[AIT verify-ait] ${shown}: ${entries.length}개 항목 통과` +
    (stamp ? ` (빌드 ${stamp.time}${stamp.commit ? ` ${stamp.commit}${stamp.dirty ? '+수정' : ''}` : ''}${stamp.label ? ` ${stamp.label}` : ''})` : ''),
);
