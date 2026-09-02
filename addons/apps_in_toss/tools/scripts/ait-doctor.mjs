import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSdkDir } from './sdk-dir.mjs';
import { resolveProfile, logProfileBanner } from './build-profiles.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// 내장 모드: root = addonDir(addons/apps_in_toss). 그 외에는 패키지 루트.
const root = process.env.AIT_ADDON_DIR
  ? path.resolve(process.env.AIT_ADDON_DIR)
  : path.resolve(here, '..');
const projectDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? path.join(root, 'godot'));
let resolvedSdk;
try {
  resolvedSdk = resolveSdkDir(root, { projectDir });
} catch (error) {
  console.error(`[AIT doctor] ${String(error?.message ?? error)}`);
  process.exit(1);
}
const { sdkDir } = resolvedSdk;
const lockPath = resolvedSdk.lockPath;
const bridgeDir = path.resolve(process.env.AIT_BRIDGE_DIR ?? path.join(sdkDir, 'bridge'));
const godotBin = process.env.GODOT_BIN ?? 'godot';
const strict = process.argv.includes('--strict') || process.env.AIT_PLATFORM_STRICT === '1';

const errors = [];
const warnings = [];

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label} not found: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${filePath} (${String(error)})`);
    return null;
  }
}

function readText(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label} not found: ${filePath}`);
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function parseVersion(value) {
  const match = String(value ?? '').match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function majorVersion(value) {
  const match = String(value ?? '').match(/(?:^|[^0-9])(\d+)/);
  return match ? Number(match[1]) : null;
}

function relative(filePath) {
  const value = path.relative(root, filePath);
  return value || '.';
}

function mismatch(message) {
  (strict ? errors : warnings).push(message);
}

function required(message) {
  errors.push(message);
}

function exact(label, actual, expected) {
  if (actual === expected) return;
  mismatch(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return { value: null, error: result.error ?? result.stderr ?? result.stdout ?? `${command} failed` };
  }
  return { value: String(result.stdout ?? '').trim(), error: null };
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function iniValue(text, key) {
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}=(.*)$`, 'm');
  const match = text.match(pattern);
  if (!match) return null;
  return match[1].trim().replace(/^"|"$/g, '');
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

function resolveProjectResource(resourcePath) {
  if (!resourcePath?.startsWith('res://')) return null;
  return path.join(projectDir, resourcePath.slice('res://'.length));
}

const lock = readJson(lockPath, 'Platform lock');
if (!lock) {
  console.error('[AIT doctor] platform lock cannot be checked.');
  process.exit(1);
}

console.log(`[AIT doctor] platform: ${lock.platformVersion ?? 'unknown'}`);
console.log(`[AIT doctor] lock: ${relative(lockPath)}`);
console.log(`[AIT doctor] project: ${projectDir}`);
console.log(`[AIT doctor] mode: ${strict ? 'strict' : 'advisory'}`);

// 빌드 프로필: 게임 매니페스트의 releaseChannel이 검사 정책을 결정한다.
const resolvedProfileInfo = resolveProfile(projectDir, root);
if (resolvedProfileInfo.profile.doctorStrict && !strict) {
  mismatch(
    `releaseChannel "${resolvedProfileInfo.channel}" requires strict mode. Run with --strict (npm run ait:doctor:strict).`,
  );
}
if (resolvedProfileInfo.manifest) logProfileBanner(resolvedProfileInfo);

const projectFile = path.join(projectDir, 'project.godot');
const projectText = readText(projectFile, 'Godot project');
if (projectText) {
  const feature = firstMatch(projectText, /^config\/features=PackedStringArray\("([^"]+)"/m);
  const renderer = iniValue(projectText, 'renderer/rendering_method');
  const customTheme = iniValue(projectText, 'theme/custom');
  exact('Godot project feature', feature, lock.godot?.feature);
  exact('Godot renderer', renderer, lock.godot?.renderer);

  if (!customTheme) {
    mismatch('Godot project has no gui/theme/custom setting; Korean glyph fallback is not guaranteed.');
  } else {
    const themePath = resolveProjectResource(customTheme);
    if (!themePath || !fs.existsSync(themePath)) {
      mismatch(`Godot custom theme is missing: ${customTheme}`);
    } else {
      const themeText = fs.readFileSync(themePath, 'utf8');
      const fontResource = firstMatch(themeText, /type="FontFile" path="([^"]+)"/);
      if (!fontResource) {
        mismatch(`Godot theme does not declare a FontFile resource: ${customTheme}`);
      } else {
        const fontPath = resolveProjectResource(fontResource);
        if (!fontPath || !fs.existsSync(fontPath)) {
          mismatch(`Godot theme font is missing: ${fontResource}`);
        } else {
          console.log(`[AIT doctor] font: ${fontResource}`);
        }
      }
    }
  }
}

const exportPresetPath = path.join(projectDir, 'export_presets.cfg');
const exportPresetText = readText(exportPresetPath, 'Godot export presets');
if (exportPresetText) {
  const presetName = firstMatch(exportPresetText, /^name="([^"]+)"/m);
  const threadSupport = firstMatch(exportPresetText, /^variant\/thread_support=(true|false)$/m);
  const customShell = firstMatch(exportPresetText, /^html\/custom_html_shell="([^"]*)"$/m);
  exact('Godot export preset', presetName, lock.godot?.web?.exportPreset);
  exact(
    'Godot Web thread support',
    threadSupport === null ? null : threadSupport === 'true',
    lock.godot?.web?.threadSupport,
  );
  exact('Godot custom HTML shell', customShell, lock.godot?.web?.customHtmlShell);
  const shellPath = resolveProjectResource(customShell);
  if (!shellPath || !fs.existsSync(shellPath)) {
    mismatch(`Godot custom HTML shell file is missing: ${customShell ?? 'unset'}`);
  }
}

const godotResult = run(godotBin, ['--version']);
if (godotResult.error) {
  mismatch(`Godot executable could not be checked (${godotBin}): ${String(godotResult.error).trim()}`);
} else {
  exact('Godot executable version', parseVersion(godotResult.value), lock.godot?.version);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
const supportedNodeMajors = lock.toolchain?.node?.supportedMajors ?? [];
if (!supportedNodeMajors.includes(nodeMajor)) {
  mismatch(`Node.js major version: expected one of ${supportedNodeMajors.join(', ')}, got ${nodeMajor}`);
}

const npmResult = run('npm', ['--version']);
if (npmResult.error) {
  mismatch(`npm could not be checked: ${String(npmResult.error).trim()}`);
} else {
  const npmMajor = majorVersion(npmResult.value);
  const supportedNpmMajors = lock.toolchain?.npm?.supportedMajors ?? [];
  if (!supportedNpmMajors.includes(npmMajor)) {
    mismatch(`npm major version: expected one of ${supportedNpmMajors.join(', ')}, got ${npmMajor}`);
  }
}

const sourceCandidates = process.env.AIT_ADDON_DIR
  ? [sdkDir]
  : [
      path.join(sdkDir, 'addons/apps_in_toss'),
      path.join(sdkDir, 'addon/apps_in_toss'),
    ];
const addonSource = sourceCandidates.find((candidate) => fs.existsSync(candidate));
if (!addonSource) {
  required(`Apps in Toss addon source not found under ${sdkDir}`);
} else {
  const pluginConfigPath = path.join(addonSource, 'plugin.cfg');
  const pluginConfig = readText(pluginConfigPath, 'Godot addon plugin.cfg');
  if (pluginConfig) exact('AIT Godot SDK version', iniValue(pluginConfig, 'version'), lock.aitGodotSdk?.version);

  const installedAddon = path.join(projectDir, 'addons/apps_in_toss');
  if (!fs.existsSync(installedAddon)) {
    mismatch(`Installed addon copy is missing: ${installedAddon}. Run npm run godot:sdk:sync.`);
  } else {
    const installedPlugin = readText(path.join(installedAddon, 'plugin.cfg'), 'Installed addon plugin.cfg');
    if (installedPlugin) exact('Installed AIT Godot SDK version', iniValue(installedPlugin, 'version'), lock.aitGodotSdk?.version);
  }
}

const bridgePackagePath = path.join(bridgeDir, 'package.json');
const bridgePackage = readJson(bridgePackagePath, 'Godot bridge package');
if (bridgePackage) {
  exact('AIT bridge version', bridgePackage.version, lock.bridge?.version);
  exact(
    'Bridge Web Framework version',
    bridgePackage.dependencies?.[lock.webFramework?.package],
    lock.webFramework?.version,
  );
}

const manifestPath = path.join(bridgeDir, 'api-manifest.json');
if (fs.existsSync(manifestPath)) {
  exact('API manifest SHA-256', sha256(manifestPath), lock.aitGodotSdk?.apiManifestSha256);
} else {
  required(`API manifest not found: ${manifestPath}`);
}

// "Root package" 검사는 본패키지가 아닌 실제 게임/플랫폼 리포(package.json이
// web-framework를 직접 의존하는 곳)에서만 의미가 있다. 여기서 root는
// GODOT_PROJECT_DIR(게임)을 가리킨다 — 게임이 직접 web-framework를 쓰지 않으면 생략.
// 내장 모드(AIT_ADDON_DIR)에서는 root가 addonDir이라 package.json이 없으므로
// 이 검사와 lockfile 검사를 건너뛴다.
const embedded = process.env.AIT_ADDON_DIR !== undefined;
const rootPackagePath = path.join(root, 'package.json');
const rootPackage = embedded ? null : readJson(rootPackagePath, 'Root package');
const hasDirectWebFrameworkDep =
  rootPackage?.dependencies?.[lock.webFramework?.package] !== undefined;
const hasOwnNodeModules = fs.existsSync(path.join(root, 'node_modules'));
if (!embedded && (hasDirectWebFrameworkDep || hasOwnNodeModules)) {
  exact(
    'Root Web Framework version',
    rootPackage.dependencies?.[lock.webFramework?.package],
    lock.webFramework?.version,
  );
}

// lockfile·Unity lock 검사는 이 패키지가 npm 의존성 트리 안에 있을 때(=node_modules
// 존재, 즉 플랫폼 리포나 게임 리포에 설치된 경우)만 의미가 있다. 패키지 단독
// checkout에서는 생략한다.
const packageLockPath = path.join(root, 'package-lock.json');
const packageLock = !embedded && hasOwnNodeModules && fs.existsSync(packageLockPath)
  ? readJson(packageLockPath, 'npm lockfile')
  : null;
if (packageLock) {
  exact(
    'Resolved Web Framework version',
    packageLock.packages?.[`node_modules/${lock.webFramework?.package}`]?.version,
    lock.webFramework?.version,
  );
}

const unityLockPath = path.resolve(root, lock.unitySdk?.lockPath ?? 'scripts/unity-sdk.lock.json');
const unityLock = !embedded && hasOwnNodeModules ? readJson(unityLockPath, 'Unity SDK lock') : null;
if (unityLock) {
  exact('Unity SDK repository', unityLock.repository, lock.unitySdk?.repository);
  exact('Unity SDK commit', unityLock.commit, lock.unitySdk?.commit);
  exact('Unity SDK package version', unityLock.packageVersion, lock.unitySdk?.packageVersion);
}

for (const warning of warnings) console.warn(`[AIT doctor] WARN ${warning}`);
for (const error of errors) console.error(`[AIT doctor] ERROR ${error}`);

if (errors.length > 0) {
  console.error(`[AIT doctor] failed with ${errors.length} error(s).`);
  process.exitCode = 1;
} else if (warnings.length > 0) {
  console.log(`[AIT doctor] ${warnings.length} advisory mismatch(es); use --strict for release validation.`);
} else {
  console.log('[AIT doctor] platform lock and project are compatible.');
}
