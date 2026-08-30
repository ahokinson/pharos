import { describe, expect, test } from "bun:test";
import { activePanesFrom, sweepState } from "@tmux/pulse";
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
