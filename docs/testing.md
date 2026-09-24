# 테스트 가이드

[← 프로젝트 소개](../README.md) · [설치 가이드](getting-started.md)

자동 검사는 SDK 코드와 빌드 도구를 검증합니다. 실제 게임 플레이와
토스 앱에서의 인증·결제·광고는 별도로 확인해야 합니다.

## 자동 검사가 확인하는 범위

| 검사 | 확인하는 내용 |
| --- | --- |
| [회귀 테스트](../.github/workflows/regressions.yml) | Node 24/26에서 설치 안전성, SDK 캐시, API 매니페스트·생성 파일 일치, 브리지 호출·이벤트 전달 |
| [브리지·패키징](../.github/workflows/bridge-package.yml) | 소스·내장 브리지 타입 검사, production/mock 빌드, 최소 HTML 입력의 `.ait` 패키징 |
| [Godot 애드온](../.github/workflows/godot-addon.yml) | Godot 4.7.2 headless import, GDScript 구문 검사, AdMob 브리지 부재 오류·구독 해제 |
| 별도 확인 | 전체 Godot Web export, 브라우저 게임 플레이, 토스 앱·실기기 동작 |

PR 생성·업데이트와 `main` push 때 실행하며, GitHub Actions 탭에서 수동 실행도 가능합니다.
[README 상태표](../README.md#자동-검사-상태)는 최신 `main` 결과를 보여줍니다.
PR 결과는 PR 화면에서 확인하세요. 배지는 GitHub가 갱신하므로 결과를 README에 직접 쓸 필요가 없습니다.

## 로컬에서 자동 검사 다시 실행하기

다음 명령은 **SDK 저장소 루트**에서 실행합니다. 게임 폴더에서 실행하는 명령과 구분하세요.

```bash
npm --prefix bridge ci && npm --prefix addons/apps_in_toss/tools/bridge ci
node --test tests/*.test.mjs  # 회귀 테스트
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

생성 파일이 달라졌다면 API 원본과 생성 결과를 확인하세요. 의도한 API 변경이라면
생성된 GDScript도 함께 커밋해야 CI의 일치 검사를 통과합니다.

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
직접 호출해야 합니다. 브라우저에서 게임 전체를 플레이하는 검증은 현재 CI에 포함되지 않습니다.

샘플의 구성과 제한은 [샘플 안내](../addons/apps_in_toss/sample/README.md)를 참고하세요.

## 토스 앱에서 확인하기

로그인·결제·광고 실동작 확인은 토스 CLI로 업로드한 뒤 샌드박스 앱/토스 앱 QR
테스트에서 합니다. 게임 루트에 프레임워크 의존성을 추가하지 않고 내장 바이너리를
그대로 씁니다. 아래 명령은 인증 정보를 등록하고 빌드 결과를 업로드하는 실제 배포 단계입니다.
먼저 [설치·빌드 가이드](getting-started.md)에 따라 `.ait` 파일을 만드세요:

```bash
./addons/apps_in_toss/tools/bridge/node_modules/.bin/ait token add   # 최초 1회, 콘솔 API 키
./addons/apps_in_toss/tools/bridge/node_modules/.bin/ait deploy
```

브라우저의 모의 주문·광고 이벤트가 통과해도 실제 결제 승인, 서버 지급 검증,
광고 송출과 보상을 검증한 것은 아닙니다. 게임에서 사용하는 기능을 토스 앱에서 확인하세요.

## 2026-09-24 샘플 실행 결과

Godot 4.7.2와 같은 버전의 비스레드 Web export 템플릿으로 SDK 샘플을 실행했습니다.
이는 한 번의 로컬 실행 기록이며, 위 자동 CI 범위와는 구분합니다.

| 확인한 항목 | 결과 |
| --- | --- |
| `doctor --strict` | 통과 |
| 실제 Godot Web export와 실전 브리지 주입·검증 | 통과 |
| 실제 Web 출력의 `.ait` 패키징 | 통과 (배포는 실행하지 않음) |
| mock 개발 빌드와 브라우저 화면·한글 표시 | 통과 |
| 샘플 `?e2e=true` | 성공 13개, 실패 0개 |
| 샘플 버튼 | 모의 로그인 인가 코드 수신, 상품 2개 조회, 전면 광고 로드·종료 확인 |

임시 게임 프로젝트에 샘플 씬·폰트 테마·HTML shell을 준비했고,
모의 광고 확인에만 임시 광고 그룹 ID를 사용했습니다.
실제 토스 로그인·결제·광고 송출과 게임 전체 플레이는 이 기록에 포함하지 않습니다.
