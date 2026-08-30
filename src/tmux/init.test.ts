import { describe, expect, test } from "bun:test";
import {
  beamFormatFor,
  fieldsFormatFor,
  parseTmuxVersion,
  statusRightFor,
  supportsMultiline,
} from "@tmux/init";

describe("parseTmuxVersion", () => {
  test("parses a stable release", () => {
    expect(parseTmuxVersion("tmux 3.7c")).toEqual([3, 7]);
  });

  test("parses a next-version build", () => {
    expect(parseTmuxVersion("tmux next-3.5")).toEqual([3, 5]);
  });

  test("parses a major release", () => {
    expect(parseTmuxVersion("tmux 4.0")).toEqual([4, 0]);
  });

  test("returns null when no version is present", () => {
    expect(parseTmuxVersion("tmux")).toBeNull();
  });
});

describe("supportsMultiline", () => {
  test("accepts 3.4 and later", () => {
    expect(supportsMultiline([3, 4])).toBe(true);
    expect(supportsMultiline([3, 7])).toBe(true);
    expect(supportsMultiline([4, 0])).toBe(true);
  });

  test("rejects anything before 3.4", () => {
    expect(supportsMultiline([3, 3])).toBe(false);
    expect(supportsMultiline([2, 9])).toBe(false);
  });
});

describe("statusRightFor", () => {
  test("multiline: strips stale pharos references and installs lane one", () => {
    expect(statusRightFor(true, "#{@pharos_status}#{@claude_frame}")).toBe("");
  });

  test("multiline: strips row references too", () => {
    expect(statusRightFor(true, "#{@pharos_row1}#{@claude_frame}")).toBe("");
  });

  test("multiline: appends the pulse when the bar has no other pharos content", () => {
    expect(statusRightFor(true, " ")).toBe("");
  });

  test("multiline: keeps unrelated status-right content next to the pulse", () => {
    expect(statusRightFor(true, "#{T:grid} #{@claude_frame}")).toBe("#{T:grid}");
  });

  test("single-line fallback: adds the joined reference plus the pulse", () => {
    expect(statusRightFor(false, "")).toBe("");
  });

  test("single-line fallback: leaves an existing pharos reference alone", () => {
    expect(statusRightFor(false, "#{@pharos_status}#{@claude_frame}")).toBe("");
  });
});

describe("fieldsFormatFor", () => {
  test("maps row 1 to its user-option reference", () => {
    expect(fieldsFormatFor(1)).toBe("#{?@pharos_ai,#{@pharos_row1},}");
  });

  test("maps row 2 to its user-option reference", () => {
    expect(fieldsFormatFor(2)).toBe("#{?@pharos_ai,#{@pharos_row2},}");
  });

  test("maps each lighthouse lane to its session frame", () => {
    expect(beamFormatFor(1)).toBe("#{@pharos_frame1}");
    expect(beamFormatFor(2)).toBe("#{@pharos_frame2}");
  });
});
