export function miningStateFile(sessionId: string): string {
  return `${process.env.TMPDIR || "/tmp"}/pharos-statusline-${sessionId}.json`;
}
