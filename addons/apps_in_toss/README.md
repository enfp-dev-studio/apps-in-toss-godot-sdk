# Apps in Toss Godot addon

커뮤니티 SDK `enfp-dev-studio/apps-in-toss-godot-sdk`의
`00f813afa76fbb820777574f0315d304fb954f4c`를 기준으로 설치하고, 공식 Unity SDK
3.1.1 구조에 맞춰 `AIT` Autoload, 로그인, 게임 사용자 식별, IAP·전면 광고 이벤트,
진단 API와 타임아웃을 보강한 버전입니다.

플러그인을 켜면 다음처럼 호출할 수 있습니다.

```gdscript
var identity := await AIT.get_user_key_for_game(15_000)
var login := await AIT.app_login(15_000)
var products := await AIT.iap.get_product_item_list_and_wait(15_000)
var ad_support := await AIT.ads.is_load_full_screen_ad_supported_and_wait(15_000)
var status := await AIT.status.check_all(15_000)
```

이벤트형 API는 Unity의 `Action` 콜백과 같은 수명 관리 모델을 사용합니다.

```gdscript
AIT.ads.ad_loaded.connect(_on_ad_loaded)
AIT.ads.ad_failed.connect(_on_ad_failed)
var subscription_id := AIT.ads.load_full_screen_ad({"adGroupId": "광고그룹ID"})
```

이 애드온만으로는 Web 페이지의 JavaScript 브리지가 만들어지지 않습니다.
상위 패키징 프로젝트에서 `npm run build`를 실행해 Godot Web export에 브리지를
주입하고 `.ait` 파일을 생성하세요.
