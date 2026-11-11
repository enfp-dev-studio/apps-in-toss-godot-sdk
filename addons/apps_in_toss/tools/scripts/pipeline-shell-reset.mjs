// ait-godot shell:reset — 게임의 셸(custom_shell.html)을 SDK 템플릿으로 되돌린다(Unity Reset Loading Screen·
// Force Update WebGL Template 대응). 지금 셸은 custom_shell.html.bak으로 남긴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const shell = path.join(gameDir, 'custom_shell.html');
if (fs.existsSync(shell)) {
  fs.copyFileSync(shell, `${shell}.bak`);
  console.log('[ait-godot shell:reset] 지금 셸을 custom_shell.html.bak으로 남겼습니다.');
}
fs.copyFileSync(path.join(here, '../templates/custom_shell.html'), shell);
console.log('[ait-godot shell:reset] custom_shell.html을 SDK 템플릿으로 바꿨습니다. 고친 곳이 있었다면 .bak에서 옮기세요.');
