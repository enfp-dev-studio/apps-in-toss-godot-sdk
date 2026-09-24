# Apps in Toss Godot SDK

Godot 4 Web 게임에서 Apps in Toss(앱인토스) 기능을 쓰게 해주는 커뮤니티 SDK입니다.
공식 Unity SDK와 같은 레이어 구조를 따릅니다: 게임에서는 `AIT` 오토로드만 호출하면
로그인·결제·광고·게임센터가 토스 앱과 연결됩니다.

> **상태: 커뮤니티 초기 프리뷰.** CLI 설치·검사 흐름, GDScript 구문 검사,
> 브리지 타입 검사·배포용 빌드, 호출·이벤트 전달 회귀 테스트를 로컬에서 확인했습니다.
> 최소 HTML 입력으로 `.ait` 패키징도 확인했습니다. 전체 Godot Web export는
> 이번 검수에서 실행하지 않았으며, 로그인·결제·광고 실동작은 샌드박스 앱과
> 실제 토스 앱에서 최종 검증이 필요합니다.

## 자동 검사 상태

main에 push하거나 PR을 열고 업데이트하면 GitHub Actions가 아래 세 그룹을
자동으로 실행합니다. Actions 탭에서 수동 실행도 가능합니다. 배지를 누르면
실행 시각·커밋·로그를 볼 수 있습니다. 설정을 push하고 첫 실행을 마치기
전에는 배지가 표시되지 않거나 `no status`로 나올 수 있습니다. PR 실행
결과는 PR 화면에서 보고, 아래 배지는 main 기준 최신 결과를 보여줍니다.

| 그룹 | 자동 검사 범위 | 최신 main 결과 |
| --- | --- | --- |
| 회귀 테스트 | `npm --prefix bridge ci` 후 `node --test tests/*.test.mjs` (Node 24/26), 생성 파일 일치 | [![Regressions](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/regressions.yml/badge.svg?branch=main)](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/regressions.yml?query=branch%3Amain) |
| 브리지·패키징 | 소스·내장 bridge 타입 검사와 production/mock 빌드, 최소 HTML `.ait` 패키징 스모크 | [![Bridge and package](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/bridge-package.yml/badge.svg?branch=main)](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/bridge-package.yml?query=branch%3Amain) |
| Godot 애드온 | Godot 4.7.2 headless 임시 프로젝트 import, GDScript 컴파일 게이트, AdMob 수명 검사 | [![Godot addon](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/godot-addon.yml/badge.svg?branch=main)](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/godot-addon.yml?query=branch%3Amain) |
| 전체 Web export·브라우저 실플레이·실기기 네이티브 | 자동화 없음 — 수동 확인 | 배지 없음 (수동) |

배지는 GitHub가 실행 결과에 따라 갱신하는 이미지라 README를 따로 고칠
필요가 없습니다. 전체 Godot Web export, 브라우저에서 게임 전체 플레이, 토스
앱·실기기에서의 로그인·결제·광고 실동작은 자동 검사가 아니라 위 표의
마지막 행대로 수동으로 확인합니다.

<details>
<summary>로컬에서 같은 검사 다시 실행하기</summary>

```bash
npm --prefix bridge ci && npm --prefix addons/apps_in_toss/tools/bridge ci
node --test tests/*.test.mjs  # 회귀 15개
git diff --exit-code -- addons/apps_in_toss/generated/  # 생성 파일 변경 확인

# 소스·내장 브리지 타입 검사와 production/mock 빌드
(cd bridge && npx tsc --noEmit)
(cd addons/apps_in_toss/tools/bridge && npx tsc --noEmit)
(cd bridge && npm run build && AIT_BRIDGE_MOCK=1 npm run build)
(cd addons/apps_in_toss/tools/bridge && npm run build && AIT_BRIDGE_MOCK=1 npm run build)

node tests/run-minimal-package.mjs  # 최소 .ait 패키징
# macOS 앱 경로 예시. PATH에 설치했다면 GODOT_BIN=godot 사용
GODOT_BIN=/Applications/Godot.app/Contents/MacOS/Godot \
  node tests/run-godot-addon.mjs
```

</details>

## 지원 요약

