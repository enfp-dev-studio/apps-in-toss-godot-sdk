extends RefCounted
class_name AITEntry

## 들어온 주소와 빌드 정보를 읽습니다.
## - 토스 앱은 intoss://<앱>/<경로>?<쿼리>로 미니앱을 엽니다. 콘솔 테스트 스킴(intoss-private://)은 사용자 쿼리를
##   queryParams=<URL 인코딩한 JSON>으로 넘기므로, url.get_slice("code=")처럼 읽으면 테스트에서 깨집니다.
##   페이지 주소(location 경로·쿼리)와 Environment.initialURL(처음 진입 주소)을 함께 보고, queryParams 안의 값도
##   query에 합칩니다. 주소 값은 조작될 수 있으니 보상·권한은 서버에서 확인하세요.
## - 빌드 정보: 토스 최근 목록이 예전 테스트 빌드를 다시 열 수 있어, 어떤 빌드인지 화면에 보여 줄 때 씁니다.

const QUERY_PARAMS_KEY := "queryParams"
const APP_CONFIG_ID := "ait-app-config"


## { path, query, initial_url, deployment_id, toss_app_version }
static func read(core: AITCore) -> Dictionary:
    var page := {"path": "", "query": {}}
    if OS.has_feature("web"):
        var location: Variant = JavaScriptBridge.get_interface("location")
        if location != null:
            page = parse(String(location.pathname) + String(location.search))
    var initial_url := _string_value(core, "Environment.initialURL")
    var first := parse(initial_url) if initial_url != "" else {"path": "", "query": {}}
    var query: Dictionary = page["query"].duplicate()
    query.merge(first["query"], true)
    var path := String(first["path"])
    if path == "" or path == "/":
        path = String(page["path"])
    if path == "/index.html":
        path = "/"
    return {
        "path": path if path != "" else "/",
        "query": query,
        "initial_url": initial_url,
        "deployment_id": _string_value(core, "Environment.deploymentId"),
        "toss_app_version": _string_value(core, "Environment.tossAppVersion"),
    }


## 주소 하나를 { path, query }로 풉니다. intoss://앱/경로?k=v, https://host/경로?k=v, /경로?k=v 모두 받습니다.
static func parse(url: String) -> Dictionary:
    var rest := url.get_slice("#", 0)
    var scheme_at := rest.find("://")
    if scheme_at != -1:
        rest = rest.substr(scheme_at + 3)
        var slash := rest.find("/")
        var question := rest.find("?")
        var cut := slash if slash != -1 and (question == -1 or slash < question) else question
        rest = rest.substr(cut) if cut != -1 else ""
    var path := rest.get_slice("?", 0)
    if path != "" and not path.begins_with("/"):
        path = "/" + path
    var query := parse_query(rest.substr(path.length() + 1) if rest.contains("?") else "")
    return {"path": path, "query": query}


## k=v&k2=v2를 풉니다. 테스트 스킴의 queryParams(JSON)는 펼쳐서 합칩니다(같은 키는 queryParams 값이 이깁니다).
static func parse_query(text: String) -> Dictionary:
    var query := {}
    var nested := {}
    for pair in text.split("&", false):
        var name := _decode(pair.get_slice("=", 0))
        var value := _decode(pair.substr(pair.find("=") + 1)) if pair.contains("=") else ""
        if name == QUERY_PARAMS_KEY:
            var parsed: Variant = JSON.parse_string(value)
            if typeof(parsed) == TYPE_DICTIONARY:
                for key: Variant in parsed:
                    nested[String(key)] = _query_text(parsed[key])
                continue
        query[name] = value
    query.merge(nested, true)
    return query


## 빌드 정보: { kind, time, commit, dirty, label, deployment_id, toss_app_version }
## kind는 AIT.build_kind()와 같습니다. time·commit·label은 ait-godot build가 기록한 값이고 개발 빌드에는 없습니다.
static func build_info(core: AITCore) -> Dictionary:
    var info := {
        "kind": core.build_kind(),
        "time": "",
        "commit": "",
        "dirty": false,
        "label": "",
        "deployment_id": _string_value(core, "Environment.deploymentId"),
        "toss_app_version": _string_value(core, "Environment.tossAppVersion"),
    }
    var stamp: Variant = page_config().get("build")
    if typeof(stamp) == TYPE_DICTIONARY:
        for key in ["time", "commit", "label"]:
            if stamp.get(key) is String:
                info[key] = stamp[key]
        info["dirty"] = bool(stamp.get("dirty", false))
    return info


## 빌드가 index.html에 넣은 설정(ait-app-config JSON). 없으면 빈 Dictionary
static func page_config() -> Dictionary:
    if not OS.has_feature("web"):
        return {}
    var document: Variant = JavaScriptBridge.get_interface("document")
    if document == null:
        return {}
    var tag: Variant = document.getElementById(APP_CONFIG_ID)
    if tag == null:
        return {}
    var parsed: Variant = JSON.parse_string(String(tag.textContent))
    return parsed if typeof(parsed) == TYPE_DICTIONARY else {}


## queryParams JSON 값을 쿼리 글자로. Godot JSON은 숫자를 float로 읽으므로 정수는 "2"로 씁니다
static func _query_text(item: Variant) -> String:
    if item is String:
        return item
    if item is float and is_equal_approx(item, roundf(item)) and absf(item) < 1e15:
        return str(int(item))
    return JSON.stringify(item)


static func _decode(text: String) -> String:
    return text.replace("+", " ").uri_decode()


static func _string_value(core: AITCore, path: String) -> String:
    if core == null or not core.is_available():
        return ""
    var value: Variant = core.get_value(path)
    return String(value) if value is String else ""
