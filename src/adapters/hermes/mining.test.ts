import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { mineTranscript } from "@adapters/hermes/mining";
import { parseSession } from "@adapters/hermes/session";
import { loadMiningState } from "@session/mining";

let dir = "";
let path = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pharos-hermes-test-"));
  path = join(dir, "state.db");
  process.env.PHAROS_HERMES_DB = path;
  const db = new Database(path);
  db.exec(`create table sessions (
    id text primary key, parent_session_id text, model text, input_tokens integer, output_tokens integer,
    cache_read_tokens integer, cache_write_tokens integer, reasoning_tokens integer,
    estimated_cost_usd real, actual_cost_usd real, tool_call_count integer, cwd text, git_branch text, git_repo_root text
  ); create table messages (session_id text, tool_name text, effect_disposition text);`);
  db.exec("insert into sessions values ('main', null, 'nous/hermes-4', 100, 20, 10, 5, 7, 0.2, 0.3, 2, '/repo', 'develop', '/repo')");
  db.exec("insert into sessions values ('child', 'main', 'nous/hermes-4', 50, 10, 0, 0, 0, 0.1, 0.1, 1, '/repo', 'develop', '/repo')");
  db.exec("insert into messages values ('main', 'terminal', 'ok'), ('main', 'write_file', 'error'), ('child', 'terminal', 'ok')");
  db.close();
});

afterEach(() => {
  delete process.env.PHAROS_HERMES_DB;
  rmSync(dir, { recursive: true, force: true });
});

describe("Hermes state DB adapter", () => {
  test("renders root session facts and aggregates child work", async () => {
    expect(parseSession({ session_id: "main" })).toMatchObject({ model: "nous/hermes-4", cost: 0.3 });
    const mined = await mineTranscript("main", await loadMiningState("missing-hermes"), 40);
    expect(mined).toMatchObject({ tokensIn: 165, tokensOut: 37, toolErrors: 1, branch: "develop", repository: "/repo", cost: 0.4 });
    expect(mined.toolCounts).toEqual({ terminal: 2, write_file: 1 });
  });

  test("fails open when no session is found", async () => {
    const prior = await loadMiningState("missing-hermes");
    expect(await mineTranscript("unknown", prior, 40)).toEqual(prior);
  });
});
