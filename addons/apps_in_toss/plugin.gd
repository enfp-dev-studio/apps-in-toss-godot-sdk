@tool
extends EditorPlugin

const AUTOLOAD_NAME := "AIT"
const AUTOLOAD_PATH := "res://addons/apps_in_toss/ait.gd"

func _enter_tree() -> void:
    if not ProjectSettings.has_setting("autoload/%s" % AUTOLOAD_NAME):
        add_autoload_singleton(AUTOLOAD_NAME, AUTOLOAD_PATH)

func _exit_tree() -> void:
    if ProjectSettings.has_setting("autoload/%s" % AUTOLOAD_NAME):
        var configured_path := String(ProjectSettings.get_setting("autoload/%s" % AUTOLOAD_NAME))
        if configured_path.trim_prefix("*") == AUTOLOAD_PATH:
            remove_autoload_singleton(AUTOLOAD_NAME)
