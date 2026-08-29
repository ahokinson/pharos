import { buildTail } from "@color";
import type { Config } from "@config";
import { commandExists, runSync } from "@process";
import { isAnimatedState, PulseState } from "@tmux/states";
import type { AnimatedState } from "@tmux/states";

const DEFAULT_TRACK_WIDTH = 24;
const MIN_TRACK_WIDTH = 10;
const MAX_LANES = 2;

export interface ActivePane {
  id: string;
  index: number;
  state: AnimatedState;
}

function themeColor(name: string, fallback: string): string {
  return runSync(["tmux", "show", "-gv", name]).stdout.trim() || fallback;
}

// Track width = client width minus the tabs, so lane one lands after them.
function measureWidth(sessionId: string, config: Config): number | null {
  const result = runSync([
    "tmux", "display", "-p", "-t", sessionId,
    "#{client_width}|#{session_windows}|#{W:xxxx#{window_index}#{window_name},xxxx#{window_index}#{window_name}}",
  ]);
  if (!result.ok) return null;
  const [clientWidthStr, windowCountStr, tabsText = ""] = result.stdout.trim().split("|");
  if (!clientWidthStr) return null;
  const clientWidth = Number(clientWidthStr);
  const windowCount = Number(windowCountStr) || 1;
  return Math.max(MIN_TRACK_WIDTH, clientWidth - config.pulse.statusLeft - tabsText.length - (windowCount - 1) - config.pulse.leadSpace - config.pulse.margin);
}

/** Parses tmux's pane/state listing and keeps only active pharos panes, in
 * stable visual order. Exported so the scheduling policy is unit-testable. */
export function activePanesFrom(output: string): ActivePane[] {
  return output.trim().split("\n").flatMap((line) => {
    const [id, indexText, state] = line.split("|");
    if (!id || !state || !isAnimatedState(state)) return [];
    return [{ id, index: Number(indexText) || 0, state }];
  }).sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
}

function activePanes(sessionId: string): ActivePane[] {
  const result = runSync(["tmux", "list-panes", "-t", sessionId, "-F", "#{pane_id}|#{pane_index}|#{@pharos_pulse}"]);
  return result.ok ? activePanesFrom(result.stdout) : [];
}

function frameFor(width: number, head: number, tail: string[], overflow: number): string {
  let frame = "";
  for (let cell = 0; cell < width; cell++) {
    const distance = head - cell;
    frame += distance >= 0 && distance < tail.length ? `#[fg=${tail[distance]}]█` : " ";
  }
  if (overflow > 0) frame += `#[default] +${overflow}`;
  return `${frame}#[default]`;
}

// One ticker per tmux session scans its panes every frame and draws up to
// two independent lighthouse lanes. Activity is global; detailed rows are
// pane-local and handled by render.ts.
export async function pulse(args: string[], config: Config): Promise<void> {
  const [sessionId, token] = args;
  if (!sessionId || !commandExists("tmux")) return;

  const { tail: tailLength, stepMs, sweep, gapFraction, remeasureEvery } = config.pulse;
  const { themeVars, fallbackColors } = config.pulse;
  const background = themeColor(themeVars.background, fallbackColors.background);
  const tails: Record<AnimatedState, string[]> = {
    [PulseState.Think]: buildTail(themeColor(themeVars.think, fallbackColors.think), background, tailLength),
    [PulseState.Tool]: buildTail(themeColor(themeVars.tool, fallbackColors.tool), background, tailLength),
    [PulseState.Ask]: buildTail(themeColor(themeVars.ask, fallbackColors.ask), background, tailLength),
  };

  let width = measureWidth(sessionId, config) ?? DEFAULT_TRACK_WIDTH;
  let speed = Math.max(1, width / sweep);
  let headPosition = 0;
  let frameCount = 0;

  while (true) {
    const owner = runSync(["tmux", "show", "-v", "-t", sessionId, "@pharos_ticker"]).stdout.trim();
    if (owner !== token) break;

    const panes = activePanes(sessionId);
    if (panes.length === 0) break;
    if (frameCount % remeasureEvery === 0) {
      width = measureWidth(sessionId, config) ?? width;
      speed = Math.max(1, width / sweep);
    }

    const head = Math.floor(headPosition);
    const first = panes[0]!;
    const second = panes[1];
    const overflow = Math.max(0, panes.length - MAX_LANES);
    runSync([
      "tmux", "set", "-t", sessionId, "@pharos_frame1", frameFor(width, head, tails[first.state], 0), ";",
      "set", "-t", sessionId, "@pharos_frame2", second ? frameFor(width, head + Math.floor(width / 2), tails[second.state], overflow) : "", ";",
      "refresh-client", "-S",
    ]);

    headPosition += speed;
    if (headPosition >= width + tailLength + width * gapFraction) headPosition = 0;
    frameCount += 1;
    await Bun.sleep(stepMs);
  }

  if (runSync(["tmux", "show", "-v", "-t", sessionId, "@pharos_ticker"]).stdout.trim() === token) {
    runSync(["tmux", "set", "-u", "-t", sessionId, "@pharos_ticker", ";", "set", "-u", "-t", sessionId, "@pharos_frame1", ";", "set", "-u", "-t", sessionId, "@pharos_frame2", ";", "refresh-client", "-S"]);
  }
}
