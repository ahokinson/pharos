// dispatch() writes these states to a pane's @pharos_pulse option and the
// session ticker reads them every animation frame. think/tool/ask animate a
// tail; off clears that pane's activity.
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
