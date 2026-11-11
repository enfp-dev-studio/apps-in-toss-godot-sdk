@tool
extends RefCounted
class_name AITIssueReport

## 이슈 제보(Unity SDK 3.9.0 AIT > 이슈 제보하기 대응). Unity는 토스의 Sentry 프로젝트로 보내지만, 이 SDK는
## 커뮤니티 SDK라 SDK 저장소의 GitHub 이슈 작성 화면을 진단 정보로 채워 엽니다. 보내기 전에 브라우저에서 고칠 수 있습니다.
## 진단 정보: SDK·web-framework·Godot 판, OS, 마지막 빌드 실패 진단(build/last-build-error.json). 홈 경로는 ~로 가립니다.

const NEW_ISSUE_URL := "https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk/issues/new"
const MAX_BODY := 6000

static func body(project_dir: String, description: String) -> String:
    var lines := PackedStringArray([
        description.strip_edges() if not description.strip_edges().is_empty() else "(무엇이 어떻게 안 되는지 적어 주세요)",
        "",
        "### 환경",
        "- Apps in Toss Godot SDK: %s" % AITVersion.full_version(),
        "- Godot: %s" % String(Engine.get_version_info().get("string", "")),
        "- OS: %s %s" % [OS.get_name(), OS.get_version()],
    ])
    var diagnosis_path := project_dir.path_join("build/last-build-error.json")
    if FileAccess.file_exists(diagnosis_path):
        var diagnosis: Variant = JSON.parse_string(FileAccess.get_file_as_string(diagnosis_path))
        if diagnosis is Dictionary:
            lines.append("")
            lines.append("### 마지막 빌드 실패: %s (exit %s, %s)" % [diagnosis.get("step", ""), diagnosis.get("exitCode", "?"), diagnosis.get("at", "")])
            lines.append("```")
            lines.append_array(PackedStringArray(diagnosis.get("tail", [])))
            lines.append("```")
    var text := "\n".join(lines)
    for home in [OS.get_environment("HOME"), OS.get_environment("USERPROFILE")]:
        if not String(home).is_empty():
            text = text.replace(home, "~")
    return text.left(MAX_BODY)

static func url(title: String, issue_body: String) -> String:
    return "%s?title=%s&body=%s" % [NEW_ISSUE_URL, title.strip_edges().uri_encode(), issue_body.uri_encode()]
