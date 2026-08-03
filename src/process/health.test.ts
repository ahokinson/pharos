import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkHealth, HealthStatus } from "@process/health";

describe("checkHealth", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pharos-health-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("absent when the binary itself isn't on PATH", () => {
    expect(checkHealth("definitely-not-a-real-binary-pharos-test")).toBe(HealthStatus.Absent);
  });

  test("healthy when the binary is present and there are no requirements", () => {
    expect(checkHealth("sh")).toBe(HealthStatus.Healthy);
  });

  test("degraded when the sentinel path exists, even with no other requirements", () => {
    const sentinel = join(dir, "degraded");
    writeFileSync(sentinel, "");
    expect(checkHealth("sh", [], sentinel)).toBe(HealthStatus.Degraded);
  });

  test("healthy when the sentinel path is given but doesn't exist", () => {
    const sentinel = join(dir, "does-not-exist");
    expect(checkHealth("sh", [], sentinel)).toBe(HealthStatus.Healthy);
  });

  test("degraded when a path-shaped requirement is missing", () => {
    const missing = join(dir, "missing-file");
    expect(checkHealth("sh", [missing])).toBe(HealthStatus.Degraded);
  });

  test("healthy when a path-shaped requirement exists", () => {
    const present = join(dir, "present-file");
    writeFileSync(present, "");
    expect(checkHealth("sh", [present])).toBe(HealthStatus.Healthy);
  });

  test("degraded when a binary-shaped requirement isn't on PATH", () => {
    expect(checkHealth("sh", ["definitely-not-a-real-binary-pharos-test"])).toBe(HealthStatus.Degraded);
  });

  test("healthy when every requirement is satisfied", () => {
    const present = join(dir, "present-file");
    writeFileSync(present, "");
    expect(checkHealth("sh", [present, "sh"])).toBe(HealthStatus.Healthy);
  });
});
