---
name: apps-in-toss-sdk-sync
description: Apps in Toss Unity SDK/web-framework 업데이트와 앱인토스 개발자 커뮤니티 문의·노하우를 조사해 apps-in-toss-godot-sdk에 미반영 항목을 찾고 필요한 것만 적용한다. Use when the user asks to sync/update the Apps in Toss SDK, "Unity SDK 대비 조사", "반영 안된 것", "커뮤니티 케이스/고도 케이스 적용", "앱인토스 SDK 업데이트", or parity/gap survey for this Godot SDK.
---

# 앱인토스 SDK 동기화 (Unity SDK + 커뮤니티 조사 → Godot SDK 반영)

이 워크플로는 한 번의 요청으로 ① 공식 SDK 업데이트 갭 조사 ② 커뮤니티
문의·노하우에서 게임에 필요한 고도 케이스 수집 ③ 필요한 항목 적용 ④ 기록까지
끝낸다. 조사와 적용을 분리해 받지 말고, 아래 순서대로 한 번에 진행한다.

## 소스

| 대상 | 위치 |
| --- | --- |
| Unity SDK 릴리스 | https://github.com/toss/apps-in-toss-unity-sdk/releases · `/tags` (태그 `release/vX.Y.Z`) |
| Unity API 체인지로그 | 저장소 `Documentation~/changelog/api-changelog.md` (웹: https://toss.github.io/apps-in-toss-unity-sdk/docs/changelog/index.html) |
| 공식 개발자센터 | https://developers-apps-in-toss.toss.im/release-note/release-note · `/documentation/sdk/domains-api` · `/documentation/integration/sdk-3.x` |
| 커뮤니티 | https://techchat-apps-in-toss.toss.im/ — 카테고리: 개발(5), Unity(14), Cocos(15), 개발 공지사항(9) |
| 커뮤니티 스레드 | Discourse는 URL 끝에 `.json`을 붙이면 원문을 그대로 준다 |

## 우리 쪽 고정값(pin) — 항상 여기를 기준으로 비교한다

- `addons/apps_in_toss/tools/templates/platform.lock.json` — `webFramework.version`, `unitySdk.commit/packageVersion`, `aitGodotSdk.apiManifestSha256`
- `bridge/package.json`와 `addons/apps_in_toss/tools/bridge/package.json` — 실제 의존성 버전
- `bridge/api-manifest.json` — 매핑된 API 단일 출처 (내장 복사본과 바이트 동일해야 함)
- `tests/manifest-parity.test.mjs` — API 개수·버전·커밋 핀이 테스트에 고정돼 있다
- 로컬 `bridge/node_modules/@apps-in-toss/web-framework/dist/index.d.ts`가 현재 웹 SDK의 실제 API 표면이다

## 절차

1. **공식 업데이트 조사.** Unity 태그/릴리스와 `api-changelog.md`, 개발자센터
   릴리스 노트를 최신부터 읽는다. Unity 태그 `release/vX.Y.Z`가 web-framework
   `X.Y.Z`와 1:1인 경우가 많지만 **가정하지 말고 실제 의존성 비교**(devtools 등은
   다를 수 있음). web-framework에만 있고 Unity가 아직 안 감싼 API도 후보로 잡는다.
   Unity 릴리스 태그는 UPM 패키지 커밋 하나로 재생성·백필되므로(이전 핀 커밋이 태그에서
   사라질 수 있음) 태그끼리 diff하지 말고 `main`의 `SDK 업데이트: vX.Y.Z` 커밋과
   `api-changelog.md`, npm `CHANGELOG.md`·`dist/index.d.ts` diff로 판단한다.
2. **API 표면 diff.** `index.d.ts`의 네임스페이스·익스포트를 `api-manifest.json`과
   대조해 미매핑 목록을 만든다. 구독형(`addEventListener`/cleanup 반환,
   `processProductGrant` 콜백)은 일반 invoke로 못 넣고 전용 래퍼가 필요하다
   (패턴: `bridge/src/index.ts`의 `startIapOrder`/`startEventSubscription`,
   GDScript는 `ads/`·`iap/` 모듈).
3. **커뮤니티 조사.** 개발 공지사항(버전 타임라인·조치 필요 공지)과 Unity/개발
   카테고리의 문의·노하우를 훑는다. 답글 많은 스레드와 accepted 답변을 우선한다.
   각 케이스를 이전 가능성으로 분류: ★★★ 웹/브리지 그대로 유효, ★★ 원리만 유효,
   ★ Unity 에디터·빌드 전용(스킵).
4. **판정.** 적용 후보는 (a) 데이터 소실·결제 지급·보안 경로, (b) 게임에 실제로
   걸리는 문제(BGM·화면·광고·결제) 기준으로 고른다. 나머지는 백로그로 남긴다.
   알 수 없는 동작(권한·동의 등)은 건드리지 말고 문서에 남긴다.
5. **적용 체크리스트.**
   - API 추가: `bridge/api-manifest.json`에 한 줄 → 내장 `tools/bridge/` 복사본에
     같은 내용(바이트 동일) → `cd bridge && npm run generate` →
     `npx tsc --noEmit` → prod/mock 빌드 → `platform.lock.json`의
     `apiManifestSha256` 재핀 → `tests/manifest-parity.test.mjs` 개수·핀 갱신.
   - 설정/빌드: `addons/apps_in_toss/tools/scripts/`의 생성 스크립트를 고치면
     생성 결과(`apps-in-toss.config.ts`)도 타입 검사로 확인.
   - GDScript 모듈 추가: `addons/apps_in_toss/<domain>/`에 두고 `apps_in_toss.gd`와
     `ait.gd`에 노출. 웹 전용 API는 `OS.has_feature("web")` 가드 필수.
   - 문서: README는 건드리지 않는다. API·예제는 `docs/api-guide.md`, 검사 범위는
     `docs/testing.md`, 변경 근거·잔여 갭은 `docs/sdk-development.md`에 날짜 섹션으로.
6. **검증.** `node --test tests/*.test.mjs` 전체. GDScript가 바뀌면
   `GODOT_BIN=/Applications/Godot.app/Contents/MacOS/Godot node tests/run-godot-addon.mjs`.
   실기기 전용 항목은 docs에 미검증으로 명시.
7. **기록.** `docs/sdk-development.md`에 날짜 섹션 추가: 기준 버전/커밋, 반영 목록,
   미반영 갭 요약, 감시 항목(다음 업데이트 때 볼 것).

## 커뮤니티에서 확인된 규칙 — 항상 유지한다

- 진행 상태는 `localStorage`/IndexedDB 금지 → SDK 저장소(`storage_*`)나 서버.
  오리진 변경 시 데이터 소실 사례 있음. 복구는 `migration_get_origin_storage`만.
- 생성 설정의 `webView.mediaPlaybackRequiresUserAction: false`(터치 전 BGM),
  `pullToRefreshEnabled: false`(게임 중 새로고침) 기본값 유지.
- `product_grant_requested` 콜백은 즉시 응답. 서버 지급 확정은
  `get_pending_orders` 복구 루틴(네이티브 오버레이가 루프를 멈춰 `await`가 죽는다).
- 브리지 객체는 조건부 주입 — 모든 API에 `has_api`/`isSupported` 방어, 리스너는
  cleanup, 실패는 명시적 에러로.
- QR 실패("지금은 서비스를 사용할 수 없어요") 진단 순서: ① 토스 앱 업데이트
  ② AIT Devtools mock 재현 ③ 번들 재빌드. SDK 코드부터 의심하지 않는다.
- SDK 3.x 번들은 롤백 불가. 2026-10-05부터 3.x 미만 신규 등록 제한.

## 산출물

리포트는 표로 요약한다: 항목 / 출처(공식 릴리스·커뮤니티 URL) / 우리 쪽 상태 /
적용 여부와 사유. 적용한 것은 커밋 단위로 정리하고, 백로그는
`docs/sdk-development.md`의 잔여 갭에 남긴다.
