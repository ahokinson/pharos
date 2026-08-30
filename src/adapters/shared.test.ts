import { describe, expect, test } from "bun:test";

import { countLineDelta, countPatchLines, editToolLineDelta } from "@adapters/shared";

describe("countLineDelta", () => {
  test("counts added and removed complete lines", () => {
    expect(countLineDelta("a\nb\nc\n", "a\nx\nc\n")).toEqual({ added: 1, removed: 1 });
  });

  test("a bare write with no baseline counts every line as added", () => {
    expect(countLineDelta("", "one\ntwo\n")).toEqual({ added: 2, removed: 0 });
  });

  test("unchanged input yields zero", () => {
    expect(countLineDelta("a\nb\n", "a\nb\n")).toEqual({ added: 0, removed: 0 });
  });
});

describe("countPatchLines", () => {
  test("counts +/- content lines, skipping file and hunk headers", () => {
    const patch = `--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,4 @@
 old-line
-new-line
+new-line
+added-line
`;
    expect(countPatchLines(patch)).toEqual({ added: 2, removed: 1 });
  });
});

describe("editToolLineDelta", () => {
  test("Edit, from an OpenAI-style JSON-string of arguments", () => {
    const args = JSON.stringify({ old_string: "a\nb\nc\n", new_string: "a\nx\nc\n" });
    expect(editToolLineDelta("Edit", args)).toEqual({ added: 1, removed: 1 });
  });

  test("Edit, from a plain object input", () => {
    expect(editToolLineDelta("Edit", { old_string: "drop\n", new_string: "" })).toEqual({ added: 0, removed: 1 });
  });

  test("MultiEdit sums its edit pairs", () => {
    expect(
      editToolLineDelta("MultiEdit", {
        edits: [
          { old_string: "a\nb\n", new_string: "a\nb\nc\n" },
          { old_string: "x\n", new_string: "y\n" },
        ],
      }),
    ).toEqual({ added: 2, removed: 1 });
  });

  test("Write with content, and NotebookEdit with new_source, count everything as added", () => {
    expect(editToolLineDelta("Write", { content: "line1\nline2\n" })).toEqual({ added: 2, removed: 0 });
    expect(editToolLineDelta("NotebookEdit", { new_source: "cell\n" })).toEqual({ added: 1, removed: 0 });
  });

  test("apply_patch reads its embedded patch, as an object or a raw string", () => {
    const patch = `--- a/x
+++ b/x
@@ -1 +1 @@
-a
+b
`;
    expect(editToolLineDelta("apply_patch", { patch })).toEqual({ added: 1, removed: 1 });
    expect(editToolLineDelta("apply_patch", patch)).toEqual({ added: 1, removed: 1 });
  });

  test("unrecoverable shapes and unknown tools contribute nothing", () => {
    expect(editToolLineDelta("Edit", { old_string: "only one side" })).toBeNull();
    expect(editToolLineDelta("Read", "some-source.ts")).toBeNull();
    expect(editToolLineDelta("Rewrite", { old_string: "a\n", new_string: "b\n" })).toBeNull();
    expect(editToolLineDelta("Write", {})).toBeNull();
  });
});