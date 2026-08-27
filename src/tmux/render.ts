import type { Config } from "@config";
import { ansiToTmuxStyle } from "@color";
import { commandExists, readStdinJson, runSync } from "@process";
import { computeRows } from "@render/compute";
import { FALLBACK_COLUMNS } from "@render/layout";

// Generalizes tmux/dispatch.ts + tmux/pulse.ts's delivery surface from a
// single animated pulse token into the full rendered statusline: any host
// with hook events firing often enough to refresh a tmux user option gets a
// real pharos statusline in their tmux status bar, whether or not that host
// has shipped its own in-app statusLine feature (see adapters/types.ts's
// TmuxStatusSupport — this is what NativeHooks/BridgeRequired mean).
//
// A hook wires this up the same way it wires up `tmux dispatch`: point the
// hook command at `pharos tmux render`, feeding it whatever stdin JSON that
// hook provides (the resolved adapter's parseSession decides what to make
// of it). Reference #{@pharos_status} from tmux's status-right to display
// it. Fails open throughout, same as dispatch(): any error here should
// never break a hook.
export async function renderToTmux(_args: string[], config: Config): Promise<void> {
  try {
    if (!process.env.TMUX || !process.env.TMUX_PANE) return;
    if (!commandExists("tmux")) return;

    const sessionId = runSync(["tmux", "display", "-p", "-t", process.env.TMUX_PANE, "#{session_id}"]).stdout.trim();
    if (!sessionId) return;

    const parsed = await readStdinJson();

    // tmux status-right has no fixed column count the way a terminal's
    // COLUMNS does; client_width is the closest analog, and status-right
    // rarely gets the client's full width, so this is a rough budget, not
    // an exact fit the way render/index.ts's own COLUMNS-based one is.
    const clientWidth =
      Number(runSync(["tmux", "display", "-p", "-t", sessionId, "#{client_width}"]).stdout.trim()) || FALLBACK_COLUMNS;
    const { row1, row2 } = await computeRows(parsed, config, clientWidth);
    const text = [row1, row2].filter((row) => row.trim().length > 0).join("  ");

    runSync(["tmux", "set", "-t", sessionId, "@pharos_status", ansiToTmuxStyle(text)]);
    runSync(["tmux", "refresh-client", "-S"]);
  } catch {
    // fail open
  }
}
