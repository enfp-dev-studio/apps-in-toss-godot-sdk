// ait-godot clean — SDK가 만드는 빌드 결과만 지운다(Unity AIT > Clean 대응). 게임이 만든 build/의 다른 파일은 두고,
// 다음 build·build:dev가 모두 다시 만든다.
import fs from 'node:fs';
import path from 'node:path';

const gameDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? process.cwd());
const manifestPath = path.join(gameDir, '.ait/game.manifest.json');
const gameId = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).gameId : null;
const targets = [
  'build/godot-web',
  'build/ait-app-config.json',
  'build/deploy-qr.png',
  'build/deploy-result.json',
  gameId ? `${gameId}.ait` : null,
].filter(Boolean);
const removed = targets.filter((rel) => {
  const full = path.join(gameDir, rel);
  if (!fs.existsSync(full)) return false;
  fs.rmSync(full, { recursive: true, force: true });
  return true;
});
console.log(removed.length ? `[ait-godot clean] 지움: ${removed.join(', ')}` : '[ait-godot clean] 지울 빌드 결과가 없습니다.');
