import type { Config } from "@config";
import { commandExists, runSync } from "@process";

const MULTILINE_MIN: readonly [number, number] = [3, 4];

/** Fields are pane-local. The conditional leaves these lines blank while a
 * normal shell pane is selected, without hiding the global lighthouse. */
export function fieldsFormatFor(row: 1 | 2): string {
  return `#{?@pharos_ai,#{@pharos_row${row}},}`;
}

export function beamFormatFor(lane: 1 | 2): string {
  return `#{@pharos_frame${lane}}`;
}

export function parseTmuxVersion(output: string): [number, number] | null {
  const match = output.match(/(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function supportsMultiline(version: [number, number]): boolean {
  const [major, minor] = version;
  return major > MULTILINE_MIN[0] || (major === MULTILINE_MIN[0] && minor >= MULTILINE_MIN[1]);
}

/** Removes references owned by both the old session-wide implementation and
 * the pane-aware layout, preserving all unrelated theme/user content. */
export function statusRightFor(multiline: boolean, current: string): string {
  const cleaned = current
    .replace(/#\{@(?:claude_(?:frame|pulse)|pharos_(?:status|row[12]|frame[12]))\}/g, "")
    .trim();
  return cleaned;
}

export async function initTmux(_args: string[], _config: Config): Promise<void> {
  if (!process.env.TMUX || !process.env.TMUX_PANE) {
    console.error("pharos: not inside tmux — run `pharos tmux init` from a tmux pane.");
    process.exit(1);
  }
  if (!commandExists("tmux")) {
    console.error("pharos: tmux is not on PATH.");
    process.exit(1);
  }

  const version = parseTmuxVersion(runSync(["tmux", "-V"]).stdout);
  const multiline = version !== null && supportsMultiline(version);
  const currentRight = runSync(["tmux", "show", "-gv", "status-right"]).stdout.trim();

  runSync(["tmux", "set", "-g", "status", "1"]);
  runSync(["tmux", "set", "-gu", "status-format[1]"]);
  runSync(["tmux", "set", "-gu", "status-format[2]"]);
  runSync(["tmux", "set", "-gu", "status-format[3]"]);
  runSync(["tmux", "set", "-g", "status-right", statusRightFor(multiline, currentRight)]);
  runSync(["tmux", "refresh-client", "-S"]);

  if (multiline) {
    console.log("pharos: custom pane dashboard enabled; status bar left to tmux.");
  } else console.log(`pharos: tmux ${version ? version.join(".") : "?"} status bar left to tmux; dashboard lives in the pane.`);
  console.log("pharos: next, point your host's hooks at `pharos tmux render` and `pharos tmux dispatch` — see README.");
}
