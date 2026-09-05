import { describe, expect, test } from "bun:test";
import { parseProcessTable, resolveAgentPid } from "@process/ancestry";

// zsh(400) -> claude(500) -> sh(600) -> pharos(700), the shape a hook sees
// when an agent is started from the pane's own shell.
const NORMAL_LAUNCH = [
  "    1     0 10-02:33:44 init",
  "  400     1    01:12:03 zsh",
  "  500   400       08:41 claude",
  "  600   500       00:00 sh",
  "  700   600       00:00 pharos",
].join("\n");

// zsh(400) -> launcher(450) -> claude(500) -> sh(600) -> pharos(700): a tool
// that creates the tmux session and starts the agent itself, one hop further
// up than a normal launch.
const WRAPPED_LAUNCH = [
  "    1     0 10-02:33:44 init",
  "  400     1    01:12:03 zsh",
  "  450   400       09:02 launcher",
  "  500   450       08:41 claude",
  "  600   500       00:00 sh",
  "  700   600       00:00 pharos",
].join("\n");

describe("parseProcessTable", () => {
  test("reads pid, ppid, comm, and every etime shape ps prints", () => {
    const table = parseProcessTable(NORMAL_LAUNCH);
    expect(table.get(1)).toEqual({ ppid: 0, ageSeconds: 10 * 86400 + 2 * 3600 + 33 * 60 + 44, comm: "init" });
    expect(table.get(400)).toEqual({ ppid: 1, ageSeconds: 4323, comm: "zsh" });
    expect(table.get(500)).toEqual({ ppid: 400, ageSeconds: 521, comm: "claude" });
  });

  test("skips headers and malformed rows", () => {
    const table = parseProcessTable("  PID  PPID ELAPSED COMMAND\n  500   400   08:41 claude\ngarbage\n");
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

  // A launcher that creates the session and starts the agent itself puts an
  // extra hop above claude — the positional rule alone lands on the
  // launcher, which is the wrong pid to poll if it doesn't outlive claude.
  test("without a name hint, a wrapper layer resolves to the launcher, not the agent", () => {
    expect(resolveAgentPid(parseProcessTable(WRAPPED_LAUNCH), 700, 400)).toBe(450);
  });

  test("a name hint finds the agent past any number of wrapper layers", () => {
    expect(resolveAgentPid(parseProcessTable(WRAPPED_LAUNCH), 700, 400, "claude")).toBe(500);
  });

  test("a name hint changes nothing for a normal launch", () => {
    expect(resolveAgentPid(parseProcessTable(NORMAL_LAUNCH), 700, 400, "claude")).toBe(500);
  });

  test("an unmatched name hint falls back to the positional rule", () => {
    expect(resolveAgentPid(parseProcessTable(NORMAL_LAUNCH), 700, 400, "codex")).toBe(500);
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
