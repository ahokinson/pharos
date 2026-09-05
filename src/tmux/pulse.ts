import { buildTail } from "@color";
import type { Config } from "@config";
import { commandExists, runSync } from "@process";
import { isAnimatedState, PulseState } from "@tmux/states";
import type { AnimatedState } from "@tmux/states";

// Odd so the track has one true center column — where the lighthouse icon
// lives (see restFrame/sidePulseFrame below) rather than straddling two.
const SIDE_TRACK_WIDTH = 21;
const SIDE_CENTER_INDEX = (SIDE_TRACK_WIDTH - 1) / 2;
const SIDE_PULSE_CYCLE = 36;
const SIDE_SWEEP_FRAMES = 26;
const SIDE_HEAD_SIGMA = 1.6;
const SIDE_TAIL_FALLOFF = 0.3;
// How close the head has to be to the center column for the icon to flash
// through it mid-sweep, rather than being drawn over. SIDE_SWEEP_FRAMES is
// even, so t=0.5 (head exactly on center) always lands on a real frame; this
// just guards against that no longer being exact if the constants above
// change later.
const SIDE_CENTER_EPSILON = 0.5;
const BEACON_ICON = "⛯";

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

export interface SweepState {
  /** The beam head's fractional column along the track this frame. */
  head: number;
  /** Pass brightness, 0 at both edges of the sweep and 1 at mid-pass. */
  strength: number;
}

/** Where the lighthouse beam is at `frameCount`: the head's position on the
 * track plus the pass brightness, or null for the dark rotation gap.
 * Exported so the sweep timing stays unit-testable. */
export function sweepState(frameCount: number, width: number): SweepState | null {
  const age = frameCount % SIDE_PULSE_CYCLE;
  if (age >= SIDE_SWEEP_FRAMES) return null;
  const t = age / SIDE_SWEEP_FRAMES;
  return {
    head: t * (width - 1),
    strength: 0.5 - 0.5 * Math.cos(2 * Math.PI * t),
  };
}

/** Brightness -> glyph. Below the solid block tiers, brightness keeps
 * fading through Braille dot-glyphs of shrinking dot count rather than
 * jumping straight from the lightest block to blank — a shorter mark reads
 * as weaker the same way a quieter sound reads as farther away. Exported so
 * every tier's boundary is unit-testable on its own. */
export function glyphForBrightness(brightness: number): string {
  if (brightness > 0.78) return "█";
  if (brightness > 0.52) return "▓";
  if (brightness > 0.28) return "▒";
  if (brightness > 0.14) return "░";
  if (brightness > 0.09) return "⠶"; // four dots
  if (brightness > 0.045) return "⠒"; // two dots
  if (brightness > 0) return "⠂"; // one dot
  return " ";
}

/** The beacon at rest: the lighthouse glyph on its own center column, blank
 * either side. Used both for the dark rotation gap between sweeps and as the
 * idle default a pane shows before any pulse has ever run for it — the same
 * state either way, so it's the same frame. */
export function restFrame(): string {
  const left = " ".repeat(SIDE_CENTER_INDEX);
  const right = " ".repeat(SIDE_TRACK_WIDTH - SIDE_CENTER_INDEX - 1);
  return `${left}${BEACON_ICON}${right}#[default]`;
}

/** The rotating lighthouse beam as the sidecard shows it: a bright head
 * crosses the track with a dimming comet tail dragging behind it, then the
 * dark rotation gap before the next pass. The raised-cosine pass envelope
 * runs to zero at both edges — and, since the head's position and that
 * envelope are both driven by the same fraction of the sweep, peaks exactly
 * when the head crosses the track's center column — so the beam is
 * brightest passing the middle and fades toward either edge like a beam
 * actually would, with no separate distance-from-center weighting needed.
 * The lighthouse icon itself lives in that same center column: dark outside
 * the brief pass over it, otherwise a separate always-on row would be lit
 * "the whole time" rather than only when the beam is actually there. */
function sidePulseFrame(width: number, frameCount: number, tail: string[]): string {
  const sweep = sweepState(frameCount, width);
  if (!sweep) return restFrame();
  const { head, strength } = sweep;
  const centerIndex = (width - 1) / 2;
  const beamOnCenter = Math.abs(head - centerIndex) < SIDE_CENTER_EPSILON;
  let frame = "";
  for (let cell = 0; cell < width; cell++) {
    if (beamOnCenter && cell === Math.round(centerIndex)) {
      frame += `#[default]${BEACON_ICON}`;
      continue;
    }
    const behind = head - cell;
    const brightness = behind < 0
      ? strength * Math.exp(-(behind * behind) / (2 * SIDE_HEAD_SIGMA * SIDE_HEAD_SIGMA))
      : strength * Math.exp(-behind * SIDE_TAIL_FALLOFF);
    const shade = glyphForBrightness(brightness);
    if (shade === " ") {
      frame += " ";
      continue;
    }
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
