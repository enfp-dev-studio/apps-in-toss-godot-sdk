// export/import 출력의 SCRIPT ERROR 검출(findScriptErrors) 회귀 테스트.
// 색 코드·줄 앞 공백이 있어도 잡고, 정보성 라인은 고르지 않는다.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findScriptErrors } from '../addons/apps_in_toss/tools/scripts/export-dir.mjs';

describe('findScriptErrors', () => {
  it("평범한 'SCRIPT ERROR: ...'를 검출한다", () => {
    const out = findScriptErrors("Godot Engine v4.7.2\nSCRIPT ERROR: Invalid call.\n");
    assert.equal(out.length, 1);
    assert.match(out[0], /SCRIPT ERROR/);
  });

  it('ANSI 색 코드가 붙어도 검출한다', () => {
    const out = findScriptErrors('\u001b[1;31mSCRIPT ERROR:\u001b[0m Invalid call.\n');
    assert.equal(out.length, 1);
    assert.match(out[0], /SCRIPT ERROR/);
  });

  it('줄 앞 공백이 있어도 검출한다', () => {
    const out = findScriptErrors('   SCRIPT ERROR: Parse error in ui.gd\n');
    assert.equal(out.length, 1);
  });

  it("'error: WARNING' 같은 정보 줄은 검출하지 않는다", () => {
    const out = findScriptErrors('error: WARNING: unused variable\nWARNING: something\n');
    assert.deepEqual(out, []);
  });

  it('빈 문자열은 검출하지 않는다', () => {
    assert.deepEqual(findScriptErrors(''), []);
  });
});
