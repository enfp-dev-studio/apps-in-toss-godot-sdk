// ait-godot deploy(Unity Deploy for Online Test / Release Candidate 대응): 가짜 ait로 메모·인자·QR·결과 파일과
// 토큰 없음·인증 실패·테스트 빌드 RC 막기를 본다. 실제 콘솔에는 올리지 않는다.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const script = path.join(repoRoot, 'addons/apps_in_toss/tools/scripts/pipeline-deploy.mjs');
const cleanup = [];
afterEach(() => { while (cleanup.length) fs.rmSync(cleanup.pop(), { recursive: true, force: true }); });
const temp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); cleanup.push(d); return d; };

function setup({ debugConsole = false, token = true, fakeExit = 0, fakeOut = 'intoss-private://my-game?_deploymentId=dep-123&host=appsInTossHost' } = {}) {
  const game = temp('ait-deploy-game-');
  fs.mkdirSync(path.join(game, '.ait'));
  fs.mkdirSync(path.join(game, 'build/godot-web'), { recursive: true });
  fs.writeFileSync(path.join(game, '.ait/game.manifest.json'), JSON.stringify({ gameId: 'my-game', gameVersion: '1.2.0', displayName: '내 게임' }));
  fs.writeFileSync(path.join(game, 'my-game.ait'), 'ait');
  fs.writeFileSync(path.join(game, 'build/godot-web/ait-platform-manifest.json'), JSON.stringify(debugConsole ? { debugConsole: true } : {}));
  const home = temp('ait-deploy-home-');
  if (token) { fs.mkdirSync(path.join(home, '.ait')); fs.writeFileSync(path.join(home, '.ait/credentials'), '[default]\n'); }
  const bin = path.join(temp('ait-deploy-bin-'), 'ait');
  const record = path.join(path.dirname(bin), 'args.json');
  fs.writeFileSync(bin, `#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(record)}, JSON.stringify(process.argv.slice(2)));\nconsole.log(${JSON.stringify(fakeOut)});\nprocess.exit(${fakeExit});\n`);
  fs.chmodSync(bin, 0o755);
  return { game, home, bin, record };
}

function run({ game, home, bin }, extra = []) {
  return spawnSync(process.execPath, [script, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, GODOT_PROJECT_DIR: game, AIT_BRIDGE_DIR: path.join(repoRoot, 'bridge'), AIT_BIN: bin },
  });
}

describe('ait-godot deploy', () => {
  it('online test: scheme-only deploy with memo, QR png and result json', () => {
    const ctx = setup();
    const result = run(ctx);
    assert.equal(result.status, 0, result.stderr);
    const argv = JSON.parse(fs.readFileSync(ctx.record, 'utf8'));
    assert.deepEqual(argv.slice(0, 4), ['deploy', '--scheme-only', '--location', path.join(ctx.game, 'my-game.ait')]);
    assert.equal(argv[4], '-m');
    assert.match(argv[5], /^\[Test\] 내 게임 v1\.2\.0 · Godot SDK \d+\.\d+\.\d+ · \d{4}-\d\d-\d\d \d\d:\d\d$/);
    const saved = JSON.parse(fs.readFileSync(path.join(ctx.game, 'build/deploy-result.json'), 'utf8'));
    assert.equal(saved.deploymentId, 'dep-123');
    assert.equal(saved.kind, 'test');
    assert.equal(fs.readFileSync(path.join(ctx.game, 'build/deploy-qr.png')).subarray(1, 4).toString(), 'PNG');
    assert.match(result.stdout, /intoss-private:\/\/my-game/);
  });

  it('release candidate: RC memo and console guidance, --profile passes through; test builds are refused', () => {
    const ctx = setup();
    const result = run(ctx, ['--rc', '--profile', 'team']);
    assert.equal(result.status, 0, result.stderr);
    const argv = JSON.parse(fs.readFileSync(ctx.record, 'utf8'));
    assert.match(argv[5], /^\[RC\] /);
    assert.deepEqual(argv.slice(-2), ['--profile', 'team']);
    assert.match(result.stdout, /검수를 요청/);
    const refused = run(setup({ debugConsole: true }), ['--rc']);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /테스트 빌드/);
  });

  it('no token → token add guidance without calling ait; auth failure → hints', () => {
    const noToken = setup({ token: false });
    const result = run(noToken);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /token add/);
    assert.equal(fs.existsSync(noToken.record), false);
    const denied = run(setup({ fakeExit: 1, fakeOut: 'Request failed with status code 403' }));
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /인증 실패/);
    assert.match(denied.stderr, /키 관리/);
  });
});

describe('clean·shell:reset', () => {
  const scripts = path.join(repoRoot, 'addons/apps_in_toss/tools/scripts');
  it('clean removes only SDK outputs; shell:reset backs up and copies the template', () => {
    const game = temp('ait-clean-game-');
    fs.mkdirSync(path.join(game, '.ait'));
    fs.mkdirSync(path.join(game, 'build/godot-web'), { recursive: true });
    fs.mkdirSync(path.join(game, 'build/web-template'), { recursive: true });
    fs.writeFileSync(path.join(game, '.ait/game.manifest.json'), JSON.stringify({ gameId: 'g' }));
    for (const f of ['build/godot-web/index.html', 'build/ait-app-config.json', 'build/deploy-qr.png', 'g.ait', 'build/web-template/keep.zip']) {
      fs.writeFileSync(path.join(game, f), 'x');
    }
    const env = { ...process.env, GODOT_PROJECT_DIR: game };
    assert.equal(spawnSync(process.execPath, [path.join(scripts, 'pipeline-clean.mjs')], { env }).status, 0);
    assert.equal(fs.existsSync(path.join(game, 'build/godot-web')), false);
    assert.equal(fs.existsSync(path.join(game, 'g.ait')), false);
    assert.equal(fs.existsSync(path.join(game, 'build/web-template/keep.zip')), true, 'game files stay');

    fs.writeFileSync(path.join(game, 'custom_shell.html'), 'mine');
    assert.equal(spawnSync(process.execPath, [path.join(scripts, 'pipeline-shell-reset.mjs')], { env }).status, 0);
    assert.equal(fs.readFileSync(path.join(game, 'custom_shell.html.bak'), 'utf8'), 'mine');
    assert.equal(
      fs.readFileSync(path.join(game, 'custom_shell.html'), 'utf8'),
      fs.readFileSync(path.join(repoRoot, 'addons/apps_in_toss/tools/templates/custom_shell.html'), 'utf8'),
    );
  });
});

