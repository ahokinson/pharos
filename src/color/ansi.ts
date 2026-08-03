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
