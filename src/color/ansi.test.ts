import { describe, expect, test } from "bun:test";
import { padField, stripAnsi, visibleWidth } from "@color/ansi";
import { DEFAULT_PALETTE as palette } from "@color/palette";

describe("stripAnsi / visibleWidth / padField", () => {
  test("strips truecolor escapes", () => {
    const colored = `${palette.red}hi${palette.green}`;
    expect(stripAnsi(colored)).toBe("hi");
    expect(visibleWidth(colored)).toBe(2);
  });

  test("pads to the visible width, ignoring escapes", () => {
    const colored = `${palette.red}hi`;
    expect(padField(colored, 5)).toBe(`${colored}   `);
  });

  test("never truncates content longer than the target width", () => {
    expect(padField("toolong", 3)).toBe("toolong");
  });
});