- Godot 4.x (확인 버전 4.7.2), Compatibility renderer, Web export
- 카탈로그 35개 항목: 로그인·사용자 키 4종, 환경·권한·공유·뷰 7종, 저장소 6종
  (배치 get/set·전체 삭제 포함), 클립보드 2종, 햅틱 1종, 인앱결제 5종(구독 정보
  포함), 게임센터 3종, AdMob 3종, 바이럴 3종, 내비게이션 바 1종 —
  Unity SDK 3.5.0 / web-framework 3.5.0 대응. 35개 중 AdMob load/show 2개는
  구독형이라 일반 호출 카탈로그 항목 그대로는 호출할 수 없고 전용 래퍼를 씁니다
  (아래 참고).
- 수명 관리 래퍼(카탈로그 카운트와 별개): 전면 광고 load/show, 일회성·구독
  결제 주문(지급 콜백 포함), AdMob load/show, 게임 정보 오버레이 구독
- 빌드 파이프라인: 검사(doctor) → Web export → 브리지 주입 → `.ait` 패키징
- 브라우저 Dev Server: 토스 앱 없이 mock SDK + DevTools 패널로 개발·API 테스트

## 전제 조건

- Node.js 24 또는 26, npm 11 (lock의 toolchain과 doctor가 검사합니다)
- Godot 4.7.2 + Web export 템플릿, `GODOT_BIN` (기본 `godot`)
- 게임 프로젝트: Compatibility renderer, `export_presets.cfg`에
  `Apps in Toss Web` 프리셋 — thread support 끔, custom HTML shell
  `res://custom_shell.html` (실제 파일 필요), 한글용 FontFile이 들어간 custom theme.
  이 항목들은 `doctor`가 검사하며, 없으면 strict에서 실패합니다.
  릴리스 빌드(`build`)는 항상 strict 검사를 강제합니다.

## 빠른 시작

게임 리포지토리(`project.godot`이 있는 루트)에서 진행합니다. 먼저 이 SDK를
구하세요 — 릴리스 zip/클론 등 다운로드한 SDK 경로를 아래 `SDK` 자리에 넣습니다.

```bash
# 0. SDK 확보 (예: 다운로드·클론한 경로 — 실제 경로로 바꾸세요)
SDK=/path/to/apps-in-toss-godot-sdk

# 1. 애드온 설치 — SDK 원본 CLI를 게임 루트 기준으로 실행합니다
GODOT_PROJECT_DIR="$PWD" node "$SDK/addons/apps_in_toss/tools/ait-godot.mjs" addon:install --force
#    (또는 SDK의 addons/ 폴더를 게임 루트에 통째로 복사한 뒤 아래부터 설치된 CLI 사용)

# 2. .ait/ 생성 — 설치된 CLI의 내장 템플릿에서 lock과 매니페스트 예시를 복사합니다
node addons/apps_in_toss/tools/ait-godot.mjs init <gameId> "<표시이름>"
#    → .ait/game.manifest.json을 열어 gameId, gameVersion, displayName,
#      brand.primaryColor, releaseChannel(sandbox/canary/production)을 채우기
#    → Godot 에디터에서 Project Settings → Plugins →
#      "Apps in Toss Godot SDK" 활성화 (AIT 오토로드가 자동 등록됩니다)

# 3. 패키징 전제 — 게임 루트에 package.json이 없으면 만듭니다
if [ ! -f package.json ]; then npm init -y; fi
#    브리지 의존성 설치 (mock 빌드·ait CLI에 필요 — build:dev는 자동 설치하지 않습니다)
npm --prefix addons/apps_in_toss/tools/bridge ci

# 4. 검사 후 첫 빌드
node addons/apps_in_toss/tools/ait-godot.mjs doctor --strict
node addons/apps_in_toss/tools/ait-godot.mjs build        # 검사→export→브리지 주입→ait build로 .ait 패키징
```

> `addon:install`은 SDK 애드온을 게임의 `addons/apps_in_toss`로 복사합니다.
> 이미 설치된 같은 버전이면 그대로 두고, 다른 버전으로 바꾸려면 `--force`가
> 필요합니다. CLI를 애드온 자기 자신 안에서 실행하거나, 게임 경로가 SDK를
> 가리키는 심볼릭 링크여도 파일을 변경하지 않고 플러그인 활성화 안내만
> 합니다 (그래서 `--force` 로도 자기 자신을 지우지 않습니다). Godot 에디터의
> **AIT 탭**에서도 같은 명령을 Doctor / Dev Server / Build & Package 버튼으로
> 실행할 수 있습니다 (그 외 Configuration 열기·Publish 안내·서버 정지 버튼 포함).

