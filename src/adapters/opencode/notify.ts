// opencode's bridge plugin (examples/opencode-bridge.ts) maps session.idle
// straight to `pharos tmux dispatch off`, so unlike Claude Code there is no
// conflated notification signal for pharos to disambiguate here — the
// "notify" dispatch state simply never fires for opencode.
export function isIdleNotification(_stdin: unknown): boolean {
  return false;
}
