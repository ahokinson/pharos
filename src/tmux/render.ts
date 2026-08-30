import type { Config } from "@config";
import { ansiToTmuxStyle } from "@color";
import { commandExists, readStdinJson, runSync } from "@process";
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

    const sessionId = runSync(["tmux", "display", "-p", "-t", process.env.TMUX_PANE, "#{session_id}"]).stdout.trim();
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

    // Rows belong to the pane that emitted this hook. tmux evaluates pane
    // options in the selected-pane context, so other panes stay clean while
    // this pane retains its last useful summary after it becomes idle.
    const paneId = process.env.TMUX_PANE;
    runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_ai", "1"]);
    runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_row1", ansiToTmuxStyle(row1)]);
    runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_row2", ansiToTmuxStyle(row2)]);
    const text = [row1, row2].filter((row) => row.trim().length > 0).join("  ");
    runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_status", ansiToTmuxStyle(text)]);
    const state = runSync(["tmux", "show-options", "-p", "-v", "-t", paneId, "@pharos_pulse"]).stdout.trim() || "idle";
    for (const [name, template] of Object.entries(config.templates)) {
      const output = renderTemplate(template, { tool, state, interaction: interactionCapability(state), ...fields });
      runSync(["tmux", "set", "-p", "-t", paneId, templateOptionName(name), output]);
    }

    runSync(["tmux", "refresh-client", "-S"]);
  } catch {
    // fail open
  }
}
