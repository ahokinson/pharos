// pharos's opencode-side bridge — the "bridge" in TmuxStatusSupport
// .BridgeRequired (see src/adapters/types.ts). opencode exposes in-process
// plugin events rather than process-spawned hook commands, so this plugin
// listens for those events and shells out to pharos's tmux entry points:
//
//   a tool part starts running   -> pharos tmux dispatch tool
//                                   (ask, for the question tool)
//   text/reasoning/step-start    -> pharos tmux dispatch think
//   session.idle                 -> pharos tmux dispatch off, then one
//                                   final pharos tmux render
//   session.updated (throttled)  -> pharos tmux render
//
// Wiring: copy this file to ~/.config/opencode/plugins/pharos-bridge.ts (or
// a project's .opencode/plugins/), make sure `pharos` is on PATH, restart
// opencode, and run `pharos tmux init`. The bridge's hook processes mark
// their own pane, so pharos shows fields only when that AI pane is selected.
//
// Event payload shapes below are verified against a real opencode 1.18.21
// event log; the `event` hook and `$` shell are opencode's documented
// plugin API (opencode.ai/docs/plugins). Everything fails open: a bridge
// failure must never break the opencode session it lives in.
//
// No imports: this file runs inside opencode's own plugin loader, not
// pharos's build, so it duck-types everything it touches.

const RENDER_INTERVAL_MS = 5000;

type PulseState = "think" | "tool" | "ask" | "off";

interface PartEventProperties {
  sessionID?: string;
  part?: {
    type?: string;
    tool?: string;
    state?: { status?: string };
  };
}

interface BusEvent {
  type?: string;
  properties?: unknown;
}

function propertiesOf(event: BusEvent): PartEventProperties {
  return (event.properties as PartEventProperties | undefined) ?? {};
}

/** Maps one opencode bus event onto the pulse state pharos should show, or
 * null when the event shouldn't touch the pulse. Exported for testing. */
export function pulseStateFor(event: BusEvent): PulseState | null {
  if (event.type === "session.idle") return "off";
  if (event.type !== "message.part.updated") return null;
  const part = propertiesOf(event).part;
  if (!part) return null;
  if (part.type === "tool") {
    if (part.state?.status !== "running") return null;
    return part.tool === "question" ? "ask" : "tool";
  }
  // text, reasoning, and step-start parts all mean the model itself is
  // generating; step-finish means a tool call is about to start, which the
  // next tool event reports on its own.
  if (part.type === "text" || part.type === "reasoning" || part.type === "step-start") return "think";
  return null;
}

// Duck-typed slice of Bun's `$`: a tagged-template command runner. opencode
// injects the real one via the plugin context.
type Shell = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

export const PharosBridge = async ({ $ }: { $: Shell }) => {
  // The pulse is one tmux user option shared by whatever runs in this tmux
  // session, so the bridge spawns pharos only on state transitions rather
  // than on every part update (those fire dozens of times per second while
  // a message streams).
  let lastState: PulseState | null = null;
  let lastRender = 0;

  const dispatch = async (state: PulseState): Promise<void> => {
    if (state === lastState) return;
    lastState = state;
    try {
      await $`pharos tmux dispatch ${state} --tool=opencode`;
    } catch {
      // fail open
    }
  };

  const render = async (sessionId: string): Promise<void> => {
    const now = Date.now();
    if (now - lastRender < RENDER_INTERVAL_MS) return;
    lastRender = now;
    try {
      // context_window_size is optional (pharos defaults to 200k); add it
      // here if your model's window differs and you want exact percentages.
      const payload = JSON.stringify({ session_id: sessionId });
      await $`echo ${payload} | pharos tmux render --tool=opencode`;
    } catch {
      // fail open
    }
  };

  return {
    event: async ({ event }: { event: BusEvent }) => {
      if (event.type === "session.idle") {
        await dispatch("off");
        lastRender = 0;
        const sessionId = propertiesOf(event).sessionID;
        if (sessionId) await render(sessionId);
        return;
      }

      const state = pulseStateFor(event);
      if (state) await dispatch(state);

      if (event.type === "session.updated") {
        const sessionId = propertiesOf(event).sessionID;
        if (sessionId) await render(sessionId);
      }
    },
  };
};
