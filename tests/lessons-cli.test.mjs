// cat-room-godot에서 옮긴 CLI 규칙: doctor 검사(셸 확대 막기·McpBridge·.ait_relay·테스트 광고 ID·appType·tools/.gdignore),
// export 100MB 한도, addon:install의 .uid 보존, init의 appType·셸 템플릿·.gitignore, 템플릿과 예제의 일치.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkAppType,
  checkShellViewport,
  findMcpBridgeAutoload,
  findTestAdIdLines,
} from '../addons/apps_in_toss/tools/scripts/doctor-checks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const addonDir = path.join(repoRoot, 'addons/apps_in_toss');
const toolsDir = path.join(addonDir, 'tools');
const scriptsDir = path.join(toolsDir, 'scripts');
const shellTemplate = path.join(toolsDir, 'templates/custom_shell.html');

const cleanup = [];
afterEach(() => {
  while (cleanup.length > 0) fs.rmSync(cleanup.pop(), { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

function runNode(script, args, env, cwd) {
  const merged = { ...process.env, AIT_BRIDGE_MOCK: '', AIT_DEBUG_CONSOLE: '', ...env };
  for (const [key, value] of Object.entries(merged)) if (value === undefined) delete merged[key];
  const result = spawnSync(process.execPath, [script, ...args], { env: merged, cwd, encoding: 'utf8', timeout: 30_000 });
  assert.ifError(result.error);
  return result;
}

describe('doctor 검사 함수', () => {
  it('셸 템플릿은 확대 막기와 viewport-fit=cover를 갖춘다', () => {
    assert.deepEqual(checkShellViewport(fs.readFileSync(shellTemplate, 'utf8')), []);
  });

  it('기본 viewport meta는 확대 막기·viewport-fit 둘 다 알린다', () => {
    const problems = checkShellViewport('<meta name="viewport" content="width=device-width, initial-scale=1">');
    assert.equal(problems.length, 2);
    assert.match(problems[0], /user-scalable=no/);
    assert.match(problems[1], /viewport-fit=cover/);
  });

  it('viewport meta가 없으면 알린다', () => {
    assert.match(checkShellViewport('<html><head></head></html>')[0], /viewport meta가 없습니다/);
  });

  it('속성 순서·공백이 달라도 통과한다', () => {
    const html = "<meta content='viewport-fit=cover,user-scalable=0, maximum-scale=1 ,width=device-width' name='viewport'>";
    assert.deepEqual(checkShellViewport(html), []);
  });

  it('McpBridge 오토로드 줄을 찾는다', () => {
    const text = '[autoload]\n\nAIT="*res://addons/apps_in_toss/ait.gd"\nMcpBridge="*res://.mcp/godot-runtime/scripts/x.gd"\n';
    assert.match(findMcpBridgeAutoload(text), /^McpBridge=/);
    assert.equal(findMcpBridgeAutoload('[autoload]\nAIT="*res://addons/apps_in_toss/ait.gd"\n'), null);
  });

  it('테스트 광고 그룹 ID 줄 번호를 돌려준다', () => {
    assert.deepEqual(findTestAdIdLines('a\nconst AD := "ait-ad-test-rewarded-id"\nb\n"ait-ad-test-banner-id"'), [2, 4]);
    assert.deepEqual(findTestAdIdLines('const AD := "real-group-id"'), []);
  });

  it('appType 조합을 검사한다', () => {
    assert.match(checkAppType({})[0], /appType이 없습니다/);
    assert.deepEqual(checkAppType({ appType: 'game' }), []);
    assert.deepEqual(checkAppType({ appType: 'nongame' }), []);
    assert.match(checkAppType({ appType: 'nongame', navigationBar: { withBackButton: false } })[0], /withBackButton이 false/);
  });
});

// doctor를 돌릴 최소 게임 폴더. 이 검사와 상관없는 오류(Godot 실행 파일 없음 등)는 결과 문구로만 가린다.
function makeGame({ projectExtra = '', shell = null, manifestExtra = {}, gdFiles = {}, installedAddon = false } = {}) {
  const gameDir = tempDir('ait-lessons-game-');
  fs.mkdirSync(path.join(gameDir, '.ait'), { recursive: true });
  fs.copyFileSync(path.join(toolsDir, 'templates/platform.lock.json'), path.join(gameDir, '.ait/platform.lock.json'));
  const manifest = JSON.parse(fs.readFileSync(path.join(toolsDir, 'templates/game.manifest.example.json'), 'utf8'));
  fs.writeFileSync(
    path.join(gameDir, '.ait/game.manifest.json'),
    JSON.stringify({ ...manifest, gameId: 'lessons-test', ...manifestExtra }, null, 2),
  );
  fs.writeFileSync(
    path.join(gameDir, 'project.godot'),
    'config_version=5\n\n[application]\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\n\n' +
      `[autoload]\n\nAIT="*res://addons/apps_in_toss/ait.gd"\n${projectExtra}\n`,
  );
  if (shell !== null) {
    fs.writeFileSync(path.join(gameDir, 'custom_shell.html'), shell);
    fs.writeFileSync(
      path.join(gameDir, 'export_presets.cfg'),
      '[preset.0]\n\nname="Apps in Toss Web"\nplatform="Web"\n\n[preset.0.options]\n\n' +
        'variant/thread_support=false\nhtml/custom_html_shell="res://custom_shell.html"\n',
    );
  }
  for (const [rel, text] of Object.entries(gdFiles)) {
    fs.mkdirSync(path.dirname(path.join(gameDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(gameDir, rel), text);
  }
  if (installedAddon) {
    const target = path.join(gameDir, 'addons/apps_in_toss');
    fs.mkdirSync(path.join(target, 'tools'), { recursive: true });
    fs.copyFileSync(path.join(addonDir, 'plugin.cfg'), path.join(target, 'plugin.cfg'));
  }
  return gameDir;
}

function runDoctor(gameDir, strict = true) {
  const result = runNode(path.join(scriptsDir, 'ait-doctor.mjs'), strict ? ['--strict'] : [], {
    GODOT_PROJECT_DIR: gameDir,
    GODOT_EXPORT_DIR: undefined,
    AIT_ADDON_DIR: addonDir,
    AIT_BRIDGE_DIR: path.join(toolsDir, 'bridge'),
    AIT_PLATFORM_LOCK: undefined,
    AIT_PLATFORM_STRICT: strict ? '1' : '',
    GODOT_BIN: path.join(gameDir, 'no-godot'),
  });
  return { ...result, all: `${result.stdout}\n${result.stderr}` };
}

describe('doctor 통합', () => {
  it('McpBridge 오토로드는 strict에서 오류, advisory에서 경고', () => {
    const gameDir = makeGame({ projectExtra: 'McpBridge="*res://.mcp/godot-runtime/scripts/a.gd"' });
    assert.match(runDoctor(gameDir, true).stderr, /ERROR project\.godot has a Godot MCP autoload \(McpBridge=/);
    const advisory = runDoctor(gameDir, false);
    assert.match(advisory.stderr, /WARN project\.godot has a Godot MCP autoload/);
  });

  it('McpBridge가 없으면 그 문구가 없다', () => {
    assert.doesNotMatch(runDoctor(makeGame()).all, /Godot MCP autoload/);
  });

  it('셸 viewport meta가 확대를 허용하면 경고한다', () => {
    const gameDir = makeGame({ shell: '<meta name="viewport" content="width=device-width, initial-scale=1">$GODOT_URL' });
    const { stderr } = runDoctor(gameDir);
    assert.match(stderr, /WARN res:\/\/custom_shell\.html: viewport meta에 maximum-scale=1, user-scalable=no가 없어/);
    assert.match(stderr, /viewport-fit=cover가 없어/);
  });

  it('셸 템플릿이면 viewport 경고가 없다', () => {
    const gameDir = makeGame({ shell: fs.readFileSync(shellTemplate, 'utf8') });
    assert.doesNotMatch(runDoctor(gameDir).all, /viewport meta/);
  });

  it('게임 스크립트의 테스트 광고 ID를 경고한다(줄 번호와 함께)', () => {
    const gameDir = makeGame({ gdFiles: { 'scripts/catalog.gd': 'extends Node\nconst AD := "ait-ad-test-rewarded-id"\n' } });
    assert.match(runDoctor(gameDir).stderr, /WARN scripts\/catalog\.gd:2 has a test ad group ID/);
  });

  it('appType이 없으면 경고한다', () => {
    const gameDir = makeGame({ manifestExtra: { appType: undefined } });
    assert.match(runDoctor(gameDir).stderr, /appType이 없습니다/);
    assert.doesNotMatch(runDoctor(makeGame()).all, /appType이 없습니다/);
  });

  it('설치된 애드온에 tools/.gdignore가 없으면 경고한다', () => {
    const gameDir = makeGame({ installedAddon: true });
    assert.match(runDoctor(gameDir).stderr, /tools\/\.gdignore is missing/);
    fs.writeFileSync(path.join(gameDir, 'addons/apps_in_toss/tools/.gdignore'), '');
    assert.doesNotMatch(runDoctor(gameDir).all, /tools\/\.gdignore is missing/);
  });

  it('.ait_relay가 git에서 무시되지 않으면 경고한다', (t) => {
    const gameDir = makeGame();
    const init = spawnSync('git', ['init', '-q', gameDir], { encoding: 'utf8' });
    if (init.error || init.status !== 0) {
      t.skip('git을 쓸 수 없음');
      return;
    }
    fs.writeFileSync(path.join(gameDir, '.ait_relay'), 'not-a-real-secret');
    assert.match(runDoctor(gameDir).stderr, /\.ait_relay .* is not ignored by git/);
    fs.writeFileSync(path.join(gameDir, '.gitignore'), '.ait_relay\n');
    assert.doesNotMatch(runDoctor(gameDir).all, /not ignored by git/);
  });
});

describe('export 크기 한도(압축 해제 100MB)', () => {
  function makeExport(pckBytes) {
    const exportDir = tempDir('ait-lessons-export-');
    fs.writeFileSync(
      path.join(exportDir, 'index.html'),
      '<!doctype html><html><head><script src="./apps-in-toss-godot-bridge.js"></script></head><body></body></html>',
    );
    fs.writeFileSync(path.join(exportDir, 'apps-in-toss-godot-bridge.js'), 'window.AppsInTossGodot = {};\n');
    fs.writeFileSync(path.join(exportDir, 'game.wasm'), 'wasm');
    const pck = path.join(exportDir, 'game.pck');
    fs.writeFileSync(pck, '');
    fs.truncateSync(pck, pckBytes); // 빈 공간만 잡는 파일이라 빠르다
    const lockPath = path.join(tempDir('ait-lessons-lock-'), 'platform.lock.json');
    fs.writeFileSync(lockPath, 'lock');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
    fs.writeFileSync(
      path.join(exportDir, 'ait-platform-manifest.json'),
      JSON.stringify({ platformVersion: 'x', platformLockSha256: sha }),
    );
    return { exportDir, lockPath };
  }

  function verify({ exportDir, lockPath }) {
    return runNode(path.join(scriptsDir, 'verify-godot-export.mjs'), [], {
      GODOT_EXPORT_DIR: exportDir,
      AIT_PLATFORM_LOCK: lockPath,
    });
  }

  it('작은 번들은 크기와 한도를 출력하고 통과한다', () => {
    const result = verify(makeExport(1024));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /limit 100MB uncompressed/);
  });

  it('100MiB를 넘으면 실패한다', () => {
    const result = verify(makeExport(101 * 1024 * 1024));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be 100MB or less uncompressed/);
  });

  it('100MB(10^8)와 100MiB 사이면 경고만 한다', () => {
    const result = verify(makeExport(100 * 1000 * 1000 + 1024));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /close to the 100MB bundle limit/);
  });
});

describe('addon:install .uid 보존', () => {
  it('SDK에 없는 게임 쪽 .uid는 지키고, SDK가 배포한 .uid는 SDK 값으로 바꾼다', () => {
    const sdkRoot = tempDir('ait-lessons-sdk-');
    const sdkAddon = path.join(sdkRoot, 'addons/apps_in_toss');
    fs.mkdirSync(path.join(sdkAddon, 'ui'), { recursive: true });
    fs.writeFileSync(path.join(sdkAddon, 'plugin.cfg'), '[plugin]\nname="x"\nversion="0.3.0"\n');
    fs.writeFileSync(path.join(sdkAddon, 'ait.gd'), 'extends Node\n');
    fs.writeFileSync(path.join(sdkAddon, 'ait.gd.uid'), 'uid://sdk');
    fs.writeFileSync(path.join(sdkAddon, 'ui/new.gd'), 'extends Node\n');

    const gameDir = tempDir('ait-lessons-install-');
    fs.writeFileSync(path.join(gameDir, 'project.godot'), 'config_version=5\n');
    const target = path.join(gameDir, 'addons/apps_in_toss');
    fs.mkdirSync(path.join(target, 'ui'), { recursive: true });
    fs.writeFileSync(path.join(target, 'plugin.cfg'), '[plugin]\nname="x"\nversion="0.2.0"\n');
    fs.writeFileSync(path.join(target, 'ait.gd.uid'), 'uid://game-old');
    fs.writeFileSync(path.join(target, 'ui/new.gd.uid'), 'uid://game-kept');
    fs.writeFileSync(path.join(target, 'gone.gd.uid'), 'uid://gone');

    const result = runNode(path.join(scriptsDir, 'pipeline-addon.mjs'), ['--force'], {
      GODOT_PROJECT_DIR: gameDir,
      GODOT_SDK_DIR: sdkRoot,
      AIT_ADDON_DIR: undefined,
    }, gameDir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(target, 'ait.gd.uid'), 'utf8'), 'uid://sdk');
    assert.equal(fs.readFileSync(path.join(target, 'ui/new.gd.uid'), 'utf8'), 'uid://game-kept');
    assert.equal(fs.existsSync(path.join(target, 'gone.gd.uid')), false, '스크립트가 없어진 .uid는 되살리지 않는다');
    assert.match(result.stdout, /\.uid 1개를 그대로 두었습니다/);
  });
});

describe('init', () => {
  function runInit(gameDir, extra = []) {
    return runNode(path.join(toolsDir, 'ait-godot.mjs'), ['init', 'lessons-game', '레슨 게임', ...extra], {
      GODOT_PROJECT_DIR: gameDir,
    }, gameDir);
  }

  function makeProject() {
    const gameDir = tempDir('ait-lessons-init-');
    fs.writeFileSync(path.join(gameDir, 'project.godot'), 'config_version=5\n');
    return gameDir;
  }

  it('기본은 appType game, 셸 템플릿과 .gitignore 줄을 만든다', () => {
    const gameDir = makeProject();
    const result = runInit(gameDir);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/game.manifest.json'), 'utf8'));
    assert.equal(manifest.appType, 'game');
    assert.equal(manifest.gameId, 'lessons-game');
    assert.equal(manifest.displayName, '레슨 게임');
    assert.equal(
      fs.readFileSync(path.join(gameDir, 'custom_shell.html'), 'utf8'),
      fs.readFileSync(shellTemplate, 'utf8'),
    );
    const ignore = fs.readFileSync(path.join(gameDir, '.gitignore'), 'utf8');
    for (const line of ['.godot/', 'build/', '*.ait', '!.ait/', '.ait_relay', '.mcp/']) {
      assert.ok(ignore.split('\n').includes(line), `${line} in .gitignore`);
    }
  });

  it('--nongame이면 appType nongame', () => {
    const gameDir = makeProject();
    assert.equal(runInit(gameDir, ['--nongame']).status, 0);
    const manifest = JSON.parse(fs.readFileSync(path.join(gameDir, '.ait/game.manifest.json'), 'utf8'));
    assert.equal(manifest.appType, 'nongame');
  });

  it('있는 custom_shell.html과 .gitignore 줄은 그대로 두고, 다시 실행해도 줄을 겹쳐 넣지 않는다', () => {
    const gameDir = makeProject();
    fs.writeFileSync(path.join(gameDir, 'custom_shell.html'), 'my shell');
    fs.writeFileSync(path.join(gameDir, '.gitignore'), 'node_modules\n.godot/');
    assert.equal(runInit(gameDir).status, 0);
    assert.equal(runInit(gameDir).status, 0);
    assert.equal(fs.readFileSync(path.join(gameDir, 'custom_shell.html'), 'utf8'), 'my shell');
    const lines = fs.readFileSync(path.join(gameDir, '.gitignore'), 'utf8').split('\n');
    assert.equal(lines[0], 'node_modules');
    assert.equal(lines.filter((line) => line === '.godot/').length, 1);
    assert.equal(lines.filter((line) => line === '.ait_relay').length, 1);
  });

  it('.gitignore 줄을 지키면 .ait/ 매니페스트는 무시되지 않는다', (t) => {
    const gameDir = makeProject();
    assert.equal(runInit(gameDir).status, 0);
    const init = spawnSync('git', ['init', '-q', gameDir], { encoding: 'utf8' });
    if (init.error || init.status !== 0) {
      t.skip('git을 쓸 수 없음');
      return;
    }
    const check = (rel) => spawnSync('git', ['-C', gameDir, 'check-ignore', '-q', rel]).status;
    assert.equal(check('.ait/game.manifest.json'), 1, '.ait/ 매니페스트는 커밋돼야 한다');
    assert.equal(check('lessons-game.ait'), 0);
    assert.equal(check('.ait_relay'), 0);
  });
});

describe('배포 파일', () => {
  it('문서 예제 셸은 init 템플릿과 같다', () => {
    assert.equal(
      fs.readFileSync(path.join(repoRoot, 'docs/examples/custom-shell.html'), 'utf8'),
      fs.readFileSync(shellTemplate, 'utf8'),
    );
  });

  it('셸 템플릿은 Godot 기본 로딩 화면 id를 쓰지 않는다(release 검증 통과)', () => {
    assert.doesNotMatch(fs.readFileSync(shellTemplate, 'utf8'), /id=["']status-(?:splash|progress)["']/i);
  });

  it('tools/.gdignore를 배포한다', () => {
    assert.ok(fs.existsSync(path.join(toolsDir, '.gdignore')));
  });

  it('tools 밖의 모든 애드온 스크립트에 .uid가 있다', () => {
    const missing = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (full !== toolsDir) walk(full);
        } else if (entry.name.endsWith('.gd') && !fs.existsSync(`${full}.uid`)) {
          missing.push(path.relative(addonDir, full));
        }
      }
    };
    walk(addonDir);
    assert.deepEqual(missing, []);
  });
});
