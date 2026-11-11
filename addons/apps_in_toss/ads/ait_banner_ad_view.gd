extends Control
class_name AITBannerAdView

## 토스 배너 광고를 이 Control 영역 위에 띄우는 노드입니다(Unity SDK 3.9.0 AITBannerAdView 대응).
## 평소처럼 앵커·크기로 배치하고 광고 그룹 ID를 넣으면, SDK가 그 화면 영역 위에 배너를 올리고
## 이동·크기 변경·화면 회전을 따라갑니다. 노드마다 따로 슬롯을 쓰므로 여러 개를 함께 띄울 수 있습니다.
## 실제 광고는 토스 앱·샌드박스에서만 나옵니다. event 모양은 AITBannerAd.ad_event와 같습니다.

signal ad_event(event: Dictionary)

enum Placement { FOLLOW_CONTROL, SCREEN_TOP, SCREEN_BOTTOM }

const RECT_EPSILON := 0.0005

## 광고 그룹 ID(표시 중 바꾸면 다음 show부터 적용)
@export var ad_group_id := ""
## FOLLOW_CONTROL이면 이 Control 영역을 따라가고, SCREEN_TOP·SCREEN_BOTTOM이면 화면 위·아래 띠에 띄웁니다
@export var placement := Placement.FOLLOW_CONTROL
## 트리에 들어오고 보일 때 자동으로 띄웁니다
@export var show_on_ready := true
## 렌더된 배너 높이에 맞춰 이 Control 높이를 바꿉니다(FOLLOW_CONTROL 전용). 컨테이너가 크기를 정하는 곳에서는
## false로 두고 rendered_height_local을 custom_minimum_size.y 등에 직접 넣으세요
@export var auto_resize_height := true
@export_enum("auto", "light", "dark") var banner_theme := "auto"
@export_enum("blackAndWhite", "grey") var banner_tone := "blackAndWhite"
@export_enum("card", "expanded") var banner_variant := "expanded"
## 비우면 /root/AIT의 banner를 씁니다(테스트에서 주입)
var banner_module: AITBannerAd

## 가장 최근 resized 이벤트로 계산한 배너 높이(이 Control의 로컬 단위). FOLLOW_CONTROL일 때만 채웁니다
var rendered_height_local := 0.0

var _slot := -1
var _last_rect := Rect2(-1, -1, -1, -1)
var _last_projected_height := -1.0

func _ready() -> void:
    if Engine.is_editor_hint():
        return
    visibility_changed.connect(_on_visibility_changed)
    get_viewport().size_changed.connect(_on_viewport_size_changed)
    if show_on_ready and is_visible_in_tree() and not ad_group_id.is_empty():
        show_banner()

func _exit_tree() -> void:
    hide_banner()

## 배너를 띄웁니다(이미 떠 있으면 바꿉니다)
func show_banner() -> void:
    if ad_group_id.is_empty():
        push_warning("[AITBannerAdView] 광고 그룹 ID가 비어 있습니다.")
        return
    var module := _module()
    if module == null:
        push_warning("[AITBannerAdView] AIT 오토로드가 없습니다.")
        return
    hide_banner()
    var mode := AITBannerAd.MODE_RECT
    if placement == Placement.SCREEN_TOP:
        mode = AITBannerAd.MODE_TOP
    elif placement == Placement.SCREEN_BOTTOM:
        mode = AITBannerAd.MODE_BOTTOM
    _last_rect = Rect2(-1, -1, -1, -1)
    _last_projected_height = -1.0
    rendered_height_local = 0.0
    _slot = module.open_slot(ad_group_id, mode, banner_theme, banner_tone, banner_variant, _on_ad_event)
    # 브리지가 attach를 한 틱 미루므로 첫 위치가 먼저 들어간다
    if mode == AITBannerAd.MODE_RECT:
        _push_rect(true)

func hide_banner() -> void:
    if _slot < 0:
        return
    var module := _module()
    if module != null:
        module.close_slot(_slot)
    _slot = -1

func is_showing() -> bool:
    return _slot >= 0

func _process(_delta: float) -> void:
    if Engine.is_editor_hint() or _slot < 0 or placement != Placement.FOLLOW_CONTROL:
        return
    _push_rect(false)

## 이 Control의 화면 영역을 캔버스 기준 0~1 사각형(왼쪽 위 원점)으로 바꿔 넘깁니다
func _push_rect(force: bool) -> void:
    var viewport_size := get_viewport_rect().size
    if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
        return
    var screen_rect := get_global_transform_with_canvas() * Rect2(Vector2.ZERO, size)
    var rect := Rect2(screen_rect.position / viewport_size, screen_rect.size / viewport_size).abs()
    _last_projected_height = rect.size.y
    if not force and absf(rect.position.x - _last_rect.position.x) < RECT_EPSILON \
            and absf(rect.position.y - _last_rect.position.y) < RECT_EPSILON \
            and absf(rect.size.x - _last_rect.size.x) < RECT_EPSILON \
            and absf(rect.size.y - _last_rect.size.y) < RECT_EPSILON:
        return
    _last_rect = rect
    _module().set_slot_rect(_slot, rect)

func _on_ad_event(event: Dictionary) -> void:
    if event.get("kind") == "resized":
        _apply_resized(event)
    ad_event.emit(event)

## resized의 height_fraction(캔버스 대비)으로 배너 높이를 로컬 단위로 바꿔 rendered_height_local에 두고,
## auto_resize_height면 이 Control 높이를 맞춥니다. 세로로 늘어나는 앵커면 부모가 높이를 정하므로 바꾸지 않습니다.
func _apply_resized(event: Dictionary) -> void:
    if placement != Placement.FOLLOW_CONTROL or _slot < 0:
        return
    var fraction := float(event.get("height_fraction", 0.0))
    if fraction <= 0.0 or _last_projected_height <= RECT_EPSILON:
        return
    var target := size.y * (fraction / _last_projected_height)
    if target <= 0.0 or is_nan(target) or is_inf(target):
        return
    rendered_height_local = target
    if not auto_resize_height or absf(anchor_bottom - anchor_top) > RECT_EPSILON:
        return
    if absf(size.y - target) >= 0.5:
        size.y = target
    _last_projected_height = fraction

func _on_visibility_changed() -> void:
    if is_visible_in_tree():
        if show_on_ready and _slot < 0 and not ad_group_id.is_empty():
            show_banner()
    else:
        hide_banner()

func _on_viewport_size_changed() -> void:
    if _slot >= 0:
        _module().refresh_sizes()

func _module() -> AITBannerAd:
    if banner_module != null:
        return banner_module
    var ait := get_node_or_null("/root/AIT")
    return ait.get("banner") if ait != null else null
