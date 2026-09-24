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

`my-game`과 `내 게임`은 실제 게임 ID와 표시 이름으로 바꾸세요.

```bash
node addons/apps_in_toss/tools/ait-godot.mjs init my-game "내 게임"
if [ ! -f package.json ]; then npm init -y; fi
npm --prefix addons/apps_in_toss/tools/bridge ci
```

`.ait/game.manifest.json`에서 `gameId`, `gameVersion`, `displayName`,
`brand.primaryColor`, `releaseChannel`을 확인합니다. 개발 중에는 `sandbox` 채널을 사용합니다.
버전 조합은 함께 생성되는 `.ait/platform.lock.json`에 기록됩니다.

`package.json`은 공식 토스 패키징 CLI가 요구합니다. 내장 브리지의 의존성 설치는
mock 빌드와 토스 CLI 실행에 필요하며, `build:dev`가 대신 설치해 주지는 않습니다.
이미 설정한 게임에서 `init`을 다시 실행하면 매니페스트도 덮어쓰므로 초기 설치 때만 실행하세요.

## 4. Godot Web export 설정

현재 CLI는 아래 export 설정, HTML shell, 폰트 테마를 자동으로 만들지 않습니다.
게임 프로젝트에서 준비한 뒤 검사해야 합니다.

| 항목 | 설정 |
| --- | --- |
| 렌더러 | Compatibility (`gl_compatibility`) |
| Web export 프리셋 | `Apps in Toss Web` |
| Thread Support | 끔 |
| Custom HTML Shell | `res://custom_shell.html` — 실제 파일 필요 |
| GUI Custom Theme | 한글을 지원하는 `FontFile` 리소스가 들어간 테마 — 테마와 폰트 파일 모두 필요 |

[HTML shell 예제](examples/custom-shell.html)를 게임 루트의 `custom_shell.html`로
복사해 사용할 수 있습니다. 이 파일은 Godot export 과정에서 완성되므로 직접 브라우저에서 열지 않습니다.
게임 화면의 한글 폰트는 프로젝트에 추가하고, Theme의 기본 폰트로 지정한 뒤
Project Settings의 `gui/theme/custom`에 그 Theme를 연결하세요.

프리셋은 게임 루트의 `export_presets.cfg`에 저장됩니다. 현재 검사 도구는
이 파일의 첫 프리셋을 읽으므로 `Apps in Toss Web`을 첫 번째로 두세요.

```bash
node addons/apps_in_toss/tools/ait-godot.mjs doctor --strict
```

오류가 있다면 출력된 항목을 수정한 뒤 다시 실행합니다. 일반 `doctor`는
호환성 차이를 경고하지만, 필수 파일 누락이나 잘못된 JSON은 이 모드에서도 실패합니다.
`build`는 항상 strict 검사를 수행합니다.

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
빌드 산출물의 `ait-platform-manifest.json`에는 사용한 버전 조합이 기록됩니다.
업로드와 실제 기능 확인은 [토스 앱 테스트](testing.md#토스-앱에서-확인하기)를 참고하세요.

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

게임 안의 CLI로 `addon:install`이나 `sync`를 실행하면 기본적으로 자기 자신을
가리켜 파일을 갱신하지 않습니다. 반드시 **업데이트된 SDK 원본의 CLI**를 사용하세요.
위 명령은 `platform.lock.json`만 갱신하고 게임 매니페스트는 유지합니다.

같은 버전의 애드온은 `--force`가 없으면 그대로 둡니다. 자기 자신을 대상으로
실행하면 `--force`를 줘도 복사하지 않으며, 게임 경로가 SDK를 가리키는 심볼릭
링크인 경우에도 같습니다.
