import { buildTail } from "@color";
import type { Config } from "@config";
import { commandExists, runSync } from "@process";
import { isAnimatedState, PulseState } from "@tmux/states";
import type { AnimatedState } from "@tmux/states";

function themeColor(name: string, fallback: string): string {
  const value = runSync(["tmux", "show", "-gv", name]).stdout.trim();
  return value || fallback;
}

const DEFAULT_TRACK_WIDTH = 24;
const MIN_TRACK_WIDTH = 10;

// Track width = client width minus the tabs, so the pulse lands right after
// them. Each catppuccin tab renders " #I  #W " (index + name + 4 padding
// cells); the W: format iterates every window, so measuring it with a
// 4-char pad gives sum(4 + index + name). One tmux call fetches all three.
function measureWidth(sessionId: string, config: Config): number | null {
  const result = runSync([
    "tmux",
    "display",
    "-p",
    "-t",
    sessionId,
    "#{client_width}|#{session_windows}|#{W:xxxx#{window_index}#{window_name},xxxx#{window_index}#{window_name}}",
  ]);
  if (!result.ok) return null;
  const [clientWidthStr, windowCountStr, tabsText = ""] = result.stdout.trim().split("|");
  if (!clientWidthStr) return null;
  const clientWidth = Number(clientWidthStr);
  const windowCount = Number(windowCountStr) || 1;
  const width =
    clientWidth - config.pulse.statusLeft - tabsText.length - (windowCount - 1) - config.pulse.leadSpace - config.pulse.margin;
  return Math.max(MIN_TRACK_WIDTH, width);
}

// Renders the status-bar pulse: writes an animation frame to @claude_frame
// and asks tmux to redraw (tmux's own status-interval only ticks at 1s, too
// coarse to animate). Spawned once per session by dispatch() via
// `tmux run-shell -b`, so it runs under the tmux server, independent of
// Claude's process tree, and exits when @claude_pulse clears.
export async function pulse(args: string[], config: Config): Promise<void> {
  const [sessionId, token] = args;
  if (!sessionId) return;
  if (!commandExists("tmux")) return;

  const { tail: TAIL, stepMs: STEP_MS, sweep: SWEEP, gapFraction: GAP_FRACTION, remeasureEvery: REMEASURE_EVERY } = config.pulse;
  const { themeVars, fallbackColors } = config.pulse;

  const thinkColor = themeColor(themeVars.think, fallbackColors.think);
  const toolColor = themeColor(themeVars.tool, fallbackColors.tool);
  const askColor = themeColor(themeVars.ask, fallbackColors.ask);
  const backgroundColor = themeColor(themeVars.background, fallbackColors.background);

  const tails: Record<AnimatedState, string[]> = {
    [PulseState.Think]: buildTail(thinkColor, backgroundColor, TAIL),
    [PulseState.Tool]: buildTail(toolColor, backgroundColor, TAIL),
    [PulseState.Ask]: buildTail(askColor, backgroundColor, TAIL),
  };

  let width = measureWidth(sessionId, config) ?? DEFAULT_TRACK_WIDTH;
  let speed = Math.max(1, width / SWEEP);
  // A continuous cell offset advanced by `speed` each frame; no modulo wrap,
  // so the tail never reappears on the left as the head exits right. It
  // climbs past the right edge and through a blank gap before resetting.
  let headPosition = 0;
  let frameCount = 0;

  while (true) {
    // One call reads the state and the current owner token. Exit if the
    // turn ended (empty state) or a newer ticker took ownership (token
    // changed) - the latter stops duplicates fighting over @claude_frame.
    const result = runSync(["tmux", "display", "-p", "-t", sessionId, "#{@claude_pulse}|#{@claude_ticker}"]);
    if (!result.ok) break;
    const [state, owner] = result.stdout.trim().split("|");
    if (!state) break;
    if (owner !== token) break;

    const tail = isAnimatedState(state) ? tails[state] : tails[PulseState.Think];

    if (frameCount % REMEASURE_EVERY === 0) {
      width = measureWidth(sessionId, config) ?? width;
      speed = Math.max(1, width / SWEEP);
    }
    const head = Math.floor(headPosition);

    let frame = "";
    for (let cell = 0; cell < width; cell++) {
      const distance = head - cell;
      if (distance >= 0 && distance < TAIL) {
        frame += `#[fg=${tail[distance]}]█`;
      } else {
        frame += " ";
      }
    }
    frame += "#[default]";

    runSync(["tmux", "set", "-t", sessionId, "@claude_frame", frame, ";", "refresh-client", "-S"]);

    headPosition += speed;
    const resetAt = width + TAIL + width * GAP_FRACTION;
    if (headPosition >= resetAt) headPosition = 0;
    frameCount += 1;
    await Bun.sleep(STEP_MS);
  }

  // Only clear shared state if we still own it; a newer ticker may have
  // taken over.
  const currentOwner = runSync(["tmux", "show", "-v", "-t", sessionId, "@claude_ticker"]).stdout.trim();
  if (currentOwner === token) {
    runSync(["tmux", "set", "-u", "-t", sessionId, "@claude_ticker"]);
    runSync(["tmux", "set", "-u", "-t", sessionId, "@claude_frame"]);
    runSync(["tmux", "refresh-client", "-S"]);
  }
}