개발 중에는 브라우저에서 테스트할 수 있습니다. 먼저 위 3단계에서 브리지 의존성을 설치하세요.

```bash
node addons/apps_in_toss/tools/ait-godot.mjs build:dev    # mock 브리지 + DevTools 패널 개발 번들
node addons/apps_in_toss/tools/ait-godot.mjs preview      # build/godot-web 로컬 서빙
```

`AIT.is_available()`은 주입된 브리지(실전) 또는 mock 브리지(개발 빌드)가 있을
때 true이고, 둘 다 없는 에디터·일반 브라우저·주입 안 된 export에서는 false이며
호출은 `AIT_BRIDGE_UNAVAILABLE` 에러로 비동기 반환됩니다. mock 개발 빌드는
브라우저에서도 모의 응답을 돌려줍니다. 현재 DevTools 3.2.0에는
`NavigationBar.setOptions`와 `Viral.*`가 없어 mock에서 호출할 수 없습니다.
호출 전에 `AIT.has_api()`로 확인하세요.

## 브라우저 시뮬레이터의 테스트 범위

여기서 시뮬레이터는 `build:dev`와 `preview`로 실행하는 브라우저 mock 및
DevTools 패널을 뜻합니다. 아래는 설치된 DevTools 3.2.0 구현 기준입니다.

| 항목 | 브라우저에서 확인할 수 있는 범위 | 토스 앱에서 확인할 항목 |
| --- | --- | --- |
| 게임 화면·조작 | Godot Web 게임의 화면, 입력, 게임 로직 | 기기별 성능과 WebView 동작 |
| 로그인·사용자 키 | 모의 사용자·로그인 응답에 따른 화면과 오류 처리 | 실제 인증, 서버 토큰 교환 |
| 인앱결제 | 모의 상품·주문, 결제 실패·보류, 지급 콜백과 미결 주문 복구 처리 | 실제 결제 승인·환불, 서버 지급 검증 |
| 전면 광고·AdMob | 로드·표시·종료·보상 이벤트, 광고 없음 오류 처리 | 실제 광고 송출과 보상 조건 |
| 저장소·게임센터 | 브라우저 저장소 읽기·쓰기, 모의 프로필·점수 처리 | 토스 저장소와 실제 랭킹 반영 |
| 권한·네트워크 | 권한 거부·오프라인 등 모의 상태에 대한 처리 | OS 권한 창, 실제 통신과 기기 기능 |

샘플 씬의 `?e2e=true`는 인자가 없는 API만 순회하며 `close_view`는 제외합니다.
실제 결제·광고 동작까지 검증하는 자동 테스트는 아닙니다. 모의 시나리오 중
일부는 DevTools 패널에서 설정할 수 있고, 인자가 필요한 API는 게임 코드에서
직접 호출해야 합니다. 이번 검수에서는 브라우저 시뮬레이터를 띄워 게임 전체를
플레이하는 검증은 진행하지 않았습니다.

## 토스 앱에서 확인하기

로그인·결제·광고 실동작 확인은 토스 CLI로 업로드한 뒤 샌드박스 앱/토스 앱 QR
테스트에서 합니다. 게임 루트에 프레임워크 의존성을 추가하지 않고 내장 바이너리를
그대로 씁니다 (`--help` 까지만 로컬 확인, token/deploy 실행은 실제 배포 때):

```bash
./addons/apps_in_toss/tools/bridge/node_modules/.bin/ait token add   # 최초 1회, 콘솔 API 키
./addons/apps_in_toss/tools/bridge/node_modules/.bin/ait deploy
```

## 게임 코드에서 쓰기

`AIT` 오토로드 하나로 전부 접근합니다. Unity의 `AIT.*` 정적 API에 대응합니다.
아래 예제는 콜백 함수를 포함하며 GDScript 구문 검사를 통과했습니다.

