import { commandExists, runSync, shQuote } from "@process";

// Sets the @claude_pulse flag that drives the tmux pulse status-bar
// animation, from Claude Code hook events. States:
//   think|tool|ask - a turn is active (thinking / running a tool / holding
//                    on an AskUserQuestion, which stays until PostToolUse
//                    fires): pulse.
//   off            - turn or session ended: stop the pulse.
//   notify         - a Notification fired; stop only on idle_prompt.
//                    Interrupts (Esc) fire no hook at all, so the pulse
//                    would stay stuck; idle_prompt is the one signal that
//                    lets us clear it afterwards.
// Fails open throughout: any error here should never break a hook.
export async function dispatch(args: string[]): Promise<void> {
  try {
    if (!process.env.TMUX || !process.env.TMUX_PANE) return;
    if (!commandExists("tmux")) return;

    let state = args[0] ?? "";
    if (!state) return;

    if (state === "notify") {
      const input = await Bun.stdin.text();
      let notificationType = "";
      try {
        notificationType = JSON.parse(input)?.notification_type ?? "";
      } catch {}
      if (notificationType === "idle_prompt") state = "off";
      else return;
    }

    const sessionId = runSync(["tmux", "display", "-p", "-t", process.env.TMUX_PANE, "#{session_id}"]).stdout.trim();
    if (!sessionId) return;

    switch (state) {
      case "think":
      case "tool":
      case "ask": {
        runSync(["tmux", "set", "-t", sessionId, "@claude_pulse", state]);
        // Spawn the animator if none is running. @claude_ticker holds a
        // unique token so the ticker is single-owner: if a race or reload
        // starts another, the older one sees the token change and exits
        // itself. run-shell -b puts it under the tmux server, not this
        // process tree.
        const tickerRunning = runSync(["tmux", "show", "-v", "-t", sessionId, "@claude_ticker"]).stdout.trim();
        if (!tickerRunning) {
          const token = `${process.pid}${Math.floor(Math.random() * 100000)}`;
          runSync(["tmux", "set", "-t", sessionId, "@claude_ticker", token]);
          const cmd = `${shQuote(process.execPath)} tmux pulse ${shQuote(sessionId)} ${shQuote(token)}`;
          runSync(["tmux", "run-shell", "-b", cmd]);
        }
        break;
      }
      case "off":
        runSync(["tmux", "set", "-u", "-t", sessionId, "@claude_pulse"]);
        break;
      default:
        return;
    }

    runSync(["tmux", "refresh-client", "-S"]);
  } catch {
    // fail open
  }
}
