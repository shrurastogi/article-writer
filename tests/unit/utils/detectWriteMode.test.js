"use strict";

const { detectWriteMode } = require("../../../src/utils/detectWriteMode");

describe("detectWriteMode", () => {
  test("empty string → generate", () => {
    expect(detectWriteMode("")).toBe("generate");
  });

  test("null/undefined → generate", () => {
    expect(detectWriteMode(null)).toBe("generate");
    expect(detectWriteMode(undefined)).toBe("generate");
  });

  test("whitespace-only → generate", () => {
    expect(detectWriteMode("   \n  ")).toBe("generate");
  });

  test("bullet-heavy section → expand", () => {
    const bullets = "- Point one\n- Point two\n- Point three\n- Point four";
    expect(detectWriteMode(bullets)).toBe("expand");
  });

  test("numbered list → expand", () => {
    const numbered = "1. First item\n2. Second item\n3. Third item";
    expect(detectWriteMode(numbered)).toBe("expand");
  });

  test("mixed bullet characters → expand", () => {
    const mixed = "• Point A\n• Point B\n* Point C";
    expect(detectWriteMode(mixed)).toBe("expand");
  });

  test("prose section → improve", () => {
    const prose = "The pathophysiology of this condition involves a complex interplay of genetic and environmental factors. Recent landmark trials have demonstrated significant improvements in overall survival with novel targeted therapies.";
    expect(detectWriteMode(prose)).toBe("improve");
  });

  test("mixed but prose-dominant → improve", () => {
    const mixed = "Overview:\nThe condition affects approximately 1 in 10,000 individuals.\nKey findings include improvements in PFS.\nTreatment varies by disease stage and patient comorbidities.";
    expect(detectWriteMode(mixed)).toBe("improve");
  });

  test("exactly 40% bullets → improve (threshold is >0.4)", () => {
    // 2 bullets out of 5 lines = 0.4 exactly — should be improve not expand
    const text = "- Bullet one\n- Bullet two\nProse line three\nProse line four\nProse line five";
    expect(detectWriteMode(text)).toBe("improve");
  });

  test("just over 40% bullets → expand", () => {
    // 3 bullets out of 5 lines = 0.6 → expand
    const text = "- Bullet one\n- Bullet two\n- Bullet three\nProse line four\nProse line five";
    expect(detectWriteMode(text)).toBe("expand");
  });
});
