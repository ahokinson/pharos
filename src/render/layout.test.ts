import { describe, expect, test } from "bun:test";
import { fitRow } from "@render/layout";

describe("fitRow", () => {
  test("keeps all fields when the row fits", () => {
    const fields = [
      { line: 1 as const, text: "aaa", priority: 10 },
      { line: 1 as const, text: "bbb", priority: 20 },
    ];
    const rendered = fitRow(fields, 1, 80);
    expect(rendered).toContain("aaa");
    expect(rendered).toContain("bbb");
  });

  test("drops the lowest-priority field first when the row is too narrow", () => {
    const fields = [
      { line: 1 as const, text: "lowpriority", priority: 10 },
      { line: 1 as const, text: "highpriority", priority: 90 },
    ];
    const rendered = fitRow(fields, 1, 15);
    expect(rendered).not.toContain("lowpriority");
    expect(rendered).toContain("highpriority");
  });

  test("never drops a PINNED (>=100) field even if it overflows", () => {
    const fields = [{ line: 1 as const, text: "a".repeat(200), priority: 100 }];
    const rendered = fitRow(fields, 1, 10);
    expect(rendered).toContain("a".repeat(200));
  });

  test("only considers fields on the requested row", () => {
    const fields = [
      { line: 1 as const, text: "row-one", priority: 10 },
      { line: 2 as const, text: "row-two", priority: 10 },
    ];
    expect(fitRow(fields, 1, 80)).toContain("row-one");
    expect(fitRow(fields, 1, 80)).not.toContain("row-two");
  });
});