```gdscript
extends Control

func _ready() -> void:
    if not AIT.is_available():
        return  # 주입된 브리지 없음 — 에디터/일반 브라우저/미주입 export

    AIT.ads.ad_loaded.connect(_on_ad_loaded)
    AIT.ads.ad_failed.connect(_on_ad_failed)
    AIT.ads.load_full_screen_ad({"adGroupId": "광고그룹ID"})

    # 사용자 식별 (로그인 UI 없이).
    # getUserKeyForGame은 HASH 외에도 "ERROR"/없음을 돌려줄 수 있어서
    # Dictionary + type=="HASH"를 먼저 확인해야 합니다.
    var identity := await AIT.get_user_key_for_game(15_000)
    if bool(identity.get("ok", false)):
        var result: Variant = identity.get("result")
        if typeof(result) == TYPE_DICTIONARY and String(result.get("type", "")) == "HASH":
            print(String(result.get("hash", "")))

    # 내비게이션 바 (web-framework 3.5.0 추가 — 넘긴 필드만 반영).
    # mock 개발 빌드에서는 미지원이므로 has_api 가드를 권장합니다.
    if AIT.has_api("NavigationBar.setOptions"):
        await AIT.invoke_and_wait("NavigationBar.setOptions", [{"theme": "dark"}], 15_000)


func _on_ad_loaded(subscription_id: int) -> void:
    print("ad loaded: %d" % subscription_id)
    AIT.ads.dispose(subscription_id)


func _on_ad_failed(subscription_id: int, error: Dictionary) -> void:
    push_warning("ad failed: %s" % JSON.stringify(error))
    AIT.ads.dispose(subscription_id)
```

AdMob load/show는 구독형 API라서 자동 생성 일반 호출 래퍼가 아니라 전용
모듈을 씁니다.

```gdscript
extends Control

func _ready() -> void:
    AIT.admob.admob_loaded.connect(_on_admob_loaded)
    AIT.admob.admob_event.connect(_on_admob_event)
    AIT.admob.admob_failed.connect(_on_admob_failed)
    AIT.admob.load_admob({"adGroupId": "광고그룹ID"})


func _on_admob_loaded(subscription_id: int) -> void:
    print("admob loaded: %d" % subscription_id)
    AIT.admob.dispose(subscription_id)


func _on_admob_event(subscription_id: int, event: Variant) -> void:
    print("admob event %d: %s" % [subscription_id, JSON.stringify(event)])


func _on_admob_failed(subscription_id: int, error: Dictionary) -> void:
    push_warning("admob failed: %s" % JSON.stringify(error))
    AIT.admob.dispose(subscription_id)
```

