# Apps in Toss Godot SDK

Godot 4 Web 게임에서 Apps in Toss(앱인토스) 기능을 쓰게 해주는 커뮤니티 SDK입니다.
공식 Unity SDK와 같은 레이어 구조를 따릅니다: 게임에서는 `AIT` 오톨로드만 호출하면
로그인·결제·광고·게임센터가 토스 앱과 연결됩니다.

> **상태: community early preview.** Web export와 `.ait` 패키징은 검증되어 있지만
> 로그인·결제·광고는 샌드박스 앱과 실제 토스 앱에서 최종 검증이 필요합니다.

## 지원 요약

- Godot 4.x (현재 릴리스 기준 4.7.2), Compatibility renderer, Web export
- API 27종: 토스 로그인 3종, 게임 사용자 키, 환경·권한·저장소·클립보드·햅틱,
  전면 광고, 인앱결제 4종, 게임센터 3종, AdMob 3종
- 빌드 파이프라인: 검사(d doctor) → Web export → 브리지 주입 → `.ait` 패키징
- 브라우저 Dev Server: 토스 앱 없이 mock SDK + DevTools 패널로 개발 · API 테스트

## 빠른 시작 (3분)

게임 리포지토리 루트에서:

```bash
# 1. 플랫폼 릴리스의 lock과 매니페스트 예시를 게임에 복사
mkdir -p .ait
cp <플랫폼-리포>/.ait/platform.lock.json .ait/
cp <플랫폼-리포>/.ait/game.manifest.example.json .ait/game.manifest.json
#    → gameId, gameVersion, displayName, brand.primaryColor, releaseChannel 채우기

# 2. 애드온 설치 (SDK 원본에서 복사 + autoload 등록)
ait-godot addon:install --force

# 3. 검사 후 첫 빌드
ait-godot doctor --strict
ait-godot build        # → <게임>.ait 산출물
```

개발 중에는 브라우저만으로 테스트합니다:

```bash
ait-godot build:dev    # mock 브리지 + DevTools 패널이 붙은 개발 번들
# 로컬 서버로 build/godot-web 를 서빙 → 브라우저에서 API 목테스트
```

로그인·결제·광고 실동작 확인은 `npm run deploy`(=`ait deploy`)로 업로드 후
샌드박스 앱/토스 앱 QR 테스트에서 합니다 — 브리지는 토스 앱 안에서만 살아 있습니다.

## 게임 코드에서 쓰기

`AIT` 오톨로드 하나로 전부 접근합니다. Unity의 `AIT.*` 정적 API에 대응합니다.

```gdscript
func _ready() -> void:
    if not AIT.is_available():
        return  # 에디터/일반 브라우저 — 네이티브 API 없음

    # 사용자 식별 (로그인 UI 없이)
    var res := await AIT.get_user_key_for_game(15_000)
    if response_ok(res):
        print(res.result.hash)

    # 전면 광고
    AIT.ads.ad_loaded.connect(_on_ad_loaded)
    AIT.ads.load_full_screen_ad({"adGroupId": "광고그룹ID"})

    # 게임센터 (플랫폼 0.2.0+)
    AIT.invoke_and_wait("Game", 15_000)  # 자세한 건 아래 표 참고

func response_ok(res: Dictionary) -> bool:
    return bool(res.get("ok", false))
```

전체 API 목록은 `addons/apps_in_toss/generated/ait_generated_catalog.gd`(자동
생성)가 단일 출처입니다. 자세한 사용 pattern(로그인 서버 연동, 결제 지급/복구,
전면 광고)은 플랫폼 리포 [`docs/godot-integration.md`](https://github.com/enfp-dev-studio/toss-web-game/blob/main/docs/godot-integration.md)를 참고하세요.

## 빌드

이 SDK 리포지토리는 부품(애드온+브리지) 공장입니다. 게임 빌드는 플랫폼 리포의
`ait-godot` CLI가 수행합니다:

```bash
# 게임 리포에서 (플랫폼 리포가 옆에 checkout돼 있거나, lock 커밋에서 자동 클론)
ait-godot doctor          # 호환성 검사 (sandbox는 advisory 허용, canary/production은 strict 강제)
ait-godot build           # 검사→Godot Web export→브리지 주입→검증→.ait
ait-godot build:dev       # mock 개발 빌드 (브라우저 테스트용)
```

빌드 산출물에는 `ait-platform-manifest.json`이 포함되어 어떤 조합으로
만들어졌는지 기록됩니다 — 롤백·재현에 사용하세요.

## 문서

플랫폼 리포지토리(`enfp-dev-studio/toss-web-game`)의 `docs/`에서:

- Unity 플로우 대응 현황: `unity-flow-parity.md`
- 연동 가이드(로그인/결제/광고 코드): `godot-integration.md`
- 공개/비공개 리포 구조와 업데이트 흐름: `platform-architecture.md`
- 릴리스 호환 매트릭스: `platform-compatibility.md`

## Unity SDK 업데이트 따라잡기

플랫폼 리포의 `npm run godot:check:unity`가 upstream API surface 변화를 감시하고,
`godot:sync:unity`가 포팅·생성·smoke test를 한 번에 실행합니다. 새 API는
매핑 검토 후 카탈로그에 반영됩니다(SemVer: additive는 minor, 호환 깨짐은 major).

## 라이선스·상태

토스 공식 SDK가 아닌 **커뮤니티 포트(early preview)**입니다. 배포 전 샌드박스·
실기기 테스트가 필수이고, 로딩·Web export는 검증됐지만 결제 지급 흐름은 실제
토스 앱에서 최종 확인해야 합니다.