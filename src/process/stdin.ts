/** Reads all of stdin and parses it as JSON, failing open to `fallback`
 * on empty or malformed input: the statusline/hook entrypoints must never
 * die on a bad payload. */
export async function readStdinJson(fallback: unknown = {}): Promise<unknown> {
  try {
    return JSON.parse(await Bun.stdin.text());
  } catch {
    return fallback;
  }
}
