# Apps in Toss Godot SDK

**Godot로 만든 Web 게임에 토스 로그인·결제·광고를 연결하세요.**

게임에 애드온을 설치하면 `AIT`를 통해 앱인토스 기능을 사용할 수 있습니다.
브라우저에서 모의 응답으로 개발하고, 토스 앱에 올릴 `.ait` 파일을 만드는 도구도 포함합니다.

> 토스 공식 SDK가 아닌 **커뮤니티 초기 프리뷰**입니다.
> 출시 전에는 샌드박스 앱과 실제 토스 앱에서 동작을 확인해야 합니다.

## 제공하는 기능

- **로그인·결제·광고** — 토스 로그인, 인앱·구독 결제, 전면 광고와 AdMob
- **게임에 필요한 기능** — 저장소, 게임센터, 공유, 클립보드, 햅틱 등
- **개발·빌드 도구** — 브라우저 테스트, 프로젝트 설정 검사, Web 빌드와 패키징

지원 API와 사용 예제는 [API 사용법](docs/api-guide.md)에서 볼 수 있습니다.

## 시작하기

**준비물:** Godot 4.7.2(Compatibility 모드)와 Web export 템플릿, Node.js 24 또는 26, npm 11.

1. [SDK를 다운로드](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/archive/refs/heads/main.zip)하고 `addons/apps_in_toss` 폴더를 게임 프로젝트에 복사합니다.
2. Godot의 **Project Settings → Plugins**에서 **Apps in Toss Godot SDK**를 켭니다.
3. [설치 가이드](docs/getting-started.md)에 따라 게임 정보를 초기화하고, 의존성과 Web export 설정을 준비합니다.

준비가 끝나면 게임 폴더(`project.godot`가 있는 곳)에서 실행합니다.

```bash
node addons/apps_in_toss/tools/ait-godot.mjs build:dev
node addons/apps_in_toss/tools/ait-godot.mjs preview
```

브라우저에서 게임을 실행하고 토스 기능의 모의 응답을 확인할 수 있습니다.
실제 로그인·결제·광고 확인 방법은 [테스트 가이드](docs/testing.md)에 있습니다.

## 필요한 문서 찾기

| 하고 싶은 일 | 문서 |
| --- | --- |
| 처음 설치하고 게임을 빌드하기 | [설치·프로젝트 준비](docs/getting-started.md) |
| 게임 코드에서 토스 기능 호출하기 | [API 사용법과 예제](docs/api-guide.md) |
| 브라우저·토스 앱에서 테스트하기 | [테스트 범위와 실행 방법](docs/testing.md) |
| SDK를 수정하거나 업데이트하기 | [SDK 개발·업데이트 기록](docs/sdk-development.md) |

## 자동 검사 상태

PR과 `main` 업데이트 때 자동 검사합니다. 아래는 최신 `main` 결과이며, 배지를 누르면 로그를 볼 수 있습니다.

| 검사 | 상태 |
| --- | --- |
| API·설치 회귀 테스트 | [![Regressions](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/regressions.yml/badge.svg?branch=main)](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/regressions.yml?query=branch%3Amain) |
| 브리지 빌드·패키징 | [![Bridge and package](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/bridge-package.yml/badge.svg?branch=main)](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/bridge-package.yml?query=branch%3Amain) |
| Godot 애드온 | [![Godot addon](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/godot-addon.yml/badge.svg?branch=main)](https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/actions/workflows/godot-addon.yml?query=branch%3Amain) |

자동 검사의 범위와 별도로 확인할 항목은 [테스트 가이드](docs/testing.md)에 정리했습니다.