API 항목의 단일 출처는 `bridge/api-manifest.json`이고,
`addons/apps_in_toss/generated/ait_generated_catalog.gd`는 그것에서 생성된
출력물입니다. 자세한 사용 방법(로그인 서버 연동, 결제 지급/복구, 전면 광고)은
플랫폼 리포 [`docs/godot-integration.md`](https://github.com/enfp-dev-studio/toss-web-game/blob/main/docs/godot-integration.md)를 참고하세요.

주의: 자동 생성 설정 파일의 `permissions`는 빈 배열입니다. 클립보드 등 권한이
필요한 API가 기본 상태에서 동작한다고 가정하지 마세요. 권한 선언과 실기기
동작은 토스 앱에서 직접 확인해야 합니다.

## 빌드

이 저장소는 애드온과 JavaScript 브리지 소스를 제공합니다. 게임 빌드는 애드온에 내장된
`ait-godot` CLI가 수행합니다:

```bash
# 게임 리포에서 (애드온 설치 후 — 별도 checkout/설치 불필요)
node addons/apps_in_toss/tools/ait-godot.mjs doctor          # 호환성 검사
node addons/apps_in_toss/tools/ait-godot.mjs doctor --strict # 릴리스용 엄격 검사
node addons/apps_in_toss/tools/ait-godot.mjs build           # 검사→Godot Web export→브리지 주입→검증→ait build로 .ait 패키징
node addons/apps_in_toss/tools/ait-godot.mjs build:dev       # mock 개발 빌드 (브라우저 테스트용)
```

`doctor`는 기본 advisory로 호환성 불일치를 경고하지만, 필수 파일 누락이나
잘못된 JSON은 이 모드에서도 실패합니다. canary/production 채널에서
`--strict` 없이 실행하면 strict 필요 경고를 냅니다. `build`는 내부적으로 항상
strict 검사를 강제합니다. 빌드 산출물에는 `ait-platform-manifest.json`이
포함되어 어떤 조합으로 만들어졌는지 기록됩니다 — 롤백·재현에 사용하세요.

## SDK 자체 개발 (이 리포)

- `bridge/` — 브리지 소스(타입스크립트). `bridge/` 안에서
  `npm install && npm run build`로 번들 생성, `npm run generate`로
  GDScript 카탈로그 재생성. 빌드 파이프라인이 쓰는 복사본
  `addons/apps_in_toss/tools/bridge/`와 내용은 직접 동일하게 유지해야 합니다
  (package.json·api-manifest·lockfile 포함). 어느 쪽에서든
  `npm run generate`를 실행하면 같은 생성물이 나오고, `npm install` 시 실행되는 `prepare`도
  추가 환경변수 없이 올바른 위치에 씁니다.
- `addons/apps_in_toss/tools/` — 게임 파이프라인 CLI(내장). `scripts/`는
  doctor/export/verify/package 단계, `templates/`는 init용 lock·매니페스트 예시.
- 애드온 수정분을 게임 리포에 반영하려면, **업데이트된 SDK 원본의 CLI**를
  게임 루트 기준으로 실행하세요 (게임 안의 CLI는 기본적으로 자기 자신을
  가리켜 `addon:install`/`sync`를 실행해도 파일을 갱신하지 않습니다):
  `GODOT_PROJECT_DIR=<게임> node <업데이트된-SDK>/addons/apps_in_toss/tools/ait-godot.mjs addon:install --force`.
  SDK 템플릿의 `platform.lock.json`이 바뀌었으면 게임의
  `.ait/platform.lock.json`에 복사해 넣으세요. 이때 `init`을 다시 실행하면
  `.ait/game.manifest.json`이 덮어써지므로 lock 파일만 복사합니다.
- 이 리포에는 루트 npm 스크립트가 없습니다. `npm --prefix bridge ci`로
  테스트에 필요한 브리지 의존성을 설치한 뒤 회귀 테스트를 실행합니다:
  `node --test tests/*.test.mjs` (설치 안전성·매니페스트 일치 여부·SDK 캐시·브리지
  호출·이벤트 전달), 브리지 `npx tsc --noEmit` + `npm run build` (양쪽 복사본),
  Godot 헤드리스 구문 검사(`tools/scripts/verify-gdscript.gd`)와
  `tests/gdscript/` 스크립트.

## Unity SDK 업데이트 따라잡기 (2026-09-24 확인)

- 기준: 공식 Unity SDK `release/v3.5.0`
  (`29682a9cbc9ff35bf3008d3fb2b790111d34887e`,
  [2026-09-22 공식 릴리스](https://github.com/toss/apps-in-toss-unity-sdk/releases/tag/release%2Fv3.5.0)).
- `release/v3.2.0 → release/v3.5.0` Unity SDK 전체 diff는 패키지 메타데이터·
  체인지로그·빌드 템플릿 npm manifest/lock 5개 파일뿐이고 Runtime 소스 변경은
  없습니다. 단, npm web-framework 자체의 API 표면에는 3.5.0 추가분이 있어서
  아래 한 건을 반영했습니다.
- 반영: `NavigationBar.setOptions` → `navigation_bar_set_options` (매니페스트
  양쪽 + 생성 GDScript + platform lock SHA). 이미 포함돼 있던 추가 API
  (Viral 3종, Storage 배치 2종, Game 정보 오버레이 구독)는 그대로 유효합니다.
- `Promotion.openContactsInvite`는 사용 비권장으로 변경됐습니다. 이 SDK에는
  매핑되지 않은 API라 관련 코드 변경은 없습니다.
- 버전: web-framework 3.4.0 → 3.5.0 (루트·내장 lockfile 포함),
  devtools는 기존 3.2.0을 유지(상류 템플릿 3.1.1로 내리지 않음 — 3.5.0 신규
  API의 mock 응답은 제공하지 않음), 이 SDK 플러그인 버전은 0.2.0 유지.

## 상태

토스 공식 SDK가 아닌 **커뮤니티 포트(early preview)**입니다. 배포 전 샌드박스·
실기기 테스트가 필요합니다. 로컬 검사와 최소 HTML의 패키징 결과가 실제 게임의
Web export나 결제 지급 흐름까지 보장하지는 않습니다.
