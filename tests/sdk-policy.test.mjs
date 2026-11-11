// SDK 최소 버전 정책(Unity AITDeprecationChecker 대응)과 저장소의 sdk-policy.json 모양을 본다(네트워크 없이).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSdkPolicy, compareVersions, judgePolicy } from '../addons/apps_in_toss/tools/scripts/sdk-policy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('SDK 최소 버전 정책', () => {
  it('compares x.y(.z) versions', () => {
    assert.equal(compareVersions('0.2.0', '0.2'), 0);
    assert.equal(compareVersions('0.1.9', '0.2.0'), -1);
    assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
  });

  it('blocks below minVersion and denied versions, reports a bad policy as unknown', () => {
    assert.equal(judgePolicy('0.2.0', { minVersion: '0.2.0', deniedVersions: [] }).status, 'ok');
    assert.equal(judgePolicy('0.1.0', { minVersion: '0.2.0' }).status, 'blocked');
    assert.equal(judgePolicy('0.2.0', { minVersion: '0.1.0', deniedVersions: ['0.2.0'] }).status, 'blocked');
    assert.equal(judgePolicy('0.2.0', { minVersion: 'x' }).status, 'unknown');
  });

  it('a failed download is unknown, not blocked', async () => {
    const offline = async () => { throw new Error('offline'); };
    assert.equal((await checkSdkPolicy('0.2.0', offline)).status, 'unknown');
    const served = async () => ({ ok: true, json: async () => ({ minVersion: '9.0.0' }) });
    assert.equal((await checkSdkPolicy('0.2.0', served)).status, 'blocked');
  });

  it('the repository policy file allows the current plugin version', () => {
    const policy = JSON.parse(fs.readFileSync(path.join(repoRoot, 'sdk-policy.json'), 'utf8'));
    const version = fs.readFileSync(path.join(repoRoot, 'addons/apps_in_toss/plugin.cfg'), 'utf8').match(/version="([^"]+)"/)[1];
    assert.equal(policy.schemaVersion, 1);
    assert.equal(judgePolicy(version, policy).status, 'ok');
  });
});
