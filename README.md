# Apps in Toss Godot SDK workspace

이 디렉터리는 플랫폼 개발 중 사용하는 Godot SDK 계층입니다.
`addons/apps_in_toss`가 현재 checkout의 원본이고, `bridge`는 Godot Web export에
주입하는 TypeScript 브리지입니다. 공개 SDK 리포지토리를 canonical source로
승격한 뒤에는 이 디렉터리를 두 번째 원본으로 수정하지 말고 release bundle로
소비하세요. 실제 게임 코드는 게임마다 별도 private 리포지토리에 둡니다.

```text
godot-sdk/
  addons/apps_in_toss/  Godot 애드온 원본 (AIT Autoload, 인증, 결제, 광고, 진단)
  bridge/               Web Framework transport와 export patch 도구
godot/                  SDK smoke-test용 Godot 게임
src/                    기존 Apps in Toss 웹 게임 화면
```

플랫폼의 호환 조합은 루트의 `.ait/platform.lock.json`에서 관리합니다. Godot,
addon, bridge, Web Framework, Node/npm, Unity SDK commit을 임의로 섞지 말고 lock에
기록된 조합으로 개발·빌드하세요.

샘플 프로젝트의 `godot/addons/apps_in_toss`는 SDK 원본의 작업 복사본입니다. 다음
명령으로 항상 원본과 맞출 수 있습니다.

```bash
npm run godot:sdk:sync
npm run godot:sdk:sync -- --check
```

실제 게임 프로젝트에 설치할 때는 다음 명령이 이 원본만 복사합니다.

```bash
npm run godot:addon:install -- /absolute/path/to/my-godot-game
```

SDK를 별도 checkout으로 관리하는 경우에는 `GODOT_SDK_DIR`만 지정하면 됩니다.

```bash
GODOT_SDK_DIR=/absolute/path/to/apps-in-toss-godot-sdk \
  npm run godot:addon:install -- /absolute/path/to/my-godot-game
```

Godot SDK 코드는 플랫폼 API를 직접 구현하지 않습니다. `bridge`가
`@apps-in-toss/web-framework`를 호출하고, Godot `JavaScriptBridge`가 양방향 요청과
이벤트를 전달합니다. 따라서 웹 게임 코드와 Godot SDK를 같은 저장소에서 빌드하되,
각각 독립적으로 재사용할 수 있습니다.
