import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseSession } from "@adapters/opencode/session";

// Fixture shapes are trimmed to just the columns session.ts reads, matching
// the structure verified against a real opencode-stable.db (opencode
// 1.18.21) — not fabricated from docs.

const SID = "ses_main";
const CHILD = "ses_child";
const MODEL_BLOB = JSON.stringify({ id: "glm-5.3", providerID: "opencode-go", variant: "high" });

function createDb(path: string): Database {
  const db = new Database(path);
  db.exec(`
    create table session (
      id text primary key, parent_id text, cost real default 0,
      summary_additions integer default 0, summary_deletions integer default 0, model text
    );
    create table message (id text primary key, session_id text, time_created integer, data text);
  `);
  return db;
}

function insertMessage(db: Database, id: string, sessionId: string, time: number, data: unknown): void {
  db.query("insert into message (id, session_id, time_created, data) values (?, ?, ?, ?)").run(
    id,
    sessionId,
    time,
    JSON.stringify(data),
  );
}

describe("parseSession (opencode DB)", () => {
  let dir: string;
  let db: Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pharos-opencode-session-test-"));
    const path = join(dir, "test.db");
    process.env.PHAROS_OPENCODE_DB = path;
    db = createDb(path);
  });

  afterEach(() => {
    db.close();
    delete process.env.PHAROS_OPENCODE_DB;
    rmSync(dir, { recursive: true, force: true });
  });

  test("applies defaults when nothing resolves", () => {
    const session = parseSession({});
    expect(session.model).toBe("?");
    expect(session.pct).toBeNull();
    expect(session.ctxSize).toBe(200000);
    expect(session.sessionId).toBe("nosession");
    expect(session.cost).toBe(0);
  });

  test("enriches model, effort, and context from the DB", () => {
    db.query("insert into session (id, model, cost, summary_additions, summary_deletions) values (?, ?, ?, ?, ?)").run(
      SID,
      MODEL_BLOB,
      1.25,
      30,
      12,
    );
    insertMessage(db, "m1", SID, 1, {
      role: "assistant",
      mode: "build",
      modelID: "glm-5.3",
      variant: "high",
      tokens: { total: 50000, input: 400, output: 10 },
    });
    // The streaming-in-progress row: exists, but zeroed tokens until its
    // first usage report lands (see db.ts) — pct must fall back past it.
    insertMessage(db, "m2", SID, 2, { role: "assistant", mode: "build", tokens: { total: 0, input: 0, output: 0 } });

    const session = parseSession({ session_id: SID });
    expect(session.model).toBe("glm-5.3");
    expect(session.effort).toBe("high");
    expect(session.pct).toBe(25);
    expect(session.ctxSize).toBe(200000);
    expect(session.cost).toBe(1.25);
    // opencode stopped writing truthful summary_* columns at v1.16.0, so the
    // session diff always reads 0 here; mining owns it now (per-message diffs).
    expect(session.added).toBe(0);
    expect(session.removed).toBe(0);
    expect(session.transcript).toBe(SID);
  });

  test("falls back to the session row's model blob when no messages exist yet", () => {
    db.query("insert into session (id, model) values (?, ?)").run(SID, MODEL_BLOB);

    const session = parseSession({ session_id: SID });
    expect(session.model).toBe("glm-5.3");
    expect(session.effort).toBe("high");
    expect(session.pct).toBeNull();
  });

  test("folds child session aggregates into cost only", () => {
    db.query("insert into session (id, cost, summary_additions, summary_deletions) values (?, ?, ?, ?)").run(
      SID,
      1,
      10,
      5,
    );
    db.query("insert into session (id, parent_id, cost, summary_additions, summary_deletions) values (?, ?, ?, ?, ?)").run(
      CHILD,
      SID,
      0.5,
      7,
      2,
    );

    const session = parseSession({ session_id: SID });
    expect(session.cost).toBe(1.5);
    expect(session.added).toBe(0);
    expect(session.removed).toBe(0);
  });

  test("honors context_window_size from the payload", () => {
    db.query("insert into session (id, model) values (?, ?)").run(SID, MODEL_BLOB);
    insertMessage(db, "m1", SID, 1, { role: "assistant", tokens: { total: 50000, input: 400, output: 10 } });

    const session = parseSession({ session_id: SID, context_window_size: 100000 });
    expect(session.ctxSize).toBe(100000);
    expect(session.pct).toBe(50);
  });

  test("fails open to an unenriched session when the DB is unreadable", () => {
    db.close();
    rmSync(join(dir, "test.db"));

    const session = parseSession({ session_id: SID });
    expect(session.model).toBe("?");
    expect(session.cost).toBe(0);
    expect(session.sessionId).toBe(SID);
  });
});
