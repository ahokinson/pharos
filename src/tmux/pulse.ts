import { buildTail } from "@color";
import type { Config } from "@config";
import { commandExists, runSync } from "@process";
import { isAnimatedState, PulseState } from "@tmux/states";
import type { AnimatedState } from "@tmux/states";

const SIDE_TRACK_WIDTH = 22;
const SIDE_PULSE_CYCLE = 36;

export interface ActivePane {
  id: string;
  index: number;
  state: AnimatedState;
}

function themeColor(name: string, fallback: string): string {
  return runSync(["tmux", "show", "-gv", name]).stdout.trim() || fallback;
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

/** A pane-sized lighthouse flash: the center blooms, leaves a short colored
 * halo, then fades to darkness for the turning interval. Unlike the status
 * track, it never becomes a solid horizontal meter. */
function sidePulseFrame(width: number, frameCount: number, tail: string[]): string {
  const age = frameCount % SIDE_PULSE_CYCLE;
  const strength = age < 5 ? 1 : age < 17 ? (17 - age) / 12 : 0;
  const center = Math.floor(width / 2);
  let frame = "";
  for (let cell = 0; cell < width; cell++) {
    const distance = Math.abs(cell - center);
    const brightness = strength - distance * 0.18;
    if (brightness <= 0) {
      frame += " ";
      continue;
    }
    const shade = brightness > 0.78 ? "█" : brightness > 0.52 ? "▓" : brightness > 0.28 ? "▒" : "░";
    const color = tail[Math.min(tail.length - 1, Math.max(0, Math.floor((1 - brightness) * tail.length)))];
    frame += `#[fg=${color}]${shade}`;
  }
  return `${frame}#[default]`;
}

// One ticker per tmux session scans active panes and updates the sidecard's
// beacon. The old bottom-status beam is deliberately gone: Pharos activity
// belongs to the contextual card, not the persistent tmux tab line.
export async function pulse(args: string[], config: Config): Promise<void> {
  const [sessionId, token] = args;
  if (!sessionId || !commandExists("tmux")) return;

  const { tail: tailLength, stepMs } = config.pulse;
  const { themeVars, fallbackColors } = config.pulse;
  const background = themeColor(themeVars.background, fallbackColors.background);
  const tails: Record<AnimatedState, string[]> = {
    [PulseState.Think]: buildTail(themeColor(themeVars.think, fallbackColors.think), background, tailLength),
    [PulseState.Tool]: buildTail(themeColor(themeVars.tool, fallbackColors.tool), background, tailLength),
    [PulseState.Ask]: buildTail(themeColor(themeVars.ask, fallbackColors.ask), background, tailLength),
  };

  let frameCount = 0;

  while (true) {
    const owner = runSync(["tmux", "show", "-v", "-t", sessionId, "@pharos_ticker"]).stdout.trim();
    if (owner !== token) break;

    const panes = activePanes(sessionId);
    if (panes.length === 0) break;
    const first = panes[0]!;
    runSync([
      "tmux", "set", "-t", sessionId, "@pharos_side_frame1", sidePulseFrame(SIDE_TRACK_WIDTH, frameCount, tails[first.state]), ";",
      "refresh-client", "-S",
    ]);

    frameCount += 1;
    await Bun.sleep(stepMs);
  }

  if (runSync(["tmux", "show", "-v", "-t", sessionId, "@pharos_ticker"]).stdout.trim() === token) {
    runSync(["tmux", "set", "-u", "-t", sessionId, "@pharos_ticker", ";", "set", "-u", "-t", sessionId, "@pharos_side_frame1", ";", "refresh-client", "-S"]);
  }
}
