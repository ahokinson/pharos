import { describe, expect, test } from "bun:test";
import { bucketFor } from "@adapters/opencode/bucket";
import { bucketToolCounts } from "@tools/bucket";

describe("bucketToolCounts (opencode vocabulary)", () => {
  test("folds tool names into their fixed categories", () => {
    const bucket = bucketToolCounts(
      { edit: 2, write: 1, read: 3, bash: 1, grep: 1, glob: 2, task: 1, webfetch: 2, websearch: 1, todowrite: 4 },
      bucketFor,
    );
    expect(bucket.edits).toBe(3);
    expect(bucket.reads).toBe(3);
    expect(bucket.runs).toBe(1);
    expect(bucket.searches).toBe(3);
    expect(bucket.agents).toBe(1);
    expect(bucket.web).toBe(3);
  });

  test("unknown tool names fall to other, not off the histogram", () => {
    const bucket = bucketToolCounts({ someMcpTool: 2 }, bucketFor);
    expect(bucket.other).toBe(2);
  });
});
