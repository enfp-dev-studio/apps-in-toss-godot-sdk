// ait-godot git:guard [--fix] — git 보호 검사(git-guard.mjs). Unity AITGitGuard 대응.
import path from 'node:path';
import { guard } from './git-guard.mjs';

const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const fix = process.argv.includes('--fix');
const result = guard(gameDir, { fix });
if (!result.repo) {
  console.log('[ait-godot git:guard] git 저장소가 아니라 건너뜁니다.');
  process.exit(0);
}
if (result.missing.length === 0 && result.tracked.length === 0) {
  console.log('[ait-godot git:guard] 문제없습니다.');
  process.exit(0);
}
if (result.missing.length > 0) console.log(`[ait-godot git:guard] .gitignore에 ${fix ? '더함' : '없음'}: ${result.missing.join(', ')}`);
if (result.tracked.length > 0) {
  console.log(`[ait-godot git:guard] 커밋돼 있어 무시되지 않는 파일 ${result.tracked.length}개${fix ? '를 git에서 뺐습니다(디스크에는 남김)' : ''}:`);
  for (const file of result.tracked.slice(0, 50)) console.log(`  ${file}`);
  if (result.tracked.length > 50) console.log(`  … ${result.tracked.length - 50}개 더`);
}
if (result.secrets.length > 0) {
  console.log('[ait-godot git:guard] ⚠ 비밀 파일(.ait_relay)이 커밋돼 있었습니다. 이미 원격에 올렸다면 debugger relay-key --rotate로 키를 바꾸세요.');
}
if (!fix) {
  console.log('[ait-godot git:guard] 고치려면 --fix(빠진 줄 더하기 + git rm --cached). 고친 뒤 커밋하세요.');
  process.exit(result.secrets.length > 0 ? 1 : 0);
}
console.log('[ait-godot git:guard] 고쳤습니다. git status로 확인한 뒤 커밋하세요.');
