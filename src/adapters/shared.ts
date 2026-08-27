import type { ZodType } from "zod";

// split(...).length - 1 == complete (newline-terminated) line count,
// regardless of whether the file ends with a trailing newline: the last
// split element is either "" (after a trailing \n) or a still-being-written
// partial line, and either way isn't a complete line yet.
export function completeLineCount(lines: string[]): number {
  return lines.length - 1;
}

/** Reads the transcript at `path` and returns its complete lines past
 * `alreadyRead`, plus the complete-line count to persist afterwards.
 * Unreadable file fails open: no lines, count unchanged. */
export async function readNewLines(path: string, alreadyRead: number): Promise<{ lines: string[]; count: number }> {
  let text = "";
  try {
    text = await Bun.file(path).text();
  } catch {
    return { lines: [], count: alreadyRead };
  }
  const lines = text.split("\n");
  const count = completeLineCount(lines);
  return { lines: lines.slice(alreadyRead, count), count };
}

/** Parses one JSONL line against `schema`; undefined for non-JSON or
 * shape-mismatched lines (fail open: skip the line, never the render). */
export function parseJsonLine<T>(line: string, schema: ZodType<T>): T | undefined {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return undefined;
  }
  const result = schema.safeParse(json);
  return result.success ? result.data : undefined;
}

export function capSamples(samples: number[], cap: number): number[] {
  return samples.length > cap ? samples.slice(-cap) : samples;
}
