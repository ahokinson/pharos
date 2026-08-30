export function miningStateFile(sessionId: string): string {
  return `${process.env.TMPDIR || "/tmp"}/pharos-statusline-${sessionId}.json`;
}

/** BSON, not JSON: this file is written by a separate process (`pharos
 * statusline scrape`) from a separate source (the host's `statusLine`
 * invocation, not hooks/transcript mining) on its own cadence — a distinct
 * extension, not a rename of the mining checkpoint above. */
export function externalStateFile(sessionId: string): string {
  return `${process.env.TMPDIR || "/tmp"}/pharos-statusline-external-${sessionId}.bson`;
}
