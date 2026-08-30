import { describe, expect, test } from "bun:test";
import { parseProcessTable, resolveAgentPid } from "@process/ancestry";

// zsh(400) -> claude(500) -> sh(600) -> pharos(700), the shape a hook sees
// when an agent is started from the pane's own shell.
const NORMAL_LAUNCH = [
  "    1     0 10-02:33:44",
  "  400     1    01:12:03",
  "  500   400       08:41",
  "  600   500       00:00",
  "  700   600       00:00",
].join("\n");

describe("parseProcessTable", () => {
  test("reads pid, ppid, and every etime shape ps prints", () => {
    const table = parseProcessTable(NORMAL_LAUNCH);
    expect(table.get(1)).toEqual({ ppid: 0, ageSeconds: 10 * 86400 + 2 * 3600 + 33 * 60 + 44 });
    expect(table.get(400)).toEqual({ ppid: 1, ageSeconds: 4323 });
    expect(table.get(500)).toEqual({ ppid: 400, ageSeconds: 521 });
  });

  test("skips headers and malformed rows", () => {
    const table = parseProcessTable("  PID  PPID ELAPSED\n  500   400   08:41\ngarbage\n");
    expect([...table.keys()]).toEqual([500]);
  });
});

describe("resolveAgentPid", () => {
  test("resolves the agent started from the pane's shell", () => {
    expect(resolveAgentPid(parseProcessTable(NORMAL_LAUNCH), 700, 400)).toBe(500);
  });

  test("resolves when the agent spawns the hook with no shell between", () => {
    expect(resolveAgentPid(parseProcessTable(NORMAL_LAUNCH), 600, 400)).toBe(500);
  });

  // claude(400) -> sh(600) -> pharos(700): the candidate is a hook shell
  // that outlives nothing, so pane existence is the better signal.
  test("declines a transient hook shell when the pane's command is the agent", () => {
    const table = parseProcessTable(["  400     1    01:12:03", "  600   400       00:00", "  700   600       00:00"].join("\n"));
    expect(resolveAgentPid(table, 700, 400)).toBeNull();
  });

  test("returns null when the pane never appears in the chain", () => {
    expect(resolveAgentPid(parseProcessTable(NORMAL_LAUNCH), 700, 999)).toBeNull();
  });

  test("returns null when the hook is the pane process itself", () => {
    expect(resolveAgentPid(parseProcessTable(NORMAL_LAUNCH), 400, 400)).toBeNull();
  });

  test("survives a cyclic table", () => {
    const table = parseProcessTable(["  500   600       08:41", "  600   500       08:41"].join("\n"));
    expect(resolveAgentPid(table, 500, 400)).toBeNull();
  });
});
