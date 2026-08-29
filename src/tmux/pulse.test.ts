import { describe, expect, test } from "bun:test";
import { activePanesFrom } from "@tmux/pulse";
import { PulseState } from "@tmux/states";

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
