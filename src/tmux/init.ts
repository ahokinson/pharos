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
  const parts: string[] = cleaned ? [cleaned] : [];
  if (!multiline) parts.unshift("#{?@pharos_ai,#{@pharos_status},}");
  parts.push(beamFormatFor(1));
  return parts.join("");
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

  if (multiline) {
    // Line zero remains the user's normal tabs/status bar plus beam one.
    // The remaining lines reserve the second beam lane and two contextual
    // rows, allowing multiple agents without turning shell panes into a
    // dashboard.
    runSync(["tmux", "set", "-g", "status", "4"]);
    runSync(["tmux", "set", "-g", "status-format[1]", beamFormatFor(2)]);
    runSync(["tmux", "set", "-g", "status-format[2]", fieldsFormatFor(1)]);
    runSync(["tmux", "set", "-g", "status-format[3]", fieldsFormatFor(2)]);
  }
  runSync(["tmux", "set", "-g", "status-right", statusRightFor(multiline, currentRight)]);
  runSync(["tmux", "refresh-client", "-S"]);

  if (multiline) {
    console.log("pharos: four-line status wired — two lighthouse lanes plus contextual AI fields.");
  } else {
    console.log(`pharos: tmux ${version ? version.join(".") : "?"} has no multi-line status; kept one beam and contextual joined fields.`);
  }
  console.log("pharos: revert with: tmux set -g status 1 && tmux set -gu status-format[1] && tmux set -gu status-format[2] && tmux set -gu status-format[3]");
  console.log("pharos: next, point your host's hooks at `pharos tmux render` and `pharos tmux dispatch` — see README.");
}
