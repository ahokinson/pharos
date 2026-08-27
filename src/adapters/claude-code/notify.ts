// Claude Code's Notification hook fires for several reasons; the only one
// that should clear a stuck pulse is idle_prompt (see tmux/dispatch.ts).
// Interrupts (Esc) fire no hook at all, so idle_prompt is the one signal
// that lets the pulse recover afterwards.
export function isIdleNotification(stdin: unknown): boolean {
  return (stdin as { notification_type?: string } | null)?.notification_type === "idle_prompt";
}
