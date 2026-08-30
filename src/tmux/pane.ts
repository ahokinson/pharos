import { commandExists, runSync } from "@process";
import { templateOptionName } from "@render/templates";
import { renderOpenTuiPane } from "@tmux/opentui-pane";
import { TemplateRenderer } from "@config/types";
import type { Config } from "@config/types";

function tmuxStyleToAnsi(text: string): string {
  return text
    .replace(/#\[fg=#([0-9a-f]{6})\]/gi, (_match, hex) => {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return `\x1b[38;2;${r};${g};${b}m`;
    })
    .replace(/#\[default\]/g, "\x1b[0m");
}

function visibleWidth(text: string): number {
  const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
  let width = 0;
  for (const character of plain) {
    const code = character.codePointAt(0) ?? 0;
    if (/\p{Mark}/u.test(character) || code === 0xfe0f || code === 0x200d) continue;
    const wide = code >= 0x1100 && (
      code <= 0x115f || code === 0x2329 || code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    );
    width += wide ? 2 : 1;
  }
  return width;
}

function rightJustify(text: string, width: number): string {
  return text.split("\n").map((line) => {
    const padding = Math.max(0, width - visibleWidth(line));
    return `${" ".repeat(padding)}${line}`;
  }).join("\n");
}

/** Continuously paints one named ANSI template in a dedicated tmux pane. */
export async function renderPane(args: string[], config: Config): Promise<void> {
  const [templateName, sourcePane] = args;
  if (!templateName || !sourcePane || !commandExists("tmux")) return;
  if (config.templates[templateName]?.renderer === TemplateRenderer.OpenTui) {
    await renderOpenTuiPane(templateName, sourcePane);
    return;
  }

  const option = templateOptionName(templateName);
  let previous = "";
  while (true) {
    const next = runSync(["tmux", "show-options", "-p", "-v", "-t", sourcePane, option]).stdout;
    const pulse = runSync(["tmux", "display", "-p", "-t", sourcePane, "#{@pharos_side_frame1}"]).stdout.trimEnd();
    const paneWidth = Number(runSync(["tmux", "display", "-p", "-t", process.env.TMUX_PANE || sourcePane, "#{pane_width}"]).stdout.trim()) || 30;
    const beacon = pulse ? `${pulse}\n⛯` : "⛯";
    const content = `${beacon}\n${tmuxStyleToAnsi(next.trimEnd())}`;
    const display = `${rightJustify(content, paneWidth)}\n`;
    if (display !== previous) {
      process.stdout.write(`\x1b[H\x1b[J${display}`);
      previous = display;
    }
    await Bun.sleep(150);
  }
}
