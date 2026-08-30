import { BoxRenderable, createCliRenderer, RGBA, StyledText, TextRenderable } from "@opentui/core";
import type { TextChunk } from "@opentui/core";

import { commandExists, runSync } from "@process";
import { templateOptionName } from "@render/templates";

function tmuxStyleToAnsi(text: string): string {
  return text
    .replace(/#\[fg=#([0-9a-f]{6})\]/gi, (_match, hex) => `\x1b[38;2;${Number.parseInt(hex.slice(0, 2), 16)};${Number.parseInt(hex.slice(2, 4), 16)};${Number.parseInt(hex.slice(4, 6), 16)}m`)
    .replace(/#\[default\]/g, "\x1b[0m");
}

/** Converts Pharos's existing ANSI-rich Mustache output into OpenTUI chunks.
 * Templates remain the content API; OpenTUI owns measurement and placement. */
function ansiToStyledText(text: string): StyledText {
  const chunks: TextChunk[] = [];
  const sgr = /\x1b\[([0-9;]*)m/g;
  let foreground: RGBA | undefined;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const append = (value: string) => {
    if (!value) return;
    chunks.push({ __isChunk: true, text: value, ...(foreground ? { fg: foreground } : {}) });
  };

  while ((match = sgr.exec(text))) {
    append(text.slice(cursor, match.index));
    cursor = sgr.lastIndex;
    const params = match[1]!.split(";").filter(Boolean).map(Number);
    if (params.length === 0 || params.includes(0) || params.includes(39)) foreground = undefined;
    for (let index = 0; index < params.length; index += 1) {
      if (params[index] === 38 && params[index + 1] === 2) {
        foreground = RGBA.fromInts(params[index + 2] ?? 0, params[index + 3] ?? 0, params[index + 4] ?? 0);
        index += 4;
      }
    }
  }
  append(text.slice(cursor));
  return new StyledText(chunks);
}

/** Renders an ANSI Mustache template inside an OpenTUI-owned tmux pane.
 * Flex-end alignment is cell-aware, so icons, gradients, and resizes need no
 * hand-counted padding. */
export async function renderOpenTuiPane(templateName: string, sourcePane: string): Promise<void> {
  if (!templateName || !sourcePane || !commandExists("tmux")) return;

  const renderer = await createCliRenderer({
    screenMode: "main-screen",
    clearOnShutdown: false,
    consoleMode: "disabled",
    exitSignals: [],
  });
  const option = templateOptionName(templateName);
  let previous = "";
  let card: BoxRenderable | undefined;
  const sectionColors = [undefined, "#e5c890", "#ca9ee6", "#99d1e9", "#81c8be"];

  const draw = (content: string, pulse: string) => {
    if (card) {
      renderer.root.remove(card);
      card.destroy();
    }
    card = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "column",
      alignItems: "flex-end",
      flexShrink: 0,
      gap: 1,
    });
    // The beacon is deliberately its own, centred header rather than another
    // right-aligned data row.  At a glance the flash signals live activity;
    // the lighthouse glyph remains recognisable when the flash is at rest.
    const beacon = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "column",
      alignItems: "center",
      gap: 0,
      height: pulse ? 2 : 1,
    });
    if (pulse) {
      beacon.add(new TextRenderable(renderer, {
        content: ansiToStyledText(pulse),
        flexShrink: 0,
        wrapMode: "none",
      }));
    }
    beacon.add(new TextRenderable(renderer, {
      content: ansiToStyledText("⛯"),
      flexShrink: 0,
      wrapMode: "none",
    }));
    card.add(beacon);

    const sections = content.split(/\n{2,}/).filter(Boolean);
    for (const [index, section] of sections.entries()) {
      const lines = section.split("\n");
      const row = new BoxRenderable(renderer, {
        width: "100%",
        height: lines.length,
        position: "relative",
      });
      const rows = new BoxRenderable(renderer, {
        width: "100%",
        flexDirection: "column",
        height: lines.length,
      });
      const railColor = sectionColors[index];
      for (const line of lines) {
        const lineBox = new BoxRenderable(renderer, {
          width: "100%",
          height: 1,
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingRight: railColor ? 2 : 0,
        });
        lineBox.add(new TextRenderable(renderer, {
          content: ansiToStyledText(line),
          flexShrink: 0,
          wrapMode: "none",
        }));
        rows.add(lineBox);
      }
      row.add(rows);
      if (railColor) {
        row.add(new BoxRenderable(renderer, {
          position: "absolute",
          right: 0,
          top: 0,
          width: 1,
          height: lines.length,
          backgroundColor: railColor,
        }));
      }
      card.add(row);
    }
    renderer.root.add(card);
  };

  const shutdown = () => renderer.destroy();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  try {
    while (true) {
      const template = runSync(["tmux", "show-options", "-p", "-v", "-t", sourcePane, option]).stdout.trimEnd();
      const pulse = runSync(["tmux", "display", "-p", "-t", sourcePane, "#{@pharos_side_frame1}"]).stdout.trimEnd();
      const content = tmuxStyleToAnsi(template);
      const beacon = tmuxStyleToAnsi(pulse);
      const frame = `${beacon}\u0000${content}`;
      if (frame !== previous) {
        draw(content, beacon);
        previous = frame;
      }
      await Bun.sleep(150);
    }
  } finally {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
    renderer.destroy();
  }
}
