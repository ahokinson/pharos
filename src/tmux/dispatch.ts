import { resolveAdapter } from "@adapters/registry";
import type { Config } from "@config";
import { commandExists, readStdinJson, runSync, shQuote } from "@process";
import { PulseState } from "@tmux/states";

// Sets the hook-emitting pane's @pharos_pulse flag that drives the tmux
// status-bar animation, from a host's own hook events. States:
//   think|tool|ask - a turn is active (thinking / running a tool / holding
//                    on an AskUserQuestion, which stays until PostToolUse
//                    fires): pulse.
//   off            - turn or session ended: stop the pulse.
//   notify         - a Notification fired; stop only on the host's idle
//                    signal. Interrupts (Esc) fire no hook at all, so the
//                    pulse would stay stuck; that idle signal is the one
//                    that lets us clear it afterwards (see adapter's
//                    isIdleNotification).
// Fails open throughout: any error here should never break a hook.
export async function dispatch(args: string[], config: Config): Promise<void> {
  try {
    if (!process.env.TMUX || !process.env.TMUX_PANE) return;
    if (!commandExists("tmux")) return;

    let state = args[0] ?? "";
    if (!state) return;

    if (state === "notify") {
      const parsed = await readStdinJson(undefined);
      if (resolveAdapter(config).isIdleNotification(parsed)) state = PulseState.Off;
      else return;
    }

    const paneId = process.env.TMUX_PANE;
    const sessionId = runSync(["tmux", "display", "-p", "-t", paneId, "#{session_id}"]).stdout.trim();
    if (!sessionId) return;

    switch (state) {
      case PulseState.Think:
      case PulseState.Tool:
      case PulseState.Ask: {
        runSync(["tmux", "set", "-p", "-t", paneId, "@pharos_pulse", state]);
        // Spawn the session animator if none is running. @pharos_ticker holds a
        // unique token so the ticker is single-owner: if a race or reload
        // starts another, the older one sees the token change and exits
        // itself. run-shell -b puts it under the tmux server, not this
        // process tree.
        const tickerRunning = runSync(["tmux", "show", "-v", "-t", sessionId, "@pharos_ticker"]).stdout.trim();
        if (!tickerRunning) {
          const token = `${process.pid}${Math.floor(Math.random() * 100000)}`;
          runSync(["tmux", "set", "-t", sessionId, "@pharos_ticker", token]);
          const cmd = `${shQuote(process.execPath)} tmux pulse ${shQuote(sessionId)} ${shQuote(token)}`;
          runSync(["tmux", "run-shell", "-b", cmd]);
        }
        break;
      }
      case PulseState.Off:
        runSync(["tmux", "set", "-u", "-p", "-t", paneId, "@pharos_pulse"]);
        break;
      default:
        return;
    }

    runSync(["tmux", "refresh-client", "-S"]);
  } catch {
    // fail open
  }
}
