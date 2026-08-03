import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { expandEnv } from "@config/env";

describe("expandEnv", () => {
  const original = process.env.PHAROS_TEST_VAR;
  beforeEach(() => {
    process.env.PHAROS_TEST_VAR = "/expanded";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.PHAROS_TEST_VAR;
    else process.env.PHAROS_TEST_VAR = original;
  });

  test("expands $VAR and ${VAR}", () => {
    expect(expandEnv("$PHAROS_TEST_VAR/file")).toBe("/expanded/file");
    expect(expandEnv("${PHAROS_TEST_VAR}/file")).toBe("/expanded/file");
  });

  test("expands a leading ~ to $HOME", () => {
    expect(expandEnv("~/foo")).toBe(`${process.env.HOME}/foo`);
  });

  test("leaves a plain path untouched", () => {
    expect(expandEnv("/usr/local/bin/tirith")).toBe("/usr/local/bin/tirith");
  });
});
