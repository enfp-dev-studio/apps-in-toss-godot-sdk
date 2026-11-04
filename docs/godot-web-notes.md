# Godot Web 주의사항

[← 프로젝트 소개](../README.md) · [API 사용법](api-guide.md) · [출시 전 점검](release-checklist.md)

Godot 4.7.2 Web 빌드를 토스 앱 WebView에서 돌리며 확인한 엔진 쪽 동작입니다(cat-room-godot, 2026-10).
SDK 모듈로 해결한 것은 [API 사용법](api-guide.md)에 있고, 여기에는 방법과 이유를 적습니다.
iOS·안드로이드 WebView에서 확인하지 못한 것은 따로 표시했습니다.

## 빌드 종류

SDK는 `build:dev`와 `build`를 모두 release 템플릿으로 내보내 Web에서 `OS.is_debug_build()`가 늘 false입니다.
개발·테스트 빌드는 `AIT.build_kind()`로 가릅니다([API 사용법](api-guide.md#호출-전에-확인할-것)).

## 화면과 그리기

- 기준 크기 360×640, `canvas_items` + `expand`면 360×640 이상 기기에서 UI 1단위가 1 CSS px 이상이라 글자·터치 영역이
  디자인 하한 밑으로 줄지 않습니다([설치 가이드](getting-started.md#4-godot-web-export-설정)).
- Godot는 `window.devicePixelRatio`로 캔버스 픽셀 수를 정합니다. 3배 기기에서 그대로 그리면 2배보다 2.25배 많은 픽셀이라
  셸 템플릿이 상한 2를 둡니다. 바꾸려면 `JavaScriptBridge.get_interface("AppsInTossShell").setPixelCap(1.5)`.
- 정지 화면이 많은 비게임은 `application/run/low_processor_mode=true`로 바뀔 때만 그립니다. 화면을 다른 화면이
  덮으면 뒤의 3D 그리기와 입력도 멈추면 좋습니다.
- Safe Area는 `AIT.safe_area`가 UI 단위로 바꿉니다. 셸에 `viewport-fit=cover`가 있어야 iOS에서 CSS 값이 나옵니다.

## 입력

- 모바일 Web의 터치는 Godot 기본 설정(`input_devices/pointing/emulate_mouse_from_touch`)으로 마우스로도 들어옵니다.
- Button은 누름을 받으면(`mouse_filter` STOP) 부모 ScrollContainer가 끌기를 못 받습니다. `AITTouchScroll`이
  GUI보다 먼저(`_input`) 누름을 보고, 문턱을 넘으면 `NOTIFICATION_SCROLL_BEGIN`으로 버튼 누름을 취소한 뒤 스크롤합니다.
- 한글 입력: cat-room-godot은 한글 입력기(IME)가 그대로 동작하도록 이름 입력을 DOM `<input>` 시트로 띄우고,
  결과를 `JavaScriptBridge.create_callback`으로 받았습니다. 입력칸이 열리는 동안 캔버스 포커스를 놓고, 닫을 때
  `canvas.focus()`로 돌려줍니다. 에디터·데스크톱 실행용으로 LineEdit 대체 입력을 둡니다.
- iOS WKWebView가 입력칸을 보이려고 문서를 스크롤하면 고정 배치된 캔버스가 밀릴 수 있습니다. Unity WebGL 템플릿은
  `visualViewport`로 보정합니다([SDK 개발 기록](sdk-development.md#2026-10-16-unity-sdk-380-대응)). 실기기에서 재현되면 셸에 넣습니다.

## 한글

Godot 줄바꿈은 한글 음절 사이에서도 끊습니다. `AITKorean.keep_all()`은 음절 사이에 단어 결합 문자(U+2060)를 넣어
띄어쓰기에서만 줄을 바꿉니다. 결합 문자는 보이지 않지만 문자열 길이·비교에는 들어가므로, 원문을 따로 두고
Label·Button에 넣기 직전에만 바꿉니다. 조사는 `AITKorean.josa()`로 받침에 맞춥니다.

## 소리

Godot 4.7.2 Web 엔진 코드와 데스크톱 Chrome에서 확인한 내용입니다. **iOS 토스(WKWebView)·안드로이드 WebView에서는 확인하지 못했습니다.**

- Web의 기본 재생 방식(Sample)은 Web Audio의 `loop`를 쓰지 않고, 버퍼가 끝나면 `ended` 이벤트(메인 스레드)에서
  새 `AudioBufferSourceNode`로 처음부터 다시 틉니다. 데스크톱 Chrome에서는 메인 스레드를 일부러 바쁘게 해도 이음매에
  빈틈이 없었습니다. 실기기에서는 루프를 세 번 이어 들으며 이음매를 확인하세요.
- Sample 방식은 소리를 처음 틀 때 스트림 전체를 AudioContext 샘플레이트(보통 48kHz) 스테레오 float32로 다시 그립니다.
  10초짜리 하나가 Web Audio 쪽에서 약 3.8MB입니다. 페이드인 전에 `AudioServer.register_stream_as_sample(stream)`로
  미리 치르고, 다 쓴 플레이어는 `stop()` 뒤 `stream = null`로 참조를 놓아 버퍼를 돌려줍니다.
- WAV를 QOA로 압축해 import하면(`compress/mode=2`) 스크립트에서 `AudioStreamWAV.data`를 PCM으로 읽을 수 없습니다.
- 길게 반복하는 배경음은 OGG가 작습니다. 짧은 효과음은 압축한 WAV로 둡니다.
- 소리를 코드로 만들 때는 `AudioStreamWAV`(16비트, `LOOP_FORWARD`)에 PCM을 넣습니다. Web은 스레드가 없어 무거운 계산이
  메인 스레드를 막으므로, 처음 고를 때 프레임마다 나눠 만들고 `user://`에 캐시합니다(파일 이름에 버전).

```gdscript
func make_loop(pcm: PackedByteArray, mix_rate: int, frames: int) -> AudioStreamWAV:
    var s := AudioStreamWAV.new()
    s.format = AudioStreamWAV.FORMAT_16_BITS
    s.mix_rate = mix_rate
    s.stereo = false
    s.data = pcm  # 16비트 리틀 엔디언
    s.loop_mode = AudioStreamWAV.LOOP_FORWARD
    s.loop_begin = 0
    s.loop_end = frames  # 바이트가 아니라 프레임 수
    return s
```

- 백그라운드·광고·결제 중 정지는 `AIT.sound`(사운드 게이트)로 합니다. 끄기 설정은 각자의 버스로 둡니다.

## 배너 광고

`TossAds.attachBanner`는 DOM 요소가 필요해 Godot 캔버스 안에 그릴 수 없습니다. cat-room-godot은 셸에 배너 자리
`<div>`를 두고 캔버스 위에 겹쳤습니다.

- 위치: 배너를 둘 Control의 전역 영역에 `get_viewport().get_final_transform()`을 곱해 캔버스 픽셀로 바꾸고,
  셸에서 캔버스 `getBoundingClientRect()` 배율로 CSS px로 바꿉니다. 스크롤 영역 밖으로 나가면 잘리도록 바깥 `<div>`를
  스크롤 영역 크기로 두고 `overflow: hidden`.
- 수명: `TossAds.initialize`는 한 번만, 숨길 때 `attachBanner`가 돌려준 핸들을 `destroy`. 지원 여부는 `TossAds.attachBanner`와
  `isSupported()`로 확인합니다.
- 체크리스트: 비게임은 스크롤 가능한 화면에만, 게임은 상단·하단에만 둡니다. 개발 중에는 `ait-ad-test-banner-id`.

## eval 없이 DOM 쓰기

출시 체크리스트는 외부 코드 실행(eval)을 금지합니다. `JavaScriptBridge.eval` 대신 `get_interface`와 `create_callback`으로
DOM API를 직접 부르면 됩니다. `AITSafeArea`의 CSS 인셋 측정이 예입니다.

```gdscript
func css_padding_top(css: String) -> float:
    var document: Variant = JavaScriptBridge.get_interface("document")
    var window: Variant = JavaScriptBridge.get_interface("window")
    if document == null or window == null:
        return 0.0
    var probe: Variant = document.createElement("div")
    probe.style.cssText = css
    document.body.appendChild(probe)
    var top := String(window.getComputedStyle(probe).paddingTop).to_float()
    probe.remove()
    return top
```
