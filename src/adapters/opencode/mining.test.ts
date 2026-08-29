import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mineTranscript } from "@adapters/opencode/mining";
import type { MiningState } from "@session/mining";

// Fixture shapes are trimmed to just the columns mining.ts reads, matching
// the structure verified against a real opencode-stable.db (opencode
// 1.18.21) — not fabricated from docs.

const SID = "ses_main";
const CHILD = "ses_child";

function emptyState(): MiningState {
  return {
    minedLines: 0,
    subagentLines: {},
    tokensIn: 0,
    tokensOut: 0,
    toolCounts: {},
    toolErrors: 0,
    ctxSamples: [],
    permissionMode: null,
  };
}

function createDb(path: string): Database {
  const db = new Database(path);
  db.exec(`
    create table session (
      id text primary key, parent_id text, cost real default 0,
      summary_additions integer default 0, summary_deletions integer default 0, model text
    );
    create table message (id text primary key, session_id text, time_created integer, data text);
    create table part (id text primary key, session_id text, data text);
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

function insertToolPart(db: Database, id: string, sessionId: string, tool: string, status: string): void {
  db.query("insert into part (id, session_id, data) values (?, ?, ?)").run(
    id,
    sessionId,
    JSON.stringify({ type: "tool", tool, state: { status } }),
  );
}

describe("mineTranscript (opencode DB)", () => {
  let dir: string;
  let db: Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pharos-opencode-mining-test-"));
    const path = join(dir, "test.db");
    process.env.PHAROS_OPENCODE_DB = path;
    db = createDb(path);
  });

  afterEach(() => {
    db.close();
    delete process.env.PHAROS_OPENCODE_DB;
    rmSync(dir, { recursive: true, force: true });
  });

  test("rebuilds tool counts and errors across own and child sessions", async () => {
    db.query("insert into session (id) values (?)").run(SID);
    db.query("insert into session (id, parent_id) values (?, ?)").run(CHILD, SID);
    insertToolPart(db, "p1", SID, "bash", "completed");
    insertToolPart(db, "p2", SID, "bash", "error");
    insertToolPart(db, "p3", SID, "read", "completed");
    insertToolPart(db, "p4", CHILD, "task", "completed");
    insertToolPart(db, "p5", CHILD, "edit", "error");

    const state = await mineTranscript(SID, emptyState());
    expect(state.toolCounts).toEqual({ bash: 2, read: 1, task: 1, edit: 1 });
    expect(state.toolErrors).toBe(2);
    expect(state.subagentLines).toEqual({ [CHILD]: 2 });
  });

  test("sums tokens including cache and reasoning, own and child", async () => {
    db.query("insert into session (id) values (?)").run(SID);
    db.query("insert into session (id, parent_id) values (?, ?)").run(CHILD, SID);
    insertMessage(db, "m1", SID, 1, {
      role: "assistant",
      tokens: { total: 175, input: 100, output: 10, reasoning: 5, cache: { read: 50, write: 25 } },
    });
    insertMessage(db, "m2", CHILD, 2, {
      role: "assistant",
      tokens: { total: 90, input: 80, output: 4, reasoning: 6, cache: { read: 0, write: 0 } },
    });

    const state = await mineTranscript(SID, emptyState());
    expect(state.tokensIn).toBe(255);
    expect(state.tokensOut).toBe(25);
  });

  test("ctxSamples stay main-only, skip zero totals, and cap at the tail", async () => {
    db.query("insert into session (id) values (?)").run(SID);
    db.query("insert into session (id, parent_id) values (?, ?)").run(CHILD, SID);
    insertMessage(db, "m1", SID, 1, { role: "assistant", tokens: { total: 100, input: 100, output: 1 } });
    insertMessage(db, "m2", SID, 2, { role: "assistant", tokens: { total: 0, input: 0, output: 0 } });
    insertMessage(db, "m3", SID, 3, { role: "assistant", tokens: { total: 200, input: 200, output: 2 } });
    insertMessage(db, "m4", CHILD, 4, { role: "assistant", tokens: { total: 999, input: 999, output: 9 } });

    const state = await mineTranscript(SID, emptyState(), 2);
    expect(state.ctxSamples).toEqual([100, 200]);
  });

  test("permissionMode comes from the latest message's mode, with build as default", async () => {
    db.query("insert into session (id) values (?)").run(SID);
    insertMessage(db, "m1", SID, 1, { role: "assistant", mode: "build", tokens: { total: 10 } });
    insertMessage(db, "m2", SID, 2, { role: "assistant", mode: "plan", tokens: { total: 20 } });

    const state = await mineTranscript(SID, emptyState());
    expect(state.permissionMode).toBe("plan");
  });

  test("a build-only session reads as the silent default mode", async () => {
    db.query("insert into session (id) values (?)").run(SID);
    insertMessage(db, "m1", SID, 1, { role: "assistant", mode: "build" });

    const state = await mineTranscript(SID, emptyState());
    expect(state.permissionMode).toBe("default");
  });

  test("fails open to the prior state when the DB is unreadable", async () => {
    db.close();
    rmSync(join(dir, "test.db"));

    const prior: MiningState = { ...emptyState(), tokensIn: 42 };
    const state = await mineTranscript(SID, prior);
    expect(state).toEqual(prior);
  });

  test("returns the prior state unchanged for an unknown session id", async () => {
    const prior: MiningState = { ...emptyState(), tokensIn: 42 };
    const state = await mineTranscript("ses_nope", prior);
    expect(state).toEqual(prior);
  });
});