describe('optimize(빌드 전 최적화 검사)', () => {
  const scripts = path.join(repoRoot, 'addons/apps_in_toss/tools/scripts');
  it('lists big lossless textures and uncompressed WAV, fixes .import only with --fix', () => {
    const game = temp('ait-opt-game-');
    const big = Buffer.alloc(300 * 1024, 1);
    const files = {
      'art/big.png': ['texture', '0'],
      'art/vram.png': ['texture', '3'],
      'art/ok.png': ['texture', '1'],
      'sfx/loop.wav': ['wav', '0'],
    };
    for (const [rel, [importer, mode]] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(game, rel)), { recursive: true });
      fs.writeFileSync(path.join(game, rel), big);
      fs.writeFileSync(path.join(game, `${rel}.import`), `[remap]\n\nimporter="${importer}"\n\n[params]\n\ncompress/mode=${mode}\n`);
    }
    fs.writeFileSync(path.join(game, 'art/small.png'), 'x');
    fs.writeFileSync(path.join(game, 'art/small.png.import'), '[remap]\n\nimporter="texture"\n\n[params]\n\ncompress/mode=0\n');
    const env = { ...process.env, GODOT_PROJECT_DIR: game };
    const scan = spawnSync(process.execPath, [path.join(scripts, 'pipeline-optimize.mjs')], { env, encoding: 'utf8' });
    assert.equal(scan.status, 0, scan.stderr);
    assert.match(scan.stdout, /3개 \(텍스처 2, 오디오 1\)/);
    assert.match(fs.readFileSync(path.join(game, 'art/big.png.import'), 'utf8'), /compress\/mode=0/, 'scan does not change files');
    const fixed = spawnSync(process.execPath, [path.join(scripts, 'pipeline-optimize.mjs'), '--fix'], { env, encoding: 'utf8' });
    assert.equal(fixed.status, 0, fixed.stderr);
    const bigImport = fs.readFileSync(path.join(game, 'art/big.png.import'), 'utf8');
    assert.match(bigImport, /compress\/mode=1/);
    assert.match(bigImport, /compress\/lossy_quality=0\.85/);
    assert.match(fs.readFileSync(path.join(game, 'art/vram.png.import'), 'utf8'), /compress\/mode=2/);
    assert.match(fs.readFileSync(path.join(game, 'sfx/loop.wav.import'), 'utf8'), /compress\/mode=2/);
    assert.match(fs.readFileSync(path.join(game, 'art/small.png.import'), 'utf8'), /compress\/mode=0/, 'small files stay');
  });
});

describe('git:guard·빌드 실패 진단', () => {
  const scripts = path.join(repoRoot, 'addons/apps_in_toss/tools/scripts');
  it('finds missing lines and tracked ignored files, --fix untracks them but keeps them on disk', async () => {
    const { guard } = await import(path.join(scripts, 'git-guard.mjs'));
    const game = temp('ait-guard-game-');
    const git = (...a) => spawnSync('git', ['-C', game, ...a], { encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    fs.mkdirSync(path.join(game, 'build'));
    fs.writeFileSync(path.join(game, 'build/out.js'), 'x');
    fs.writeFileSync(path.join(game, '.ait_relay'), 'secret');
    fs.writeFileSync(path.join(game, 'main.gd'), 'extends Node');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
    fs.writeFileSync(path.join(game, '.gitignore'), 'build/\n.ait_relay\n');
    const check = guard(game);
    assert.ok(check.missing.includes('*.ait') && !check.missing.includes('build/'));
    assert.deepEqual(check.tracked.sort(), ['.ait_relay', 'build/out.js']);
    assert.deepEqual(check.secrets, ['.ait_relay']);
    const fixed = guard(game, { fix: true });
    assert.equal(fixed.fixed, true);
    assert.deepEqual(guard(game).tracked, []);
    assert.deepEqual(guard(game).missing, []);
    assert.ok(fs.existsSync(path.join(game, '.ait_relay')), 'kept on disk');
  });

  it('diagnosis keeps the error tail and maps known causes to hints', async () => {
    const { diagnose, formatDiagnosis } = await import(path.join(scripts, 'build-diagnostics.mjs'));
    const d = diagnose('Godot Web export', 1, 'line1\nERROR: No export template found at the expected path\n');
    assert.equal(d.exitCode, 1);
    assert.ok(d.tail.at(-1).includes('export template'));
    assert.match(d.hints.join(' '), /내보내기 템플릿/);
    assert.match(formatDiagnosis(d), /할 일/);
    assert.deepEqual(diagnose('x', 2, 'nothing known').hints, []);
  });
});
