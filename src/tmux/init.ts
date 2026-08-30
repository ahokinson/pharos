import { commandExists, runSync } from "@process";

/** Removes historical Pharos status-bar references while preserving every
 * unrelated right-side segment. The sidecard is now Pharos's only display. */
export function statusRightWithoutPharos(current: string): string {
  return current
    .replace(/#\{@(?:claude_(?:frame|pulse)|pharos_(?:status|row[12]|frame[12]))\}/g, "")
    .trim();
}

export async function initTmux(_args: string[]): Promise<void> {
  if (!process.env.TMUX || !process.env.TMUX_PANE) {
    console.error("pharos: not inside tmux — run `pharos tmux init` from a tmux pane.");
    process.exit(1);
  }
  if (!commandExists("tmux")) {
    console.error("pharos: tmux is not on PATH.");
    process.exit(1);
  }

  const currentRight = runSync(["tmux", "show", "-gv", "status-right"]).stdout.trim();

  runSync(["tmux", "set", "-g", "status", "1"]);
  runSync(["tmux", "set", "-gu", "status-format[1]"]);
  runSync(["tmux", "set", "-gu", "status-format[2]"]);
  runSync(["tmux", "set", "-gu", "status-format[3]"]);
  runSync(["tmux", "set", "-g", "status-right", statusRightWithoutPharos(currentRight)]);
  runSync(["tmux", "refresh-client", "-S"]);

  console.log("pharos: bottom status-bar integration removed; activity lives in the sidecard.");
  console.log("pharos: next, point your host's hooks at `pharos tmux render` and `pharos tmux dispatch` — see README.");
}
