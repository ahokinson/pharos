// The states dispatch() writes to the @claude_pulse tmux option and
// pulse() reads back every animation frame. think/tool/ask animate a tail;
// off clears it.
export enum PulseState {
  Think = "think",
  Tool = "tool",
  Ask = "ask",
  Off = "off",
}

export type AnimatedState = Exclude<PulseState, PulseState.Off>;

/** True when `value` is one of the three animatable states, narrowing it
 * for tails lookups; anything else (including Off) fails over to Think's
 * tail shape by the caller. */
export function isAnimatedState(value: string): value is AnimatedState {
  return value === PulseState.Think || value === PulseState.Tool || value === PulseState.Ask;
}
