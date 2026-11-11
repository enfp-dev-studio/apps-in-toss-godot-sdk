@tool
extends AcceptDialog
class_name AITConfigDialog

## 게임 매니페스트(.ait/game.manifest.json) 설정 창(Unity SDK 3.9.0 AIT Configuration 창 대응).
## 칸으로 고치고 "저장"을 누르면 매니페스트에 씁니다. 이 창이 모르는 키는 그대로 둡니다.
## 값의 검사는 빌드(write-ait-config·doctor)가 합니다.

const PERMISSIONS := {
    "clipboard": ["read", "write"],
    "geolocation": ["access"],
    "contacts": ["read", "write"],
    "photos": ["read", "write"],
    "camera": ["access"],
    "microphone": ["access"],
}
const NAV_FLAGS := ["withBackButton", "withHomeButton", "withTitle", "transparentBackground"]
const WEBVIEW_FLAGS := ["allowsInlineMediaPlayback", "bounces", "pullToRefreshEnabled", "mediaPlaybackRequiresUserAction", "allowsBackForwardNavigationGestures"]

var manifest_path := ""
var _manifest: Dictionary = {}
var _fields: Dictionary = {} # key -> Control

func _init() -> void:
    title = "Apps in Toss 설정"
    ok_button_text = "저장"
    min_size = Vector2i(560, 640)

## path의 매니페스트를 읽어 칸을 채웁니다. 없거나 깨졌으면 false
func load_manifest(path: String) -> bool:
    manifest_path = path
    var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path)) if FileAccess.file_exists(path) else null
    if not parsed is Dictionary:
        return false
    _manifest = parsed
    _build()
    return true

func _ready() -> void:
    confirmed.connect(save)

func _build() -> void:
    for child in get_children():
        if child is ScrollContainer:
            child.queue_free()
    _fields.clear()
    var scroll := ScrollContainer.new()
    scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
    add_child(scroll)
    var form := VBoxContainer.new()
    form.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    scroll.add_child(form)

    _section(form, "앱 기본 정보")
    _text(form, "gameId", "앱 ID *", _manifest.get("gameId", ""))
    _text(form, "displayName", "표시 이름", _manifest.get("displayName", ""))
    _text(form, "gameVersion", "버전", _manifest.get("gameVersion", ""))
    _option(form, "appType", "앱 종류", ["game", "nongame"], _manifest.get("appType", "game"))
    _option(form, "releaseChannel", "출시 채널", ["sandbox", "production"], _manifest.get("releaseChannel", "sandbox"))
    var brand: Dictionary = _manifest.get("brand", {})
    _section(form, "브랜드")
    _text(form, "brand.primaryColor", "기본 색상", brand.get("primaryColor", ""))
    _text(form, "brand.iconUrl", "아이콘 URL", brand.get("iconUrl", ""))

    _section(form, "권한")
    var granted := {}
    for item in _manifest.get("permissions", []):
        if item is Dictionary:
            granted["%s/%s" % [item.get("name"), item.get("access")]] = true
    for name in PERMISSIONS:
        for access in PERMISSIONS[name]:
            _check(form, "permission:%s/%s" % [name, access], "%s (%s)" % [name, access], granted.has("%s/%s" % [name, access]))

    var nav: Dictionary = _manifest.get("navigationBar", {})
    _section(form, "내비게이션 바")
    for flag in NAV_FLAGS:
        _check(form, "navigationBar." + flag, flag, bool(nav.get(flag, false)))
    _option(form, "navigationBar.theme", "theme", ["", "light", "dark"], nav.get("theme", ""))

    var web: Dictionary = _manifest.get("webView", {})
    _section(form, "WebView")
    for flag in WEBVIEW_FLAGS:
        _check(form, "webView." + flag, flag, bool(web.get(flag, flag == "allowsInlineMediaPlayback")))
    _option(form, "webView.overScrollMode", "overScrollMode", ["never", "content", "always"], web.get("overScrollMode", "never"))

    _section(form, "화면·개발 서버")
    _option(form, "keyboardMode", "키보드 모드", ["pan", "resize", "none"], _manifest.get("keyboardMode", "pan"))
    var preview: Dictionary = _manifest.get("preview", {})
    _text(form, "preview.host", "개발 서버 호스트", preview.get("host", "0.0.0.0"))
    _text(form, "preview.port", "개발 서버 포트", str(preview.get("port", 5173)))

    _section(form, "런타임 로그·저장 미러링")
    var runtime_log: Dictionary = _manifest.get("runtimeLog", {})
    _check(form, "runtimeLog.firstInteractive", "첫 상호작용 로그", runtime_log.get("firstInteractive", true) != false)
    _text(form, "userFiles", "Storage에 복사할 user:// 파일(쉼표로 구분)", ", ".join(PackedStringArray(_manifest.get("userFiles", []))))

    var sentry: Dictionary = _manifest.get("sentry", {})
    _section(form, "Sentry(비우면 끔)")
    _text(form, "sentry.dsn", "DSN", sentry.get("dsn", ""))
    _text(form, "sentry.environment", "environment(비우면 빌드 종류)", sentry.get("environment", ""))
    _text(form, "sentry.release", "release", sentry.get("release", ""))

    var debug_console: Dictionary = _manifest.get("debugConsole", {})
    _section(form, "실기기 디버거(테스트 빌드)")
    _text(form, "debugConsole.relayPublicKeys", "relay 공개키(쉼표로 구분)", ", ".join(PackedStringArray(debug_console.get("relayPublicKeys", []))))

    var open_file := Button.new()
    open_file.text = "JSON 파일로 열기"
    open_file.pressed.connect(func() -> void: OS.shell_open(manifest_path))
    form.add_child(open_file)

