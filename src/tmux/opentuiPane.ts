import { BoxRenderable, createCliRenderer, RGBA, StyledText, TextRenderable } from "@opentui/core";
import type { TextChunk } from "@opentui/core";

import { DEFAULT_HEX } from "@color";
import { commandExists, runSync } from "@process";
import { templateOptionName } from "@render/templates";
import { restFrame } from "@tmux/pulse";

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
  let beaconPulse: TextRenderable | undefined;
  // One entry per rendered line: the value node always exists, the label
  // node only for a tabbed (label/value) line. Kept so later polls can push
  // new text into place instead of rebuilding — see updateCard below.
  let lineNodes: { tab: boolean; label?: TextRenderable; value: TextRenderable }[][] = [];

  const parseSections = (content: string) => content.split(/\n{2,}/).filter(Boolean).map((section) => section.split("\n"));

  // Fixed-shape sections (the template supplies a filler value for any
  // field it doesn't have data for) mean a divider's position never moves
  // as data comes and goes — and, in turn, that the tree built below has the
  // same number of sections and lines for the life of one config. True only
  // while the config is: this still matches lineNodes shape-for-shape after
  // any edit that doesn't touch template structure.
  const shapeMatches = (sections: string[][]) =>
    sections.length === lineNodes.length &&
    sections.every((lines, index) => {
      const cached = lineNodes[index]!;
      return lines.length === cached.length && lines.every((line, lineIndex) => (line.indexOf("\t") !== -1) === cached[lineIndex]!.tab);
    });

  // Builds the whole panel from scratch: the border, the beacon, and one
  // BoxRenderable per section/line/label/value, recording each text node so
  // updateCard can find it again. Runs once per shape (normally just once,
  // ever, for a session) rather than on every poll — see updateCard.
  const buildCard = (sections: string[][], pulse: string) => {
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
    // right-aligned data row. The lighthouse icon lives inside the pulse
    // frame itself now (see pulse.ts's restFrame/sidePulseFrame) — lit at
    // rest and flashing through as the beam crosses its column, rather than
    // sitting underneath as a second, permanently-visible row. That merge
    // ate the blank row that used to separate the icon from the title below
    // it, so marginBottom puts it back explicitly instead of leaving the two
    // touching.
    const beacon = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "column",
      alignItems: "center",
      gap: 0,
      height: 1,
      marginBottom: 1,
    });
    const pulseNode = new TextRenderable(renderer, {
      content: ansiToStyledText(pulse || restFrame()),
      flexShrink: 0,
      wrapMode: "none",
    });
    beacon.add(pulseNode);
    panelCard.add(beacon);
    beaconPulse = pulseNode;

    lineNodes = sections.map((lines, index) => {
      // Between sections, not before the first: a leading band read as a
      // stray bar hanging off the beacon rather than as a separator. The
      // beacon's own marginBottom already buys the header its breathing
      // room, so nothing else sits between it and the first section.
      if (index > 0) panelCard.add(divider());
      const panel = new BoxRenderable(renderer, { width: "100%", flexDirection: "column" });
      const nodes = lines.map((line) => {
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
          const value = new TextRenderable(renderer, { content: ansiToStyledText(line), flexShrink: 0, wrapMode: "none" });
          lineBox.add(value);
          panel.add(lineBox);
          return { tab: false, value };
        }
        const label = new TextRenderable(renderer, {
          content: ansiToStyledText(line.slice(0, tab)),
          fg: RGBA.fromHex(DEFAULT_HEX.overlay1),
          flexShrink: 0,
          wrapMode: "none",
        });
        const value = new TextRenderable(renderer, { content: ansiToStyledText(line.slice(tab + 1)), flexShrink: 0, wrapMode: "none" });
        lineBox.add(label);
        lineBox.add(value);
        panel.add(lineBox);
        return { tab: true, label, value };
      });
      panelCard.add(panel);
      return nodes;
    });
    card = panelCard;
    renderer.root.add(panelCard);
  };

  // The steady-state path: labels are literal template text and never
  // change, so only each value node's content (and the beacon's pulse) needs
  // pushing in — no BoxRenderable is torn down or recreated. That matters
  // because the renderer paints on its own timer (see CliRenderer's
  // targetFps), independent of this loop: removing the old tree and adding a
  // new one is two separate mutations with a gap between them a frame can
  // land in, which is what the flicker was — mutating text in place has no
  // such gap.
  const updateCard = (sections: string[][], pulse: string) => {
    if (beaconPulse) beaconPulse.content = ansiToStyledText(pulse || restFrame());
    sections.forEach((lines, index) => {
      const nodes = lineNodes[index]!;
      lines.forEach((line, lineIndex) => {
        const node = nodes[lineIndex]!;
        if (!node.tab) {
          node.value.content = ansiToStyledText(line);
          return;
        }
        const tab = line.indexOf("\t");
        node.value.content = ansiToStyledText(line.slice(tab + 1));
      });
    });
  };

  const draw = (content: string, pulse: string) => {
    const sections = parseSections(content);
    if (card && shapeMatches(sections)) {
      updateCard(sections, pulse);
    } else {
      buildCard(sections, pulse);
    }
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
