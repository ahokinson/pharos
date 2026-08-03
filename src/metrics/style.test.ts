import { describe, expect, test } from "bun:test";
import { resolvePalette } from "@color";
import { mergeConfig } from "@config";
import { buildStyleKit, countdown, humanize, ramp, sparkline, trend } from "@metrics/style";

describe("humanize", () => {
  test.each([
    [789, "789"],
    [34000, "34k"],
    [1200000, "1.2M"],
    [1000000, "1M"],
  ])("%i -> %s", (input, expected) => {
    expect(humanize(input)).toBe(expected);
  });
});

describe("countdown", () => {
  const now = 1_000_000;

  test("returns 'now' for a past or equal timestamp", () => {
    expect(countdown(now, now)).toBe("now");
    expect(countdown(now - 10, now)).toBe("now");
  });

  test("returns days/hours/minutes at the right thresholds", () => {
    expect(countdown(now + 2 * 86400, now)).toBe("2d");
    expect(countdown(now + 3 * 3600, now)).toBe("3h");
    expect(countdown(now + 5 * 60, now)).toBe("5m");
  });

  test("accepts a bare numeric-string epoch", () => {
    expect(countdown(String(now + 60), now)).toBe("1m");
  });

  test("accepts an ISO8601 string", () => {
    const iso = new Date((now + 3600) * 1000).toISOString();
    expect(countdown(iso, now)).toBe("1h");
  });

  test("returns empty string for an unparsable value", () => {
    expect(countdown("not-a-date", now)).toBe("");
  });
});

describe("sparkline", () => {
  test("returns empty string for fewer than 2 samples", () => {
    expect(sparkline([], 8)).toBe("");
    expect(sparkline([5], 8)).toBe("");
  });

  test("returns one tick per sample within the window", () => {
    expect(sparkline([0, 4, 8], 8).length).toBe(3);
  });

  test("flat samples (zero span) render the lowest tick throughout", () => {
    expect(sparkline([5, 5, 5], 8)).toBe("▁▁▁");
  });

  test("only the most recent `window` samples are used", () => {
    expect(sparkline([0, 0, 0, 0, 0, 10], 2).length).toBe(2);
  });
});

describe("trend", () => {
  test("returns empty string for fewer than 4 samples", () => {
    expect(trend([1, 2, 3], 10)).toBe("");
  });

  test("classifies rising/falling/steady against the slope threshold", () => {
    expect(trend([0, 0, 0, 300], 10)).toBe("rising");
    expect(trend([300, 0, 0, 0], 10)).toBe("falling");
    expect(trend([0, 0, 0, 0], 10)).toBe("steady");
  });
});

describe("ramp", () => {
  const palette = resolvePalette();
  const style = {
    steps: [
      { at: 15, color: "red" as const },
      { at: 5, color: "peach" as const },
    ],
    base: "green" as const,
  };

  test("picks the highest step at or below the value, else base", () => {
    expect(ramp(palette, 20, style)).toBe(palette.red);
    expect(ramp(palette, 10, style)).toBe(palette.peach);
    expect(ramp(palette, 0, style)).toBe(palette.green);
  });

  test("doesn't require steps to be pre-sorted", () => {
    const unsorted = { steps: [...style.steps].reverse(), base: style.base };
    expect(ramp(palette, 20, unsorted)).toBe(palette.red);
  });
});

describe("StyleKit.settings", () => {
  test("merges a metric's own defaults with config.metricStyle for that id", () => {
    const config = mergeConfig({ metricStyle: { cost: { base: "blue" } } });
    const style = buildStyleKit(config);
    expect(style.settings("cost", { steps: [], base: "green" })).toEqual({ steps: [], base: "blue" });
  });

  test("falls back entirely to defaults when config has no entry for the id", () => {
    const style = buildStyleKit(mergeConfig({}));
    expect(style.settings("unknown-id", { warnAt: 10 })).toEqual({ warnAt: 10 });
  });
});
