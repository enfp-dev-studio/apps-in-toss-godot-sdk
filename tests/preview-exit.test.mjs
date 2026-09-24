import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../addons/apps_in_toss/tools/scripts/pipeline-preview.mjs', import.meta.url));

test('preview reports a failed Vite server as a failure', () => {
  const game = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-preview-exit-'));
  try {
    const exportDir = path.join(game, 'build/godot-web');
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(path.join(exportDir, 'index.html'), '<!doctype html>');
    const viteDir = path.join(game, 'node_modules/vite/bin');
    fs.mkdirSync(viteDir, { recursive: true });
    fs.writeFileSync(path.join(viteDir, 'vite.js'), 'console.error("server startup failed"); process.exit(7);');

    const result = spawnSync(process.execPath, [script], {
      cwd: game,
      env: { ...process.env, GODOT_PROJECT_DIR: game, GODOT_EXPORT_DIR: exportDir },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stderr, /server startup failed/);
  } finally {
    fs.rmSync(game, { recursive: true, force: true });
  }
});
