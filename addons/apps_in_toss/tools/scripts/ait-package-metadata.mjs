// CLI 3.10.0 omits game/runtime metadata. Scope the correction to one child process;
// neither the installed CLI nor the completed .ait is rewritten.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const RUNTIME_VERSION = '0.84.0'; // Official Unity SDK 3.10.0 WEB packaging value.
const CLI_VERSION = '3.10.0';

export function expectedIsGame(appType) {
  if (appType === undefined || appType === 'game') return true;
  if (appType === 'nongame') return false;
  throw new Error(`appType must be "game" or "nongame": ${JSON.stringify(appType)}`);
}

export function resolveMetadataCli(aitBin, gameDir, env = process.env) {
  const candidates = aitBin.includes('/') || aitBin.includes('\\')
    ? [path.resolve(gameDir, aitBin)]
    : (env.PATH ?? '').split(path.delimiter).flatMap((dir) =>
      process.platform === 'win32' ? [path.join(dir, aitBin), path.join(dir, `${aitBin}.cmd`)] : [path.join(dir, aitBin)]);
  const binary = candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  if (!binary) throw new Error(`ait CLI를 찾을 수 없습니다: ${aitBin}`);
  const selected = fs.realpathSync(binary);
  const selectedRequire = createRequire(selected);
  let cliPackage;
  try {
    cliPackage = selectedRequire.resolve('@apps-in-toss/cli/package.json');
  } catch {
    throw new Error(`선택한 ait의 @apps-in-toss/cli를 찾을 수 없습니다: ${selected}`);
  }
  const pkg = JSON.parse(fs.readFileSync(cliPackage, 'utf8'));
  if (pkg.name !== '@apps-in-toss/cli' || pkg.version !== CLI_VERSION) {
    throw new Error(`메타데이터 대응은 @apps-in-toss/cli ${CLI_VERSION}에서 검증했습니다. 선택한 버전: ${pkg.version}`);
  }
  const entry = path.resolve(path.dirname(cliPackage), pkg.bin.ait);
  const allowed = [fs.realpathSync(entry)];
  try {
    const frameworkPackage = selectedRequire.resolve('@apps-in-toss/web-framework/package.json');
    const framework = JSON.parse(fs.readFileSync(frameworkPackage, 'utf8'));
    allowed.push(fs.realpathSync(path.resolve(path.dirname(frameworkPackage), framework.bin.ait)));
  } catch { /* A direct CLI installation need not include web-framework. */ }
  // npm uses symlinks on Unix and command shims on Windows. An arbitrary executable
  // must not silently run a different CLI merely because one is installed nearby.
  const npmShim = path.basename(path.dirname(binary)) === '.bin' && /^ait(?:\.cmd|\.ps1)?$/.test(path.basename(binary)) &&
    allowed.some((file) => fs.readFileSync(binary, 'utf8').replaceAll('\\', '/').includes(
      path.relative(path.dirname(binary), file).split(path.sep).join('/')));
  if (!allowed.includes(selected) && !npmShim) throw new Error(`공식 ait CLI 엔트리가 아닙니다: ${selected}`);
  const cliRequire = createRequire(entry);
  const formatEntry = cliRequire.resolve('@apps-in-toss/ait-format');
  const formatPackage = JSON.parse(fs.readFileSync(path.resolve(path.dirname(formatEntry), '../package.json'), 'utf8'));
  if (formatPackage.name !== '@apps-in-toss/ait-format' || formatPackage.version !== '1.0.0') {
    throw new Error(`검증하지 않은 ait-format 버전: ${formatPackage.version}`);
  }
  return { entry, AITReader: cliRequire('@apps-in-toss/ait-format').AITReader };
}

export function assertPackageMetadata(reader, isGame) {
  if (reader.metadata?.isGame !== isGame || reader.metadata?.runtimeVersion !== RUNTIME_VERSION ||
      reader.metadata?.sdkVersion !== CLI_VERSION) {
    throw new Error(`.ait 메타데이터 불일치: isGame=${reader.metadata?.isGame}, runtimeVersion=${JSON.stringify(reader.metadata?.runtimeVersion)}, sdkVersion=${JSON.stringify(reader.metadata?.sdkVersion)}`);
  }
}

export function packageWithMetadata(aitBin, gameDir, env = process.env) {
  const { entry, AITReader } = resolveMetadataCli(aitBin, gameDir, env);
  const manifestPath = path.join(gameDir, '.ait/game.manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  const isGame = expectedIsGame(manifest.appType);
  // A sibling module resolves the exact same ESM ait-format instance as this CLI,
  // including when its dependencies live in a pnpm store. Unique directory, always removed.
  const temporary = fs.mkdtempSync(path.join(path.dirname(entry), `.ait-godot-metadata-${process.pid}-`));
  try {
    const report = path.join(temporary, 'output.json');
    const wrapper = path.join(temporary, 'build.mjs');
    fs.writeFileSync(wrapper, `import fs from 'node:fs';
import { AppsInTossBundle } from '@apps-in-toss/ait-format';
const originalWriter = AppsInTossBundle.writer;
AppsInTossBundle.writer = function (...args) {
  const writer = originalWriter.apply(this, args);
  const setMetadata = writer.setMetadata;
  writer.setMetadata = function (metadata) {
    return setMetadata.call(this, { ...metadata, isGame: ${JSON.stringify(isGame)}, runtimeVersion: ${JSON.stringify(RUNTIME_VERSION)} });
  };
  fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify({ appName: args[0].appName }));
  return writer;
};
await import(${JSON.stringify(pathToFileURL(entry).href)});
`);
    const result = spawnSync(process.execPath, [wrapper, 'build'], { cwd: gameDir, stdio: 'inherit', env });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`ait build 실패 (exit ${result.status ?? '?'}, signal ${result.signal ?? '-'})`);
    if (!fs.existsSync(report)) throw new Error('ait build가 메타데이터 보강 writer를 사용하지 않았습니다.');
    const { appName } = JSON.parse(fs.readFileSync(report, 'utf8'));
    const outFile = path.resolve(gameDir, `${appName}.ait`);
    const reader = AITReader.fromBuffer(new Uint8Array(fs.readFileSync(outFile)));
    if (reader.appName !== appName) throw new Error('.ait appName이 빌드 요청과 다릅니다.');
    assertPackageMetadata(reader, isGame);
    console.log(`[AIT package] 메타데이터 확인: isGame=${isGame}, runtimeVersion=${RUNTIME_VERSION}, sdkVersion=${reader.metadata.sdkVersion}`);
    return outFile;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
