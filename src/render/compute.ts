import { resolveAdapter } from "@adapters/registry";
import type { Config } from "@config";
import { buildFieldTexts, buildRegistry, buildStyleKit } from "@metrics";
import { loadPlugins } from "@plugin";
import { checkHealth, commandExists } from "@process";
import { loadMiningState, saveMiningState } from "@session";
import type { Field } from "@render/layout";
import { fitRow } from "@render/layout";

export interface ComputedRows {
  row1: string;
  row2: string;
}

/** The one place a host's raw hook/stdin payload turns into rendered field
 * text, shared by both delivery surfaces: `render/index.ts`'s stdin path
 * (Claude Code's statusLine contract) and `tmux/render.ts`'s tmux-status
 * path (see adapters/types.ts's TmuxStatusSupport). `raw` is whatever the
 * calling entrypoint read from stdin — the resolved adapter's parseSession
 * decides what to make of it. */
export async function computeRows(raw: unknown, config: Config, cols: number): Promise<ComputedRows> {
  const adapter = resolveAdapter(config);
  const session = adapter.parseSession(raw);
  const nowEpoch = Math.floor(Date.now() / 1000);

  const resolved = await loadPlugins(config);
  const { registry, config: effective } = buildRegistry(config, resolved);

  const mined = await adapter.mineTranscript(
    session.transcript,
    await loadMiningState(session.sessionId),
    config.context.sampleCap,
  );
  await saveMiningState(session.sessionId, mined);

  const onPlan = session.rl5 !== null || session.rl7 !== null;
  const style = buildStyleKit(effective);
  // named processKit, not process, so it doesn't shadow the global `process`
  // callers of this function generally also use (process.env, process.stdout).
  const processKit = { commandExists, checkHealth };

  const texts = buildFieldTexts(
    { session, mined, onPlan, nowEpoch, config: effective, style, process: processKit, bucketFor: adapter.bucketFor },
    registry,
  );
  const fields: Field[] = [];
  for (const name of config.fieldOrder) {
    const text = texts[name];
    if (text === null || text === undefined) continue;
    const setting = effective.fieldSettings[name];
    if (!setting) continue;
    fields.push({ line: setting.row, text, priority: setting.priority });
  }

  return { row1: fitRow(fields, 1, cols), row2: fitRow(fields, 2, cols) };
}
