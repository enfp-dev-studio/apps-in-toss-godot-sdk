# SDK 개발·업데이트 기록

[← 프로젝트 소개](../README.md) · [검사 실행 방법](testing.md)

이 문서는 SDK 자체를 수정하는 개발자를 위한 안내입니다.
게임에 SDK를 설치하는 방법은 [설치 가이드](getting-started.md)를 참고하세요.

## 저장소 구조

| 경로 | 역할 |
| --- | --- |
| `addons/apps_in_toss/` | 게임에 설치하는 Godot 애드온과 `AIT` 진입점 |
| `bridge/` | TypeScript 브리지 원본 |
| `addons/apps_in_toss/tools/bridge/` | 게임 빌드가 실제로 사용하는 브리지 복사본 |
| `addons/apps_in_toss/tools/scripts/` | 설정 검사·export·브리지 주입·패키징 단계 |
| `addons/apps_in_toss/tools/templates/` | 초기화용 버전 lock과 게임 매니페스트 예시 |
| `tests/`, `.github/workflows/` | 회귀 테스트와 자동 검사 |

구조는 공식 Unity SDK의 게임 API·브리지 레이어에 대응합니다.
브리지 내부의 호출·콜백 처리 방식은 [브리지 안내](../bridge/README.md)에 있습니다.

## 브리지와 API 수정

`bridge/`와 애드온에 포함된 복사본의 소스, `package.json`, `api-manifest.json`,
lockfile을 함께 갱신해야 합니다. 게임 빌드는 애드온의 복사본을 사용합니다.

```bash
cd bridge
npm ci
npm run generate
npx tsc --noEmit
npm run build
```

API 항목의 원본은 [bridge/api-manifest.json](../bridge/api-manifest.json)입니다.
어느 쪽 브리지에서든 `npm run generate`를 실행하면 애드온의 같은 위치에
API와 카탈로그 GDScript를 생성합니다. 의존성 설치 시 실행되는 `prepare`도 이를 수행합니다.

매니페스트가 바뀌면 `templates/platform.lock.json`의 `aitGodotSdk.apiManifestSha256`도
내장 브리지 매니페스트의 SHA-256과 맞춰야 합니다. 버전과 커밋은 실제 의존성에 맞춰 갱신하고,
변경한 API의 호출 방식과 이벤트 처리를 회귀 테스트로 확인하세요.

이 저장소에는 루트 npm 스크립트가 없습니다. 전체 검사 명령은
[테스트 가이드](testing.md#로컬에서-자동-검사-다시-실행하기)에 있습니다.
수정한 SDK를 게임에 반영하는 방법은 [SDK 업데이트](getting-started.md#sdk-업데이트)를 참고하세요.

## 공식 SDK 업데이트 확인

공식 릴리스 노트와 고정 커밋 이후의 코드 차이를 함께 확인합니다.
Unity SDK와 npm web-framework, DevTools의 버전이 같다고 가정하지 말고 실제 의존성을 비교하세요.
새 API에 맞춰 양쪽 브리지, GDScript 래퍼·생성 파일, 버전 lock, 테스트와 문서를 갱신합니다.

문서도 용도별로 유지합니다. README에는 소개·시작 순서·검사 상태만 두고,
설치 변경은 설치 가이드에, 호출 예제는 API 가이드에, 검사 범위는 테스트 가이드에 반영하세요.
상세한 변경 근거는 아래처럼 날짜와 함께 기록합니다.

## Godot 버전 업데이트

[Godot 정식 릴리스](https://github.com/godotengine/godot/releases)와
`platform.lock.json`의 `godot.version`을 비교합니다. 새 버전에 대응할 때는
엔진과 같은 버전의 Web export 템플릿을 함께 준비합니다.

- `godot.version`과 `godot.feature`를 맞춥니다. feature는 `4.7`처럼 major.minor 값입니다.
- Godot 버전이 명시된 CI 워크플로와 문서도 함께 갱신합니다.
- 구문 검사 외에 샘플의 실제 Web export, 브라우저 로딩·API 호출, `.ait` 패키징을 확인합니다.
- 테스트 결과와 미검증 범위를 PR에 기록하고, 검토 후 지원 버전을 올립니다.

검증용 엔진은 별도 경로에서 실행할 수 있습니다. `GODOT_BIN`으로 경로를 지정하면
사용자가 기존에 설치한 Godot 앱을 바꾸지 않고도 새 버전을 시험할 수 있습니다.

## 2026-09-24: Unity SDK 3.5.0 대응

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

SDK 업데이트의 초기 검수에서는 설치·구문·브리지·최소 HTML 패키징을 확인했습니다.
이후 진행한 실제 샘플 Web 빌드와 브라우저 실행 결과는 [테스트 기록](testing.md#2026-09-24-샘플-실행-결과)에 있습니다.
