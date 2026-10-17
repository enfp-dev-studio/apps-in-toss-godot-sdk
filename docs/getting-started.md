# 설치·프로젝트 준비

[← 프로젝트 소개](../README.md)

아래 작업은 게임 폴더(`project.godot`가 있는 곳)에서 진행합니다.
SDK 저장소 폴더와 게임 폴더는 구분해 주세요. 명령 예시는 macOS/Linux 셸 기준입니다.

## 1. 개발 도구 준비

| 도구 | 필요한 버전·설정 |
| --- | --- |
| Godot | 4.7.2, Compatibility 렌더러 |
| Export Templates | Godot 버전과 일치하는 Web export 템플릿 |
| Node.js | 24 또는 26 |
| npm | 11 |

CLI는 기본적으로 PATH의 `godot`를 실행합니다. macOS 앱으로 설치했다면 터미널에서 경로를 지정하세요.

```bash
export GODOT_BIN=/Applications/Godot.app/Contents/MacOS/Godot
```

## 2. 애드온 설치

[SDK 다운로드](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/archive/refs/heads/main.zip) 후
`addons/apps_in_toss` 폴더를 게임 프로젝트의 같은 위치에 복사합니다.
기존에 설치한 SDK를 갱신하려면 아래 [SDK 업데이트](#sdk-업데이트)를 참고하세요.

Godot에서 **Project Settings → Plugins → Apps in Toss Godot SDK**를 켭니다.
`AIT` 오토로드가 자동 등록되어 게임 스크립트에서 바로 접근할 수 있습니다.
오토로드는 게임 전체에서 공통으로 쓰는 객체이며, 따로 추가할 필요는 없습니다.

## 3. 게임 정보와 의존성 준비

`my-game`과 `내 게임`은 실제 게임 ID와 표시 이름으로 바꾸세요. 게임이 아닌 미니앱(비게임)이면 `--nongame`을 붙입니다.

```bash
node addons/apps_in_toss/tools/ait-godot.mjs init my-game "내 게임"
if [ ! -f package.json ]; then npm init -y; fi
npm --prefix addons/apps_in_toss/tools/bridge ci
```

`.ait/game.manifest.json`에서 `gameId`, `appType`, `gameVersion`, `displayName`,
`brand.primaryColor`, `releaseChannel`을 확인합니다. 개발 중에는 `sandbox` 채널을 사용합니다.
버전 조합은 함께 생성되는 `.ait/platform.lock.json`에 기록됩니다.

`init`은 게임 폴더에 `custom_shell.html`이 없으면 [셸 템플릿](examples/custom-shell.html)을 만들고,
`.gitignore`에 `.godot/`, `build/`, `*.ait`, `!.ait/`, `.ait_relay`, `.mcp/` 중 없는 줄을 더합니다.
있는 파일과 줄은 그대로 둡니다.

`appType`은 `game` 또는 `nongame`입니다. 생성 설정의 `navigationBar` 기본값을 정하고, 매니페스트의
`navigationBar` 값이 그 위에 덮어씁니다. 없으면 기본값을 넣지 않습니다(이전 버전과 같음).

| appType | navigationBar 기본값 | 이유 |
| --- | --- | --- |
| `nongame` | `withBackButton: true` | 비게임은 모든 화면에서 뒤로가기가 동작해야 하고, iOS에는 시스템 뒤로가기가 없습니다. 문서가 기본값을 정하지 않으므로 명시합니다 |
| `game` | `transparentBackground: true` | [네비게이션 바 설정](https://developers-apps-in-toss.toss.im/documentation/common/navigationbar)의 게임 권장값. 게임 바는 더보기·닫기(X)뿐입니다 |

`webView`, `permissions`, `navigationBar`는 선택 필드입니다. `build`·`build:dev`가
매니페스트를 읽어 `apps-in-toss.config.ts`를 다시 만듭니다. 값 검사는
`write-ait-config.mjs`가 수행하며, 허용되지 않은 키·조합은 실패합니다.
`webView`는 아래 기본값 위에 매니페스트 값을 덮어씁니다.

```json
{
  "webView": {
    "mediaPlaybackRequiresUserAction": false,
    "pullToRefreshEnabled": false,
    "allowsInlineMediaPlayback": true,
    "bounces": false,
    "overScrollMode": "never",
    "allowsBackForwardNavigationGestures": false
  },
  "permissions": [{ "name": "clipboard", "access": "read" }],
  "navigationBar": { "withTitle": false, "theme": "dark" }
}
```

허용 키는 다음과 같습니다. `webView`는 `allowsInlineMediaPlayback`,
`bounces`, `pullToRefreshEnabled`, `overScrollMode`(`always`·`content`·`never`),
`mediaPlaybackRequiresUserAction`, `allowsBackForwardNavigationGestures`이며
값은 불리언(단 `overScrollMode`는 위 세 문자열 중 하나)입니다.
`permissions`는 `{ "name", "access" }` 배열이며 조합은
`clipboard` 읽기·쓰기, `geolocation` 접근, `contacts` 읽기·쓰기,
`photos` 읽기·쓰기, `camera` 접근, `microphone` 접근만 가능합니다.
`navigationBar`는 `withBackButton`, `withHomeButton`, `withTitle`,
`transparentBackground`(불리언), `theme`(`light`·`dark`),
`initialAccessoryButton`(`id`·`title` 문자열과 `icon`의 `source.uri` 또는 `name`)입니다.
없으면 `permissions`는 빈 배열, `navigationBar`는 설정에 넣지 않습니다.

`package.json`은 공식 토스 패키징 CLI가 요구합니다. 내장 브리지의 의존성 설치는
mock 빌드와 토스 CLI 실행에 필요하며, `build:dev`가 대신 설치해 주지는 않습니다.
이미 설정한 게임에서 `init`을 다시 실행하면 매니페스트도 덮어쓰므로 초기 설치 때만 실행하세요.

## 4. Godot Web export 설정

CLI는 아래 export 설정과 폰트 테마를 자동으로 만들지 않습니다(HTML shell은 `init`이 템플릿을 만듭니다).
게임 프로젝트에서 준비한 뒤 검사해야 합니다.

| 항목 | 설정 |
| --- | --- |
| 렌더러 | Compatibility (`gl_compatibility`) |
| Web export 프리셋 | `Apps in Toss Web` |
| Thread Support | 끔 |
| Custom HTML Shell | `res://custom_shell.html` — 실제 파일 필요 |
| GUI Custom Theme | 한글을 지원하는 `FontFile` 리소스가 들어간 테마 — 테마와 폰트 파일 모두 필요 |

[HTML shell 템플릿](examples/custom-shell.html)(`init`이 만드는 파일과 같음)을 게임 루트의 `custom_shell.html`로
씁니다. 이 파일은 Godot export 과정에서 완성되므로 직접 브라우저에서 열지 않습니다. 템플릿에 들어 있는 것:

- viewport meta `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.
  비게임 체크리스트는 지도처럼 꼭 필요한 경우가 아니면 제스처 확대를 막으라고 합니다.
  `viewport-fit=cover`가 없으면 iOS에서 Safe Area CSS 값이 0입니다. `doctor`가 둘 다 검사합니다.
- 캔버스 제스처 막기(`touch-action: none`, 길게 눌러 선택·돋보기, `overscroll-behavior: none`)
- 렌더 해상도 상한(기기 배율 3을 2로, `AppsInTossShell.setPixelCap()`으로 바꿈) — 발열·배터리
- 로딩 화면과 진행률, WebGL 2 미지원·로딩 실패 안내(한국어)

게임 화면의 한글 폰트는 프로젝트에 추가하고, Theme의 기본 폰트로 지정한 뒤
Project Settings의 `gui/theme/custom`에 그 Theme를 연결하세요.

모바일 화면에 맞추려면 Project Settings도 확인하세요.

| 항목 | 권장 | 이유 |
| --- | --- | --- |
| `display/window/size/viewport_width`·`viewport_height` | 세로 화면이면 360×640 | `canvas_items` + `expand`이면 UI 1단위가 min(폭/360, 높이/640) CSS px라 360×640 이상 기기에서 1 CSS px 이상입니다. 기준을 390×844로 두면 375×667에서 0.79배가 되어 13px 글자가 10.3px, 44px 터치 영역이 34.8px로 줄어듭니다 |
| `display/window/stretch/mode`·`aspect` | `canvas_items`, `expand` | 넓은 기기에서는 더 많이 보이고 글자는 줄지 않습니다 |
| `application/run/low_processor_mode` | 정지 화면이 많은 비게임은 `true` | 바뀔 때만 그려 배터리를 아낍니다. 계속 움직이는 게임은 끕니다 |
| `rendering/textures/vram_compression/import_etc2_astc` | `true`(프리셋 `vram_texture_compression/for_mobile`도) | 모바일 GPU 압축 텍스처. 메모리·번들 크기. 프리셋만 켜고 이 값을 끄면 export가 이유 없이 "configuration errors"로 실패합니다(`doctor`가 strict에서 잡음) |

Export 프리셋의 `exclude_filter`에는 게임에 쓰지 않는 폴더(`addons/apps_in_toss/sample/*`, 원본 그림·문서·도구)를 넣습니다.
개발용 도구는 출시 프리셋에서 빼고 두 번째 프리셋(예: `Apps in Toss Web (dev tools)`)에만 넣은 뒤,
`GODOT_EXPORT_PRESET='Apps in Toss Web (dev tools)'`로 `build:dev`·`build --debug-console`을 실행합니다.
개발용 도구는 `load()`로만 부르고 `preload`·`class_name`을 쓰지 마세요. 출시 빌드에 파일이 없으면 깨지거나 목록에 남습니다.

프리셋은 게임 루트의 `export_presets.cfg`에 저장됩니다. 현재 검사 도구는
이 파일의 첫 프리셋을 읽으므로 `Apps in Toss Web`을 첫 번째로 두세요.

```bash
node addons/apps_in_toss/tools/ait-godot.mjs doctor --strict
```

오류가 있다면 출력된 항목을 수정한 뒤 다시 실행합니다. 일반 `doctor`는
호환성 차이를 경고하지만, 필수 파일 누락이나 잘못된 JSON은 이 모드에서도 실패합니다.
`build`는 항상 strict 검사를 수행합니다.

`doctor`는 출시 전에 고칠 것도 알립니다. 셸 viewport meta의 확대 막기·`viewport-fit=cover`, 게임 스크립트의
테스트 광고 그룹 ID(`ait-ad-test-…`), `appType` 없음, git에서 무시되지 않는 `.ait_relay`, `addons/apps_in_toss/tools/.gdignore` 없음은
경고입니다. Godot MCP가 남긴 `McpBridge` 오토로드가 `project.godot`에 있거나(출시 빌드에 실리면 안 됨), 프리셋의 모바일 VRAM 압축에
맞는 ETC2/ASTC import가 꺼져 있으면 strict에서 실패합니다.

## 5. 브라우저에서 실행

```bash
node addons/apps_in_toss/tools/ait-godot.mjs build:dev
node addons/apps_in_toss/tools/ait-godot.mjs preview
```

`build:dev`는 모의 토스 API와 DevTools 패널이 포함된 Web 번들을 만들고,
`preview`는 `build/godot-web`을 로컬에서 제공합니다. 서버는 `Ctrl+C`로 종료합니다.
모의 응답으로 확인할 수 있는 기능은 [테스트 가이드](testing.md)에 정리했습니다.

SDK의 연동 확인 화면을 사용하려면 메인 씬의 `Control` 노드에
`addons/apps_in_toss/sample/ait_sample_scene.gd`를 연결합니다.
빌드한 URL에 `?e2e=true`를 붙이면 인자가 없는 API를 자동 점검합니다.

## 6. 토스 앱용 파일 만들기

```bash
node addons/apps_in_toss/tools/ait-godot.mjs build
```

설정 검사 → Godot Web export → 브리지 주입·검증 → `.ait` 패키징 순으로 진행합니다.
`build`는 export 전에 `build/godot-web`을 비우며, 개발·테스트 전용 파일
(`apps-in-toss-godot-bridge.mock.js`, `ait-devtools-panel.js`, `ait-debug-console.js`)이
release 결과에 남으면 검사가 실패합니다. export 폴더가 압축 해제 기준 100MiB를 넘어도 실패합니다
(`.ait`는 압축 해제 100MB 이하여야 올라갑니다. 100MB와 100MiB 사이면 경고).
빌드 산출물의 `ait-platform-manifest.json`에는 사용한 버전 조합이 기록됩니다.
업로드와 실제 기능 확인은 [토스 앱 테스트](testing.md#토스-앱에서-확인하기)를 참고하세요.

실기기에서 `/ait:debug`로 원격 디버깅할 테스트 번들은 `build --debug-console`로 만듭니다.
검수에는 쓰지 말고 [실기기 원격 디버깅](testing.md#실기기-원격-디버깅)을 참고하세요.

```bash
node addons/apps_in_toss/tools/ait-godot.mjs build --debug-console  # 테스트 전용, 검수 제출 금지
```

플러그인을 켜면 Godot 에디터의 **AIT 탭**에서도 Doctor, Dev Server,
Build & Package를 실행할 수 있습니다. Configuration 열기, Publish 안내,
서버 정지 버튼도 제공합니다.

## SDK 업데이트

업데이트된 SDK 원본을 준비한 뒤, 게임 폴더에서 실행합니다.
아래 `SDK`는 다운로드·클론한 새 SDK 경로로 바꾸세요.

```bash
SDK=/path/to/apps-in-toss-godot-sdk
GODOT_PROJECT_DIR="$PWD" node "$SDK/addons/apps_in_toss/tools/ait-godot.mjs" addon:install --force
cp "$SDK/addons/apps_in_toss/tools/templates/platform.lock.json" .ait/platform.lock.json
npm --prefix addons/apps_in_toss/tools/bridge ci
node addons/apps_in_toss/tools/ait-godot.mjs doctor --strict
```

`addon:install --force`는 애드온 폴더를 지우고 다시 복사하지만, SDK가 배포하지 않는 `.uid`(Godot이 게임에서 만든 값)는
그대로 둡니다. 애드온의 `tools/.gdignore`는 SDK가 배포하므로 Godot이 CLI와 `node_modules`를 스캔하지 않습니다.

게임 안의 CLI로 `addon:install`이나 `sync`를 실행하면 기본적으로 자기 자신을
가리켜 파일을 갱신하지 않습니다. 반드시 **업데이트된 SDK 원본의 CLI**를 사용하세요.
위 명령은 `platform.lock.json`만 갱신하고 게임 매니페스트는 유지합니다.

같은 버전의 애드온은 `--force`가 없으면 그대로 둡니다. 자기 자신을 대상으로
실행하면 `--force`를 줘도 복사하지 않으며, 게임 경로가 SDK를 가리키는 심볼릭
링크인 경우에도 같습니다.
