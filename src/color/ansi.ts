import { hex2 } from "@color/convert";
import type { RGB } from "@color/convert";

export const FG = "\x1b[38;2;";
export const RESET = "\x1b[0m";

/** Truecolor foreground escape for one RGB triple. */
export function rgbEscape(r: number, g: number, b: number): string {
  return `${FG}${r};${g};${b}m`;
}

/** Reverses rgbEscape/FG-prefixed escapes back to their RGB triple. */
export function parseEscape(escape: string): RGB {
  const m = /38;2;(\d+);(\d+);(\d+)/.exec(escape);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export function visibleWidth(s: string): number {
  return stripAnsi(s).length;
}

/** Right-pad a (possibly coloured) field to a fixed visible width, so an
 * absent or shorter field still holds its column. Never truncates. */
export function padField(content: string, width: number): string {
  const gap = Math.max(0, width - visibleWidth(content));
  return content + " ".repeat(gap);
}

// tmux's status-line format engine has its own styling syntax (#[fg=...]),
// not a terminal: raw truecolor SGR escapes embedded in a stored
// @user-option are not guaranteed to render the way a real terminal would
// interpret them (unverified in this environment — no live tmux socket
// access to confirm either way). tmux/pulse.ts already proves #[fg=#hex]
// works for exactly this surface, so this converts render's ANSI output
// into that same, known-working directive form rather than gambling on
// ANSI passthrough. `#` is tmux's own format-escape character, so any
// literal `#` in field text (glyphs, labels) must double up to `##` or
// tmux would try to interpret it.
const ANSI_TOKEN_RE = /\x1b\[38;2;(\d+);(\d+);(\d+)m|\x1b\[0m/g;

export function ansiToTmuxStyle(s: string): string {
  let out = "";
  let lastIndex = 0;
  for (const m of s.matchAll(ANSI_TOKEN_RE)) {
    out += s.slice(lastIndex, m.index).replaceAll("#", "##");
    if (m[1] !== undefined) out += `#[fg=#${hex2(Number(m[1]))}${hex2(Number(m[2]))}${hex2(Number(m[3]))}]`;
    else out += "#[default]";
    lastIndex = m.index + m[0].length;
  }
  out += s.slice(lastIndex).replaceAll("#", "##");
  return out;
}
