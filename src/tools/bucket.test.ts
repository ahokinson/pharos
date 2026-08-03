import { describe, expect, test } from "bun:test";
import { bucketToolCounts } from "@tools/bucket";

describe("bucketToolCounts", () => {
  test("folds tool names into their fixed categories", () => {
    const bucket = bucketToolCounts({ Edit: 2, Write: 1, Read: 3, Bash: 1, Grep: 1, Task: 1, SomethingElse: 5 });
    expect(bucket.edits).toBe(3);
    expect(bucket.reads).toBe(3);
    expect(bucket.runs).toBe(1);
    expect(bucket.searches).toBe(1);
    expect(bucket.agents).toBe(1);
    expect(bucket.other).toBe(5);
    expect(bucket.web).toBeUndefined();
  });
});
