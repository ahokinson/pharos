import { afterEach, describe, expect, test } from "bun:test";

import { emptyExternalState, externalStateFile, loadExternalState, saveExternalState } from "@session";

const SID = "external-test-session";

afterEach(async () => {
  await Bun.file(externalStateFile(SID)).delete().catch(() => {});
});

describe("loadExternalState / saveExternalState", () => {
  test("round-trips a full state through BSON", async () => {
    await saveExternalState(SID, {
      cost: 18.25811785,
      contextWindow: 1_000_000,
      pct: 42,
      rl5: 59,
      rl5Reset: 1788924200,
      rl7: 44,
      rl7Reset: "2026-09-01T00:00:00Z",
    });
    expect(await loadExternalState(SID)).toEqual({
      cost: 18.25811785,
      contextWindow: 1_000_000,
      pct: 42,
      rl5: 59,
      rl5Reset: 1788924200,
      rl7: 44,
      rl7Reset: "2026-09-01T00:00:00Z",
    });
  });

  test("fails open to an empty state when nothing has ever been scraped", async () => {
    expect(await loadExternalState("no-such-session-id")).toEqual(emptyExternalState());
  });

  test("fails open to an empty state when the file is corrupt", async () => {
    await Bun.write(externalStateFile(SID), "not bson at all");
    expect(await loadExternalState(SID)).toEqual(emptyExternalState());
  });
});
