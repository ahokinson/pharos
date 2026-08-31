import { BoxRenderable, createCliRenderer, RGBA, StyledText, TextRenderable } from "@opentui/core";
import type { TextChunk } from "@opentui/core";

import { DEFAULT_HEX } from "@color";
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
 * Alignment is cell-aware, so icons, gradients, and resizes need no
 * hand-counted padding — and metric text must reach here unpadded, which is
 * why column widths are applied in render/compute rather than upstream of
 * both surfaces. */
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

  const draw = (content: string, pulse: string) => {
    if (card) {
      renderer.root.remove(card);
      card.destroy();
    }
    // Modeled on press's Box/Header: one rounded frame in a single muted
    // border tone (Catppuccin surface2), not a rainbow rail or box per
    // section — accent color belongs on focus/text, not the frame. Groups
    // are separated by a blank backgroundChrome strip (press's Header with
    // neither slot filled), the same device press uses for a labelless
    // divider row, so the card reads as one panel throughout.
    const panelCard = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "column",
      flexShrink: 0,
      border: true,
      borderStyle: "rounded",
      borderColor: DEFAULT_HEX.surface2,
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
    });
    const divider = () => new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      backgroundColor: DEFAULT_HEX.mantle,
    });
    // The beacon is deliberately its own, centred header rather than another
    // right-aligned data row.  At a glance the flash signals live activity;
    // the lighthouse glyph remains recognisable when the flash is at rest.
    // The flash row is reserved whether or not it's lit: a beacon that
    // changed height at rest would shove the whole card up a line every time
    // a turn ended.
    const beacon = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "column",
      alignItems: "center",
      gap: 0,
      height: 2,
      // The first section's own divider used to sit flush against the
      // glyph. Dividers now separate sections only, so the beacon buys its
      // own breathing room here instead of borrowing a band's.
      marginBottom: 1,
    });
    beacon.add(new TextRenderable(renderer, {
      // An empty StyledText carries no chunks and measures as nothing; a
      // space keeps the reserved row a row.
      content: ansiToStyledText(pulse || " "),
      flexShrink: 0,
      wrapMode: "none",
    }));
    beacon.add(new TextRenderable(renderer, {
      content: ansiToStyledText("⛯"),
      flexShrink: 0,
      wrapMode: "none",
    }));
    panelCard.add(beacon);

    // Fixed-shape sections (the template supplies a filler value for any
    // field it doesn't have data for) mean a divider's position never moves
    // as data comes and goes.
    const sections = content.split(/\n{2,}/).filter(Boolean);
    sections.forEach((section, index) => {
      // Between sections, not before the first: a leading band read as a
      // stray bar hanging off the beacon rather than as a separator.
      if (index > 0) panelCard.add(divider());
      const lines = section.split("\n");
      const panel = new BoxRenderable(renderer, { width: "100%", flexDirection: "column" });
      for (const line of lines) {
        // A tab splits a line into a label/value pair — a real two-column
        // row instead of one opaque right-justified blob, so a filler
        // dash reads as "this field, no data" rather than a stray mark
        // floating with nothing to anchor it. A line with no tab (the
        // harness/profile header) stays a single flush-right block.
        const tab = line.indexOf("\t");
        const lineBox = new BoxRenderable(renderer, {
          width: "100%",
          height: 1,
          flexDirection: "row",
          justifyContent: tab === -1 ? "flex-end" : "space-between",
          // space-between alone lets a label and a wide value touch, which
          // reads as one run-on string. A gap is the floor between them;
          // values are kept short at the source (see render/compute) rather
          // than truncated here.
          gap: 2,
        });
        if (tab === -1) {
          lineBox.add(new TextRenderable(renderer, {
            content: ansiToStyledText(line),
            flexShrink: 0,
            wrapMode: "none",
          }));
        } else {
          lineBox.add(new TextRenderable(renderer, {
            content: ansiToStyledText(line.slice(0, tab)),
            fg: RGBA.fromHex(DEFAULT_HEX.overlay1),
            flexShrink: 0,
            wrapMode: "none",
          }));
          lineBox.add(new TextRenderable(renderer, {
            content: ansiToStyledText(line.slice(tab + 1)),
            flexShrink: 0,
            wrapMode: "none",
          }));
        }
        panel.add(lineBox);
      }
      panelCard.add(panel);
    });
    card = panelCard;
    renderer.root.add(panelCard);
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
