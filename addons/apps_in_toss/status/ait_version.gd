extends RefCounted
class_name AITVersion

## SDK 버전(Unity SDK 3.10.0 AITVersion 대응). VERSION은 plugin.cfg, WEB_FRAMEWORK는 내장 브리지의
## @apps-in-toss/web-framework 판과 같아야 합니다(회귀 테스트가 확인). 앱이 시작할 때 한 번 로그로 남깁니다.

const VERSION := "0.2.0"
const WEB_FRAMEWORK := "3.10.0"

## "0.2.0 (web-framework 3.10.0)"
static func full_version() -> String:
    return "%s (web-framework %s)" % [VERSION, WEB_FRAMEWORK]
