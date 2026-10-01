import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOSPITAL_PRESETS, isValidPreset } from "../src/hospitals.ts";

describe("hospital presets", () => {
  it("8곳, 서버 정규화 전부 통과", () => {
    assert.equal(HOSPITAL_PRESETS.length, 8);
    for (const preset of HOSPITAL_PRESETS) {
      assert.equal(isValidPreset(preset), true, preset.name);
      assert.equal(typeof preset.isGov, "boolean", preset.name);
    }
    assert.equal(HOSPITAL_PRESETS.find((h) => h.name === "일산병원")?.isGov, true);
  });

  it("이름 중복 없음", () => {
    const names = HOSPITAL_PRESETS.map((h) => h.name);
    assert.equal(new Set(names).size, names.length);
  });
});
