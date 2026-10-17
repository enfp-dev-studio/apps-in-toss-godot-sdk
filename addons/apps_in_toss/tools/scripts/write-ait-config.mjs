// Generate apps-in-toss.config.ts from the game manifest (.ait/game.manifest.json).
// Unity SDK의 AIT > Configuration 패널에 대응: 앱 설정의 단일 출처를 manifest로
// 두고, 빌드가 여기서 설정 파일을 생성해 흩어진 설정을 없앤다.
//
// - 게임 리포: .ait/game.manifest.json의 gameId/displayName/brand가 설정 근거.
// - 공개 샘플(이 리포): 예시 매니페스트를 쓰되 gameId가 placeholder면 샘플 기본
//   이름('toss-web-game') 또는 AIT_APP_NAME 환경변수로 대체해 실수 배포를 막는다.
//   스키마 검증도 여기서 함께 수행한다(빌드 단계 설정 검사).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const projectDir = path.resolve(process.env.GODOT_PROJECT_DIR ?? path.join(root, 'godot'));

const SAMPLE_APP_NAME = 'toss-web-game';
const PLACEHOLDER_GAME_ID = 'replace-with-private-game-id';

const manifestCandidates = [
  path.join(projectDir, '.ait/game.manifest.json'),
  path.join(root, '.ait/game.manifest.json'),
  path.join(root, '.ait/game.manifest.example.json'),
];
const manifestPath = manifestCandidates.find((candidate) => fs.existsSync(candidate));
if (!manifestPath) {
  throw new Error(
    'Game manifest not found. Copy .ait/game.manifest.example.json into the game project .ait/ folder.',
  );
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const usingExample = manifestPath.endsWith('game.manifest.example.json');

// 필수 필드 검사 (스키마의 required 대응)
const requiredFields = ['gameId', 'gameVersion', 'platformLock', 'requiredApis', 'releaseChannel'];
for (const field of requiredFields) {
  if (manifest[field] === undefined) {
    throw new Error(`Game manifest is missing required field "${field}": ${manifestPath}`);
  }
}
if (!/^[0-9]+\.[0-9]+\.[0-9]+/.test(String(manifest.gameVersion))) {
  throw new Error(`gameVersion must be semver-like: "${manifest.gameVersion}"`);
}

// 앱 이름 결정: Unity Configuration의 앱 ID. placeholder는 그대로 설정에 쓰지 않는다.
let appName = manifest.gameId;
if (appName === PLACEHOLDER_GAME_ID) {
  appName = process.env.AIT_APP_NAME ?? SAMPLE_APP_NAME;
  if (usingExample && !process.env.AIT_APP_NAME) {
    console.log(
      '[AIT config] example manifest detected; using sample appName ' +
        `'${SAMPLE_APP_NAME}' (set AIT_APP_NAME for a private game).`,
    );
  }
}
if (!/^[a-zA-Z0-9-]+$/.test(appName)) {
  throw new Error(`App name must be alnum + hyphen: "${appName}"`);
}

const rawWebBundleDir = process.env.AIT_WEB_BUNDLE_DIR ?? process.env.GODOT_EXPORT_DIR ?? 'build/godot-web';
// 결정된 경로가 게임 안에 있으면 상대경로(POSIX)로 기록해 기기별 절대경로가
// 커밋되지 않게 한다. 바깥이면 절대경로를 그대로 쓴다.
const resolvedBundleDir = path.resolve(projectDir, rawWebBundleDir);
const bundleRelative = path.relative(projectDir, resolvedBundleDir);
const toPosix = (value) => value.split(path.sep).join('/');
const webBundleDir = bundleRelative && !bundleRelative.startsWith('..') && !path.isAbsolute(bundleRelative)
  ? toPosix(bundleRelative)
  : toPosix(resolvedBundleDir);
const primaryColor = manifest.brand?.primaryColor ?? '#3182F6';
const iconLine = manifest.brand?.iconUrl ? `    iconUrl: '${manifest.brand.iconUrl}',\n` : '';

// webView: 기본값 위에 매니페스트 값을 덮어쓴다(매니페스트 우선).
const webViewDefaults = { mediaPlaybackRequiresUserAction: false, pullToRefreshEnabled: false };
const webViewValidators = {
  allowsInlineMediaPlayback: (v) => typeof v === 'boolean',
  bounces: (v) => typeof v === 'boolean',
  pullToRefreshEnabled: (v) => typeof v === 'boolean',
  overScrollMode: (v) => v === 'always' || v === 'content' || v === 'never',
  mediaPlaybackRequiresUserAction: (v) => typeof v === 'boolean',
  allowsBackForwardNavigationGestures: (v) => typeof v === 'boolean',
};
let webView = { ...webViewDefaults };
if (manifest.webView !== undefined) {
  if (typeof manifest.webView !== 'object' || manifest.webView === null || Array.isArray(manifest.webView)) {
    throw new Error('Game manifest webView must be an object.');
  }
  for (const [key, value] of Object.entries(manifest.webView)) {
    const validate = webViewValidators[key];
    if (!validate) {
      throw new Error(`Game manifest webView.${key} is unknown.`);
    }
    if (!validate(value)) {
      throw new Error(`Game manifest webView.${key} has invalid value: ${JSON.stringify(value)}`);
    }
    webView[key] = value;
  }
}

// permissions: 없으면 []. name/access 조합을 검사한다.
const permissionAccess = {
  clipboard: ['read', 'write'],
  geolocation: ['access'],
  contacts: ['read', 'write'],
  photos: ['read', 'write'],
  camera: ['access'],
  microphone: ['access'],
};
let permissions = [];
if (manifest.permissions !== undefined) {
  if (!Array.isArray(manifest.permissions)) {
    throw new Error('Game manifest permissions must be an array.');
  }
  for (const entry of manifest.permissions) {
    const allowed = typeof entry === 'object' && entry !== null && permissionAccess[entry.name];
    if (!allowed || !allowed.includes(entry.access)) {
      throw new Error(`Game manifest permissions has invalid entry: ${JSON.stringify(entry)}`);
    }
  }
  permissions = manifest.permissions;
}

// navigationBar: 없으면 설정에 넣지 않는다.
const navigationBarKeys = [
  'withBackButton',
  'withHomeButton',
  'withTitle',
  'transparentBackground',
  'theme',
  'initialAccessoryButton',
];
let navigationBar;
if (manifest.navigationBar !== undefined) {
  const nav = manifest.navigationBar;
  if (typeof nav !== 'object' || nav === null || Array.isArray(nav)) {
    throw new Error('Game manifest navigationBar must be an object.');
  }
  for (const key of Object.keys(nav)) {
    if (!navigationBarKeys.includes(key)) {
      throw new Error(`Game manifest navigationBar.${key} is unknown.`);
    }
  }
  for (const key of ['withBackButton', 'withHomeButton', 'withTitle', 'transparentBackground']) {
    if (nav[key] !== undefined && typeof nav[key] !== 'boolean') {
      throw new Error(`Game manifest navigationBar.${key} must be a boolean.`);
    }
  }
  if (nav.theme !== undefined && nav.theme !== 'light' && nav.theme !== 'dark') {
    throw new Error(`Game manifest navigationBar.theme must be "light" or "dark".`);
  }
  if (nav.initialAccessoryButton !== undefined) {
    const button = nav.initialAccessoryButton;
    if (typeof button !== 'object' || button === null || Array.isArray(button)) {
      throw new Error('Game manifest navigationBar.initialAccessoryButton must be an object.');
    }
    if (typeof button.id !== 'string' || typeof button.title !== 'string') {
      throw new Error('Game manifest navigationBar.initialAccessoryButton.id/title must be strings.');
    }
    const icon = button.icon;
    const hasUri = typeof icon === 'object' && icon !== null && typeof icon.source === 'object' &&
      icon.source !== null && typeof icon.source.uri === 'string';
    const hasName = typeof icon === 'object' && icon !== null && typeof icon.name === 'string';
    if (!hasUri && !hasName) {
      throw new Error('Game manifest navigationBar.initialAccessoryButton.icon must have source.uri or name.');
    }
  }
  navigationBar = nav;
}

// appType: 게임·비게임에 맞는 navigationBar 기본값을 매니페스트 값 아래에 깐다(매니페스트 우선).
//   nongame: 토스 내비게이션 바 뒤로가기 버튼(비게임 출시 체크리스트, iOS는 이것 말고 하위 화면을 나갈 길이 없다)
//   game:    투명 배경(네비게이션 바 설정 문서의 게임 권장값)
// 없으면 기본값을 넣지 않는다(이전과 같음).
const navigationBarDefaults = {
  game: { transparentBackground: true },
  nongame: { withBackButton: true },
};
const appType = manifest.appType;
if (appType !== undefined && !Object.hasOwn(navigationBarDefaults, appType)) {
  throw new Error(`Game manifest appType must be "game" or "nongame": ${JSON.stringify(appType)}`);
}
if (appType !== undefined) {
  navigationBar = { ...navigationBarDefaults[appType], ...(navigationBar ?? {}) };
}

const indent = (value) => JSON.stringify(value, null, 2).replaceAll('\n', '\n  ');
const navigationBarLine = navigationBar !== undefined ? `  navigationBar: ${indent(navigationBar)},\n` : '';

const config = `// AUTO-GENERATED by scripts/write-ait-config.mjs from ${path.relative(projectDir, manifestPath)}.
// Do not edit by hand — change the game manifest and re-run "npm run ait:config".
import { defineConfig } from '@apps-in-toss/web-framework/config';

const webBundleDir = process.env.AIT_WEB_BUNDLE_DIR ?? process.env.GODOT_EXPORT_DIR ?? '${webBundleDir}';

export default defineConfig({
  appName: '${appName}',
  brand: {
    primaryColor: '${primaryColor}',
${iconLine}  },
  permissions: ${indent(permissions)},
  webView: ${indent(webView)},
${navigationBarLine}  webBundleDir,
});
`;

// 생성물은 항상 게임 리포(ait build가 cwd로 읽는 곳)에 둔다.
const configPath = path.join(projectDir, 'apps-in-toss.config.ts');
fs.writeFileSync(configPath, config);
console.log(
  `[AIT config] apps-in-toss.config.ts <- ${path.relative(projectDir, manifestPath)} (appName: ${appName}, appType: ${appType ?? 'unset'})`,
);
if (appType === undefined) {
  console.log('[AIT config] appType이 없어 navigationBar 기본값을 넣지 않았습니다. 매니페스트에 "appType": "game" 또는 "nongame"을 적으세요.');
}