## 칸의 값을 매니페스트에 넣어 저장합니다. 빈 칸은 그 키를 지웁니다(필수 키 제외)
func save() -> void:
    var m := _manifest.duplicate(true)
    m["gameId"] = _value("gameId")
    _set_or_erase(m, "displayName", _value("displayName"))
    m["gameVersion"] = _value("gameVersion")
    m["appType"] = _value("appType")
    m["releaseChannel"] = _value("releaseChannel")
    var brand := {}
    _set_or_erase(brand, "primaryColor", _value("brand.primaryColor"))
    _set_or_erase(brand, "iconUrl", _value("brand.iconUrl"))
    _set_or_erase(m, "brand", brand)

    var permissions: Array = []
    for name in PERMISSIONS:
        for access in PERMISSIONS[name]:
            if _value("permission:%s/%s" % [name, access]):
                permissions.append({"name": name, "access": access})
    m["permissions"] = permissions

    # 원래 없던 키는 기본값과 다를 때만 쓴다(appType이 채우는 내비 바 기본값을 덮지 않게)
    var nav: Dictionary = m.get("navigationBar", {}).duplicate()
    for flag in NAV_FLAGS:
        _put(nav, flag, _value("navigationBar." + flag), false)
    _set_or_erase(nav, "theme", _value("navigationBar.theme"))
    _set_or_erase(m, "navigationBar", nav)
    var web: Dictionary = m.get("webView", {}).duplicate()
    for flag in WEBVIEW_FLAGS:
        _put(web, flag, _value("webView." + flag), flag == "allowsInlineMediaPlayback")
    _put(web, "overScrollMode", _value("webView.overScrollMode"), "never")
    _set_or_erase(m, "webView", web)

    _put(m, "keyboardMode", _value("keyboardMode"), "pan")
    var preview: Dictionary = m.get("preview", {}).duplicate()
    _put(preview, "host", _value("preview.host"), "0.0.0.0")
    _put(preview, "port", int(_value("preview.port")), 5173)
    _set_or_erase(m, "preview", preview)
    var runtime_log: Dictionary = m.get("runtimeLog", {}).duplicate()
    _put(runtime_log, "firstInteractive", _value("runtimeLog.firstInteractive"), true)
    _set_or_erase(m, "runtimeLog", runtime_log)
    _set_or_erase(m, "userFiles", _list(_value("userFiles")))
    var sentry := {}
    _set_or_erase(sentry, "dsn", _value("sentry.dsn"))
    _set_or_erase(sentry, "environment", _value("sentry.environment"))
    _set_or_erase(sentry, "release", _value("sentry.release"))
    if sentry.has("dsn"):
        if m.get("sentry") is Dictionary and m["sentry"].has("sampleRate"):
            sentry["sampleRate"] = m["sentry"]["sampleRate"]
        m["sentry"] = sentry
    else:
        m.erase("sentry")
    var keys := _list(_value("debugConsole.relayPublicKeys"))
    if keys.is_empty():
        m.erase("debugConsole")
    else:
        m["debugConsole"] = {"relayPublicKeys": keys}

    var file := FileAccess.open(manifest_path, FileAccess.WRITE)
    file.store_string(JSON.stringify(m, "  ", false) + "\n")
    file.close()
    _manifest = m

## 테스트에서 칸 값을 넣습니다
func set_field(key: String, value: Variant) -> void:
    var control: Control = _fields[key]
    if control is LineEdit:
        control.text = str(value)
    elif control is CheckBox:
        control.button_pressed = bool(value)
    elif control is OptionButton:
        for i in control.item_count:
            if control.get_item_text(i) == str(value):
                control.select(i)

func _value(key: String) -> Variant:
    var control: Control = _fields[key]
    if control is LineEdit:
        return control.text.strip_edges()
    if control is CheckBox:
        return control.button_pressed
    return control.get_item_text(control.selected)

func _list(text: String) -> Array:
    var out: Array = []
    for part in text.split(","):
        if not part.strip_edges().is_empty():
            out.append(part.strip_edges())
    return out

## 이미 있던 키면 값을 쓰고, 없던 키는 기본값과 다를 때만 더한다
func _put(target: Dictionary, key: String, value: Variant, default: Variant) -> void:
    if target.has(key) or value != default:
        target[key] = value

func _set_or_erase(target: Dictionary, key: String, value: Variant) -> void:
    var empty: bool = (value is String and value.is_empty()) or (value is Array and value.is_empty()) or (value is Dictionary and value.is_empty())
    if empty:
        target.erase(key)
    else:
        target[key] = value

func _section(form: Control, text: String) -> void:
    var label := Label.new()
    label.text = text
    label.add_theme_font_size_override("font_size", 15)
    form.add_child(label)

func _row(form: Control, text: String, control: Control) -> void:
    var row := HBoxContainer.new()
    var label := Label.new()
    label.text = text
    label.custom_minimum_size.x = 220
    row.add_child(label)
    control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    row.add_child(control)
    form.add_child(row)

func _text(form: Control, key: String, text: String, value: Variant) -> void:
    var edit := LineEdit.new()
    edit.text = str(value)
    _fields[key] = edit
    _row(form, text, edit)

func _check(form: Control, key: String, text: String, value: bool) -> void:
    var box := CheckBox.new()
    box.button_pressed = value
    _fields[key] = box
    _row(form, text, box)

func _option(form: Control, key: String, text: String, options: Array, value: Variant) -> void:
    var option := OptionButton.new()
    for item in options:
        option.add_item(str(item))
    _fields[key] = option
    for i in option.item_count:
        if option.get_item_text(i) == str(value):
            option.select(i)
    _row(form, text, option)
