extends SceneTree
## ait-godot export gate: 설치된 애드온의 모든 GDScript가 컴파일되어야 한다.
## Godot export는 깨진 스크립트가 있어도 exit 0을 반환하는 경우가 있어
## 여기서 먼저 loudly 실패시킨다. 사용법:
##   godot --headless --path <게임> --script <이 파일>

const ADDON_ROOT := "res://addons/apps_in_toss"

var _failures: Array[String] = []
var _checked := 0


func _initialize() -> void:
	var files: Array[String] = []
	_collect(ADDON_ROOT, files)
	files.sort()
	for f in files:
		_checked += 1
		var script: Resource = load(f)
		# 주의: 파싱에 실패해도 load()는 null이 아니라 인스턴스화 불가한
		# GDScript를 돌려준다(에러는 stderr의 SCRIPT ERROR로만 나온다).
		# 그래서 can_instantiate()로 판정한다.
		if not (script is GDScript) or not (script as GDScript).can_instantiate():
			_failures.append(f)
	if _failures.is_empty():
		print("[AIT] GDScript compile check passed (%d files)" % _checked)
	else:
		printerr("[AIT] GDScript compile check FAILED:")
		for f in _failures:
			printerr("[AIT]   " + f)
	quit(0 if _failures.is_empty() else 1)


func _collect(dir_path: String, out: Array[String]) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var entry := dir.get_next()
	while entry != "":
		if entry == "." or entry == "..":
			entry = dir.get_next()
			continue
		var full := dir_path + "/" + entry
		if dir.current_is_dir():
			_collect(full, out)
		elif entry.ends_with(".gd"):
			out.append(full)
		entry = dir.get_next()
	dir.list_dir_end()
