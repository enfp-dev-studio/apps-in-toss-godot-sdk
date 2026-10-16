// 깨끗한 체크아웃(.godot 없음)에서 컴파일 게이트 전에 headless import가
// 먼저 실행되어야 한다는 회귀 테스트. needsGodotImport 판단만 확인한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { needsGodotImport } from '../addons/apps_in_toss/tools/scripts/export-dir.mjs';

describe('needsGodotImport', () => {
  it('project.godot만 있으면 true (.godot 없음)', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-import-proj-'));
    try {
      fs.writeFileSync(path.join(projectDir, 'project.godot'), '; engine\n');
      assert.equal(needsGodotImport(projectDir), true);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('.godot/global_script_class_cache.cfg가 있으면 false', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-import-proj-'));
    try {
      fs.writeFileSync(path.join(projectDir, 'project.godot'), '; engine\n');
      fs.mkdirSync(path.join(projectDir, '.godot'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, '.godot', 'global_script_class_cache.cfg'), '[cache]\n');
      assert.equal(needsGodotImport(projectDir), false);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
