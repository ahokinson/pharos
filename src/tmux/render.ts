import type { Config } from "@config";
import { ansiToTmuxStyle } from "@color";
import { commandExists, currentAgentPid, processAlive, readStdinJson, runSync } from "@process";
import { computeRows } from "@render/compute";
import { FALLBACK_COLUMNS } from "@render/layout";
import { renderTemplate, templateOptionName } from "@render/templates";
import { interactionCapability } from "@session/capabilities";

// Generalizes tmux/dispatch.ts + tmux/pulse.ts's delivery surface from a
// single animated pulse token into the full rendered statusline: any host
// with hook events firing often enough to refresh tmux user options gets a
// real pharos statusline in the tmux status bar (see adapters/types.ts's
// TmuxStatusSupport — this is what NativeHooks/BridgeRequired mean).
//
// A hook wires this up the same way it wires up `tmux dispatch`: point the
// hook command at `pharos tmux render`, feeding it whatever stdin JSON that
// hook provides (the resolved adapter's parseSession decides what to make
// of it). `pharos tmux init` wires the display side: two contextual field
// lines below the lighthouse lanes. #{@pharos_status} carries both rows
// joined, for a single-line status bar (or a hand-rolled format). Named
// templates are stored alongside those legacy values so a tmux pane can
// display a separate compact view. Fails open throughout, same as dispatch().
export async function renderToTmux(_args: string[], config: Config): Promise<void> {
  try {
    if (!process.env.TMUX || !process.env.TMUX_PANE) return;
    if (!commandExists("tmux")) return;

    // One expansion for everything this render needs off the hook-emitting
    // pane: the session it belongs to, the shell tmux started it with (the
    // anchor for resolving the agent behind this hook), the live pulse
    // state, and whatever agent pid an earlier render already resolved.
    // Pipe-separated on one line, the same shape activePanesFrom consumes in
    // tmux/pulse.ts: none of these four can contain a pipe.
    const paneId = process.env.TMUX_PANE;
    const [sessionId = "", panePid = "", pulse = "", knownPid = ""] = runSync([
      "tmux", "display", "-p", "-t", paneId, "#{session_id}|#{pane_pid}|#{@pharos_pulse}|#{@pharos_pid}",
    ]).stdout.trim().split("|");
    if (!sessionId) return;

    const parsed = await readStdinJson();

    // tmux status lines have no fixed column count the way a terminal's
    // COLUMNS does; client_width is the closest analog. Each row owns one
    // status line (status-format[2] and [3], wired by init), so it budgets
    // the client width in full. The joined @pharos_status keeps the
    // pre-3.4 single-line fallback working; with both rows at full width
    // it can spill past the bar edge there, which is fine — that's the
    // deprecated surface.
    const clientWidth =
      Number(runSync(["tmux", "display", "-p", "-t", sessionId, "#{client_width}"]).stdout.trim()) || FALLBACK_COLUMNS;
    const width = Math.max(20, clientWidth - 1);
    const { row1, row2, fields, tool } = await computeRows(parsed, config, { row1: width, row2: width });

    runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_ai", "1"]);

    // @pharos_ai marks the pane for good, but anything drawn outside it also
    // needs to know when the agent itself is gone — and nothing hooks a
    // crash or a kill -9. A pid to poll is the only signal that survives
    // those. Resolving one costs a walk of the process table, so only pay
    // for it once the pid we already published has died.
    const panePidNumber = Number(panePid);
    if (panePidNumber > 0 && (!knownPid || !processAlive(Number(knownPid)))) {
      const agentPid = currentAgentPid(process.pid, panePidNumber, tool);
      if (agentPid) runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_pid", String(agentPid)]);
    }

    // Rows belong to the pane that emitted this hook. tmux evaluates pane
    // options in the selected-pane context, so other panes stay clean while
    // this pane retains its last useful summary after it becomes idle.
    runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_row1", ansiToTmuxStyle(row1)]);
    runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_row2", ansiToTmuxStyle(row2)]);
    const text = [row1, row2].filter((row) => row.trim().length > 0).join("  ");
    runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_status", ansiToTmuxStyle(text)]);
    const state = pulse || "idle";
    for (const [name, template] of Object.entries(config.templates)) {
      const output = renderTemplate(template, { tool, state, interaction: interactionCapability(state), ...fields });
      runSync(["tmux", "set", "-p", "-t", paneId, templateOptionName(name), output]);
    }

    runSync(["tmux", "refresh-client", "-S"]);
  } catch {
    // fail open
  }
}
