// git 보호(Unity SDK 3.9.0 AITGitGuard 대응). 빌드 결과·Godot 캐시·비밀 파일이 git에 올라가지 않게
// .gitignore에 있어야 할 줄과, 이미 커밋돼 있어 무시되지 않는 파일을 찾는다.
// ait-godot git:guard [--fix]: --fix면 빠진 줄을 더하고 그 파일들을 git에서만 뺀다(git rm --cached, 디스크는 그대로).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// init이 더하는 줄과 같다. .ait_relay.meta는 디버거 0.3.0이 키 만든 날짜를 적는 파일이다.
export const GITIGNORE_LINES = ['.godot/', 'build/', '*.ait', '!.ait/', '.ait_relay', '.ait_relay.meta', '.mcp/', 'node_modules/', 'addons/apps_in_toss/tools/bridge/dist/'];
const SECRET = /(^|\/)\.ait_relay(\.meta)?$/;

export function missingGitignoreLines(gameDir) {
  const file = path.join(gameDir, '.gitignore');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const have = new Set(text.split(/\r?\n/).map((line) => line.trim()));
  return GITIGNORE_LINES.filter((line) => !have.has(line));
}

export function addGitignoreLines(gameDir, lines, header = '# Apps in Toss Godot SDK') {
  if (lines.length === 0) return [];
  const file = path.join(gameDir, '.gitignore');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const prefix = text === '' || text.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(file, `${text}${prefix}${header}\n${lines.join('\n')}\n`);
  return lines;
}

function git(gameDir, args) {
  return spawnSync('git', ['-C', gameDir, ...args], { encoding: 'utf8' });
}

export function isGitRepo(gameDir) {
  const result = git(gameDir, ['rev-parse', '--is-inside-work-tree']);
  return result.status === 0 && result.stdout.trim() === 'true';
}

// 커밋돼 있지만 .gitignore에 걸리는 파일(그래서 무시되지 않는 파일)
export function trackedIgnoredFiles(gameDir) {
  const result = git(gameDir, ['ls-files', '-ci', '--exclude-standard']);
  return result.status === 0 ? result.stdout.split('\n').filter(Boolean) : [];
}

export function guard(gameDir, { fix = false } = {}) {
  if (!isGitRepo(gameDir)) return { repo: false, missing: [], tracked: [], secrets: [], fixed: false };
  const missing = missingGitignoreLines(gameDir);
  if (fix) addGitignoreLines(gameDir, missing);
  const tracked = trackedIgnoredFiles(gameDir);
  const secrets = tracked.filter((file) => SECRET.test(file));
  if (fix && tracked.length > 0) {
    const result = git(gameDir, ['rm', '--cached', '--quiet', '--', ...tracked]);
    if (result.status !== 0) throw new Error(`git rm --cached 실패: ${result.stderr.trim()}`);
  }
  return { repo: true, missing, tracked, secrets, fixed: fix };
}
