# 출시 전 점검 (Godot Web)

[← 프로젝트 소개](../README.md) · [테스트 가이드](testing.md) · [Godot Web 주의사항](godot-web-notes.md)

검수 전에는 공식 [서비스 오픈 정책](https://developers-apps-in-toss.toss.im/intro/guide)과 출시 가이드
([비게임](https://developers-apps-in-toss.toss.im/checklist/app-nongame) · [게임](https://developers-apps-in-toss.toss.im/checklist/app-game))를
직접 대조하세요. 가이드는 계속 바뀝니다. 이 문서는 그 항목을 Godot에서 어디서 지키는지와 SDK가 대신 확인하는 것을 정리합니다.

## SDK가 자동으로 확인하는 것

`build`(strict `doctor` 포함)와 release 검증이 다음을 막거나 알립니다.

| 항목 | 결과 |
| --- | --- |
| mock 브리지·DevTools 패널·debug-console이 출시 export에 남음 | 실패 |
| export 폴더가 압축 해제 100MiB 초과(`.ait` 한도 100MB) | 실패(100MB~100MiB는 경고) |
| Godot MCP `McpBridge` 오토로드가 `project.godot`에 남음 | 실패 |
| 프리셋 모바일 VRAM 압축인데 ETC2/ASTC import 꺼짐(export가 이유 없이 실패하는 경우) | 실패 |
| Thread Support 켜짐, Godot 기본 로딩 화면, iframe | 실패 |
| 게임 스크립트의 `JavaScriptBridge.eval` | 경고 |
| 게임 스크립트의 테스트 광고 그룹 ID(`ait-ad-test-…`) | 경고 |
| 셸 viewport meta에 확대 막기·`viewport-fit=cover` 없음 | 경고 |
| 매니페스트 `appType` 없음, 비게임인데 `withBackButton: false` | 경고 |
| git에서 무시되지 않는 `.ait_relay`, 애드온 `tools/.gdignore` 없음 | 경고 |

## 내비게이션

| 공식 항목 | Godot에서 |
| --- | --- |
| (비게임) 뒤로가기 버튼이 모든 화면에서 동작, 최초 화면에서 뒤로가기를 누르면 종료 | 매니페스트 `"appType": "nongame"`(→ `withBackButton: true`). 시트·하위 화면을 열 때 `AIT.back.push`, 닫을 때 `remove`. 첫 화면에서는 아무것도 push하지 않음 |
| (비게임) 토스 뒤로가기 버튼과 자체 뒤로가기 버튼이 동시에 보이지 않음 | 화면 안에 뒤로가기 버튼을 그리지 않음 |
| 안드로이드 시스템 백버튼을 누르면 뒤로가기 또는 종료 | `AIT.back`이 같은 `backEvent`를 받음. 실기기에서 확인 |
| (게임) 우측 상단 닫기 버튼이 동작, 종료할 때 확인 모달 | 플랫폼이 띄움(게임 바는 더보기·닫기뿐) |
| 모든 화면에서 미니앱을 나갈 방법이 있음 | 막는 안내 화면(저장 실패 등)에도 토스 바는 남아 있음을 확인 |
| 앱 이름·로고는 콘솔에 등록한 것 | `NavigationBar.setOptions`로 색만 바꾸고 자체 로고를 넣지 않음 |

## 화면

| 공식 항목 | Godot에서 |
| --- | --- |
| (비게임) 지도 말고는 제스처 확대·축소 비활성 | 셸 viewport meta `maximum-scale=1, user-scalable=no`(템플릿) + 캔버스 `touch-action: none` |
| (게임) Safe Area·Dynamic Island 침범 없음, 인게임 풀스크린 | `AIT.safe_area`로 여백. 셸에 `viewport-fit=cover` |
| (비게임) 라이트 모드 | 테마·배경색을 밝게 고정 |
| 스크롤·터치·화면 전환 반응이 2초 이상 지연되지 않음 | 무거운 생성·로딩은 프레임을 나눠 하고 그동안 표시를 둠 |
| 진입하자마자 바텀시트가 자동으로 뜨지 않음 | 첫 화면에서 로그인·동의 시트를 자동으로 열지 않음 |
| 디자인 하한(디자인 가이드) | 글자 11px 이하 금지·본문 15px 이상, 터치 영역 44px 이상, 굵기 400~700. 360×640 기준 크기면 UI 단위 = CSS px 이상([설치 가이드](getting-started.md#4-godot-web-export-설정)). 한글은 `AITKorean.keep_all` |

## 소리

| 공식 항목 | Godot에서 |
| --- | --- |
| (게임) 백그라운드 전환 시 즉시 정지, 돌아오면 다시 재생 | `AIT.sound.enable()` |
| 인앱 광고 재생 중 음악 정지, 끝나면 다시 재생 | `AIT.sound`가 `show_started`~`show_ended` 동안 정지 |
| 인앱 결제·토스페이 진행 중 음악 정지 | `AIT.sound`가 주문 동안 정지(토스페이는 `silence`로 직접) |
| (게임) 사운드 On/Off 설정 | 설정은 SFX·Music 버스로(Master는 게이트가 씀) |

## 사용자 식별키와 저장

| 공식 항목 | Godot에서 |
| --- | --- |
| 식별자를 확인해 저장하고 정상 시작, 재접속해도 데이터 유지 | `AITSaveSlot`(식별키 기준 키, 읽기 실패면 새로 시작하지 않음). 비게임은 `getAnonymousKey`, 게임은 `getUserKeyForGame` |
| (권장) 진행 상태는 SDK 저장소에 | `localStorage`·IndexedDB 쓰지 않음(iOS 7일 IndexedDB 삭제, QR·라이브 오리진 분리) |

## 인앱 결제

| 공식 항목 | Godot에서 |
| --- | --- |
| 완료 뒤 결과가 반영됨, 기기를 바꿔도 유지 | 즉시 승인 → 결제 화면이 닫힌 뒤 서버 지급 → 대사([결제 지급 규칙](api-guide.md#결제-지급-규칙)) |
| 실패 사유를 사용자가 인지 | `purchase_failed`의 `error.code`별 안내 |
| 취소하면 주문 화면으로 | `USER_CANCELED`면 화면을 그대로 둠 |
| 결제 내역을 사용자가 확인 | `get_completed_or_refunded_orders`(웹은 첫 페이지만)와 서버 기록으로 내역 화면 |
| 실제 결제 확인 | 콘솔 QR 테스트는 실제 결제 |

## 인앱 광고

| 공식 항목 | Godot에서 |
| --- | --- |
| 사전 로딩, 재생 시점에 실시간 로딩하지 않음 | 화면 진입 때 `load_full_screen_ad`, 실패는 간격을 늘려 몇 번만 다시 |
| 테스트 광고가 아닌 실제 광고 | 검수 번들 전 `ait-ad-test-…`를 콘솔 ID로(`doctor` 경고) |
| 리워드 광고를 끝까지 보면 보상 | `userEarnedReward`에서만 지급(브라우저 mock은 이 이벤트를 보내지 않음) |
| 광고가 끝나면 미니앱 화면으로 | `dismissed`·`failedToShow`에서 대기 상태를 풀고 구독 `dispose` |
| (비게임) 배너는 스크롤 가능한 화면에만 / (게임) 배너는 상단 또는 하단에만 | 배너는 DOM으로 캔버스 위에 겹침([방법](godot-web-notes.md#배너-광고)) |

## 보안과 안정성

| 공식 항목 | Godot에서 |
| --- | --- |
| 앱 브릿지를 짧은 시간에 과도하게 호출하지 않음, 반복문·타이머·화면 갱신의 중복 호출 없음 | 햅틱·로그·광고 불러오기를 `_process`에서 부르지 않음. 화면 켜두기(`setScreenAwakeMode`)는 화면을 벗어날 때 끔 |
| 호출 실패 시 재시도 횟수와 간격 제어 | 재시도는 횟수 상한과 간격(백오프)을 둠 |
| 외부 코드 실행(eval) 금지 | SDK는 `JavaScriptBridge.eval`을 쓰지 않음. 게임도 `get_interface`만 |
| 토스 도메인 밖으로 이동·렌더링 금지, HTTPS·`wss://`만 | `location` 이동·iframe 없음, 서버 주소는 `https://` |
| 모든 SDK 호출 전 지원 여부 확인 | `AIT.has_api()` |

## 번들과 성능

| 항목 | Godot에서 |
| --- | --- |
| `.ait`는 압축 해제 100MB 이하 | `build`가 검사. 큰 리소스는 CDN 분리 검토 |
| (게임) 10초 안에 최초 화면 | 셸 로딩 화면과 진행률. 엔진 wasm(4.7.2 비스레드 약 40MB)은 커스텀 템플릿 없이는 줄지 않으니 첫 씬을 가볍게 |
| 메모리 급증 없음 | "문제가 생겨서 미니앱을 다시 시작했어요" 반복은 대부분 메모리 부족. 텍스처 VRAM 압축(`for_mobile`), 큰 소리는 OGG, 다 쓴 오디오 스트림은 놓기([소리](godot-web-notes.md#소리)) |
| 발열·배터리 | 셸의 해상도 상한(기기 배율 2), 정지 화면이 많으면 `low_processor_mode` |

## 테스트 빌드 위생

- 검수에는 옵션 없는 `build`로 만든 `.ait`만 냅니다. `build --debug-console` 결과(`"debugConsole": true`)는 내지 않습니다.
- 개발용 도구는 출시 프리셋의 `exclude_filter`로 빼고, `load()`로만 부릅니다([설치 가이드](getting-started.md#4-godot-web-export-설정)).
- 주소 쿼리로 여는 조작 훅·저장 초기화는 `AIT.build_kind()`가 `dev`·`debug`일 때만 엽니다.
- 앱마다 검수 전 점검 스크립트를 두면 좋습니다. 광고 ID, 서버 주소 자리표시자, 처리방침의 빈칸, 개발용 도구가
  마지막 빌드에 들어갔는지를 봅니다(cat-room-godot `tools/check-release.mjs`가 예).
