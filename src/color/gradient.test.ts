import { describe, expect, test } from "bun:test";
import { buildTail, gradient, lerpColor } from "@color/gradient";
import { DEFAULT_PALETTE as palette } from "@color/palette";

describe("gradient", () => {
  test("emits one colour escape per character", () => {
    const out = gradient("abc", palette.green, palette.red);
    const matches = out.match(/\x1b\[38;2;\d+;\d+;\d+m./g);
    expect(matches).toHaveLength(3);
  });

  test("first and last characters land on the endpoint colours over a single-span gradient", () => {
    const out = gradient("ab", palette.green, palette.red);
    expect(out.startsWith(palette.green)).toBe(true);
    expect(out.endsWith(`${palette.red}b`)).toBe(true);
  });

  test("empty text produces empty output", () => {
    expect(gradient("", palette.green, palette.red)).toBe("");
  });
});

describe("lerpColor", () => {
  test("t=0 returns the start colour", () => {
    expect(lerpColor(0, palette.green, palette.red)).toBe(palette.green);
  });

  test("t=1 returns the end colour", () => {
    expect(lerpColor(1, palette.green, palette.red)).toBe(palette.red);
  });

  test("clamps out-of-range t", () => {
    expect(lerpColor(-5, palette.green, palette.red)).toBe(palette.green);
    expect(lerpColor(5, palette.green, palette.red)).toBe(palette.red);
  });
});

describe("buildTail", () => {
  test("first entry matches the from colour, last matches the to colour", () => {
    const tail = buildTail("#ff0000", "#000000", 5);
    expect(tail[0]).toBe("#ff0000");
    expect(tail[4]).toBe("#000000");
    expect(tail).toHaveLength(5);
  });
});
