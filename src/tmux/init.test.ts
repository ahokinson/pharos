import { describe, expect, test } from "bun:test";
import { statusRightWithoutPharos } from "@tmux/init";

describe("statusRightWithoutPharos", () => {
  test("strips historical Pharos and Claude beam references", () => {
    expect(statusRightWithoutPharos("#{@pharos_status}#{@claude_frame}")).toBe("");
  });

  test("multiline: strips row references too", () => {
    expect(statusRightWithoutPharos("#{@pharos_row1}#{@claude_frame}")).toBe("");
  });

  test("multiline: appends the pulse when the bar has no other pharos content", () => {
    expect(statusRightWithoutPharos(" ")).toBe("");
  });

  test("multiline: keeps unrelated status-right content next to the pulse", () => {
    expect(statusRightWithoutPharos("#{T:grid} #{@claude_frame}")).toBe("#{T:grid}");
  });
});
