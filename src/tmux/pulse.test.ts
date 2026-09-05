import { describe, expect, test } from "bun:test";
import { activePanesFrom, glyphForBrightness, restFrame, sweepState } from "@tmux/pulse";
import { PulseState } from "@tmux/states";

const SWEEP_FRAMES = 26;
const CYCLE = 36;

describe("activePanesFrom", () => {
  test("keeps active panes in stable pane-index order", () => {
    expect(activePanesFrom("%8|3|tool\n%4|1|think\n%6|2|ask\n")).toEqual([
      { id: "%4", index: 1, state: PulseState.Think },
      { id: "%6", index: 2, state: PulseState.Ask },
      { id: "%8", index: 3, state: PulseState.Tool },
    ]);
  });

  test("ignores idle and malformed pane state", () => {
    expect(activePanesFrom("%1|0|off\n%2|1|\ninvalid\n%3|2|think\n")).toEqual([
      { id: "%3", index: 2, state: PulseState.Think },
    ]);
  });
});

describe("sweepState", () => {
  test("is dark for the whole rotation gap", () => {
    for (let frame = SWEEP_FRAMES; frame < CYCLE; frame++) {
      expect(sweepState(frame, 22)).toBeNull();
    }
  });

  test("fades in and out of the sweep, peaking mid-pass", () => {
    const first = sweepState(0, 22)!;
    const peak = sweepState(Math.floor(SWEEP_FRAMES / 2), 22)!;
    const last = sweepState(SWEEP_FRAMES - 1, 22)!;
    expect(first.strength).toBe(0);
    expect(peak.strength).toBeCloseTo(1, 3);
    expect(last.strength).toBeLessThan(0.05);
  });

  test("advances the head across the track", () => {
    const early = sweepState(5, 22)!.head;
    const middle = sweepState(13, 22)!.head;
    const late = sweepState(21, 22)!.head;
    expect(early).toBeGreaterThan(0);
    expect(middle).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(middle);
    expect(late).toBeLessThan(21);
  });

  test("wraps back to the start after the gap", () => {
    expect(sweepState(CYCLE, 22)).toEqual(sweepState(0, 22));
  });
});

describe("glyphForBrightness", () => {
  test("steps down through the block tiers, then shrinking Braille dots, to blank", () => {
    expect(glyphForBrightness(1)).toBe("█");
    expect(glyphForBrightness(0.6)).toBe("▓");
    expect(glyphForBrightness(0.4)).toBe("▒");
    expect(glyphForBrightness(0.2)).toBe("░");
    expect(glyphForBrightness(0.1)).toBe("⠶");
    expect(glyphForBrightness(0.06)).toBe("⠒");
    expect(glyphForBrightness(0.01)).toBe("⠂");
    expect(glyphForBrightness(0)).toBe(" ");
    expect(glyphForBrightness(-1)).toBe(" ");
  });

  test("each Braille tier is a sparser mark than the one before it", () => {
    // A Braille glyph's codepoint is 0x2800 plus one bit per dot; popcount
    // of that offset is how many dots are actually lit.
    const dots = (glyph: string) => (glyph.codePointAt(0)! - 0x2800).toString(2).split("").filter((bit) => bit === "1").length;
    expect(dots(glyphForBrightness(0.1))).toBeGreaterThan(dots(glyphForBrightness(0.06)));
    expect(dots(glyphForBrightness(0.06))).toBeGreaterThan(dots(glyphForBrightness(0.01)));
  });
});

describe("restFrame", () => {
  test("puts the lighthouse glyph on its own center column, blank either side", () => {
    const frame = restFrame();
    const plain = frame.replace(/#\[default\]$/, "");
    const centerIndex = [...plain].indexOf("⛯");
    expect(centerIndex).toBeGreaterThan(0);
    expect(centerIndex).toBe(plain.length - 1 - centerIndex);
    expect([...plain].every((ch, index) => index === centerIndex || ch === " ")).toBe(true);
  });
});
