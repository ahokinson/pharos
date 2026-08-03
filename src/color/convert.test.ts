import { describe, expect, test } from "bun:test";
import { hslToRgb, rgbToHsl } from "@color/convert";

describe("rgbToHsl / hslToRgb round-trip", () => {
  test.each([
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [166, 209, 137],
    [0, 0, 0],
    [255, 255, 255],
    [128, 128, 128],
  ])("round-trips (%i, %i, %i)", (r, g, b) => {
    const { h, s, l } = rgbToHsl(r, g, b);
    const back = hslToRgb(h, s, l);
    expect(back.r).toBeCloseTo(r, 0);
    expect(back.g).toBeCloseTo(g, 0);
    expect(back.b).toBeCloseTo(b, 0);
  });
});
