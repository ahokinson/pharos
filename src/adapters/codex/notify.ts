// UNVERIFIED / known gap: Codex's documented hook set (SessionStart,
// SessionEnd, PreToolUse, PostToolUse, PermissionRequest, UserPromptSubmit,
// Stop, PreCompact/PostCompact, SubagentStart/SubagentStop) has no
// confirmed Notification-equivalent hook the way Claude Code does, so
// there's no known signal to check here yet. If an interrupt with no
// matching hook leaves a pulse stuck for Codex the way it would for Claude
// Code without the idle_prompt notification, that's this gap, not a bug —
// revisit once/if Codex ships (or is confirmed to already have) an
// equivalent hook.
export function isIdleNotification(_stdin: unknown): boolean {
  return false;
}
