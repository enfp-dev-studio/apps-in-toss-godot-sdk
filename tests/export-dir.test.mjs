// export 폴더 정리 규칙(isClearableExportDir)과
// release export의 개발 전용 파일 검사를 확인한다.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isClearableExportDir } from '../addons/apps_in_toss/tools/scripts/export-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const verifyScript = path.join(repoRoot, 'addons/apps_in_toss/tools/scripts/verify-godot-export.mjs');

function opts(projectDir, defaultExportDir) {
  return { projectDir, defaultExportDir };
}

describe('isClearableExportDir', () => {
  it('프로젝트 안 export 폴더(index.html 있음)는 비워도 된다', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-proj-'));
    try {
      const exportDir = path.join(projectDir, 'build/godot-web');
      fs.mkdirSync(exportDir, { recursive: true });
      fs.writeFileSync(path.join(exportDir, 'index.html'), '<!doctype html>');
      const out = isClearableExportDir(
        exportDir,
        opts(projectDir, path.join(os.tmpdir(), 'ait-sdk-default-export')),
      );
      assert.equal(out, true);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('project.godot이 있는 폴더는 소스 폴더이므로 비우면 안 된다', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-proj-'));
    try {
      const sub = path.join(projectDir, 'subgame');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, 'project.godot'), '; engine\n');
      fs.writeFileSync(path.join(sub, 'index.html'), '<!doctype html>');
      assert.equal(isClearableExportDir(sub, opts(projectDir, path.join(os.tmpdir(), 'ait-sdk-default'))), false);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('일반 리소스 폴더(.gd 파일만)는 비우면 안 된다', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-proj-'));
    try {
      const resDir = path.join(projectDir, 'scripts');
      fs.mkdirSync(resDir, { recursive: true });
      fs.writeFileSync(path.join(resDir, 'foo.gd'), 'extends Node\n');
      assert.equal(isClearableExportDir(resDir, opts(projectDir, path.join(os.tmpdir(), 'ait-sdk-default'))), false);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('프로젝트 바깥 폴더는 비우면 안 된다', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-proj-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'index.html'), '<!doctype html>');
      assert.equal(isClearableExportDir(outside, opts(projectDir, path.join(os.tmpdir(), 'ait-sdk-default'))), false);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('projectDir 자체는 비우면 안 된다', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-proj-'));
    try {
      assert.equal(isClearableExportDir(projectDir, opts(projectDir, path.join(os.tmpdir(), 'ait-sdk-default'))), false);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('프로젝트 안 빈 폴더는 비워도 된다', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-export-proj-'));
    try {
      const emptyDir = path.join(projectDir, 'build/godot-web');
      fs.mkdirSync(emptyDir, { recursive: true });
      assert.equal(isClearableExportDir(emptyDir, opts(projectDir, path.join(os.tmpdir(), 'ait-sdk-default'))), true);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// 가짜 release export를 만들고 verify-godot-export.mjs를 자식으로 실행한다.
function makeReleaseExport() {
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-verify-release-'));
  fs.writeFileSync(
    path.join(exportDir, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="./apps-in-toss-godot-bridge.js"></script></body></html>\n',
  );
  fs.writeFileSync(
    path.join(exportDir, 'apps-in-toss-godot-bridge.js'),
    '// AppsInTossGodot bridge\nwindow.AppsInTossGodot = {};\n',
  );
  fs.writeFileSync(path.join(exportDir, 'game.wasm'), 'wasm');
  fs.writeFileSync(path.join(exportDir, 'game.pck'), 'pck');
  const lockContent = `lock-${Date.now()}-${Math.random()}`;
  const lockPath = path.join(exportDir, 'platform.lock.json');
  fs.writeFileSync(lockPath, lockContent);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
  fs.writeFileSync(
    path.join(exportDir, 'ait-platform-manifest.json'),
    JSON.stringify({ platformVersion: '0.0.0-test', platformLockSha256: sha256 }),
  );
  return { exportDir, lockPath };
}

function runVerify(exportDir, lockPath) {
  return spawnSync(process.execPath, [verifyScript], {
    env: { ...process.env, GODOT_EXPORT_DIR: exportDir, AIT_PLATFORM_LOCK: lockPath, AIT_BRIDGE_MOCK: '' },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('verify-godot-export release 검사', () => {
  it('깨끗한 release export는 exit 0', () => {
    const { exportDir } = makeReleaseExport();
    try {
      const result = runVerify(exportDir, path.join(exportDir, 'platform.lock.json'));
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    } finally {
      fs.rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('ait-devtools-panel.js가 섞이면 실패하고 파일 이름을 알린다', () => {
    const { exportDir } = makeReleaseExport();
    try {
      fs.writeFileSync(path.join(exportDir, 'ait-devtools-panel.js'), '// devtools\n');
      const result = runVerify(exportDir, path.join(exportDir, 'platform.lock.json'));
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /ait-devtools-panel\.js/);
    } finally {
      fs.rmSync(exportDir, { recursive: true, force: true });
    }
  });
});
