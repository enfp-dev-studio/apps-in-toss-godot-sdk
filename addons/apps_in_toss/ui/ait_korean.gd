extends RefCounted
class_name AITKorean

## 한글 화면 글자 도구입니다.
## - keep_all(text): Godot 줄바꿈은 한글 음절 사이에서도 끊습니다(CSS word-break: keep-all이 없음).
##   음절 사이에 단어 결합 문자(U+2060)를 넣어 띄어쓰기에서만 줄이 바뀌게 합니다.
##   Label·Button 글자에 넣기 직전에 씁니다. 결합 문자는 보이지 않지만 글자 수를 세거나 비교할 때는 원문을 쓰세요.
## - josa(word, pair): 받침에 맞는 조사를 붙입니다. josa("치즈", "은/는") → "치즈는", josa("구름", "과/와") → "구름과".
##   "으로/로"는 ㄹ 받침이면 "로"입니다. 끝이 숫자면 읽는 소리(영·일·이…)로 판단하고,
##   한글·숫자가 아니면 받침 없음으로 봅니다.

const WORD_JOINER := "\u2060"


static func keep_all(text: String) -> String:
    var out := ""
    var prev := 0
    for ch in text:
        var c := ch.unicode_at(0)
        if prev != 0 and _joins(prev, c):
            out += WORD_JOINER
        out += ch
        prev = c
    return out


static func josa(word: String, pair: String) -> String:
    var parts := pair.split("/")
    if word == "" or parts.size() < 2:
        return word
    var final := final_consonant(word)
    if pair == "으로/로":
        return word + ("로" if final == -1 or final == 8 else "으로")
    return word + (parts[0] if final != -1 else parts[1])


## 마지막 글자의 받침 번호(종성 인덱스 1~27, ㄹ은 8). 받침이 없으면 -1
static func final_consonant(word: String) -> int:
    if word == "":
        return -1
    var c := word.unicode_at(word.length() - 1)
    if c >= 0xAC00 and c <= 0xD7A3:
        var f := (c - 0xAC00) % 28
        return f if f != 0 else -1
    if c >= 48 and c <= 57:
        # 영 일 이 삼 사 오 육 칠 팔 구
        return [21, 8, -1, 16, -1, -1, 1, 8, 8, -1][c - 48]
    return -1


static func _joins(a: int, b: int) -> bool:
    if _is_space(a) or _is_space(b):
        return false
    return _is_hangul(a) or _is_hangul(b)


static func _is_hangul(c: int) -> bool:
    return (c >= 0xAC00 and c <= 0xD7A3) or (c >= 0x3131 and c <= 0x318E)


static func _is_space(c: int) -> bool:
    return c == 32 or c == 10 or c == 9 or c == 0x2060
