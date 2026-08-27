import { describe, expect, test } from "bun:test";
import { ansiToTmuxStyle, padField, rgbEscape, stripAnsi, visibleWidth } from "@color/ansi";
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

describe("ansiToTmuxStyle", () => {
  test("converts a truecolor escape + reset into tmux's #[fg=] directive form", () => {
    const colored = `${rgbEscape(255, 0, 0)}hi\x1b[0m`;
    expect(ansiToTmuxStyle(colored)).toBe("#[fg=#ff0000]hi#[default]");
  });

  test("doubles literal # characters so tmux doesn't try to interpret them", () => {
    expect(ansiToTmuxStyle("50% #1")).toBe("50% ##1");
  });

  test("plain text with no escapes passes through unchanged (aside from #-escaping)", () => {
    expect(ansiToTmuxStyle("no color here")).toBe("no color here");
  });
});
