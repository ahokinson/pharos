import type { Config } from "@config";
import { buildFieldTexts, buildRegistry, buildStyleKit } from "@metrics";
import { loadPlugins } from "@plugin";
import { checkHealth, commandExists } from "@process";
import type { SessionInput } from "@session";
import { loadMiningState, mineTranscript, parseSession, saveMiningState } from "@session";
import type { Field } from "@render/layout";
import { fitRow } from "@render/layout";

export async function render(_args: string[], config: Config): Promise<void> {
  const raw = await Bun.stdin.text();
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw);
  } catch {}
  // parseSession optional-chains every field, so this cast never needs to
  // be exact, the same defensive-parse pattern as session/mining.ts.
  const session = parseSession(parsed as SessionInput);
  const nowEpoch = Math.floor(Date.now() / 1000);

  const resolved = await loadPlugins(config);
  const registry = buildRegistry(config, resolved);

  const mined = await mineTranscript(
    session.transcript,
    await loadMiningState(session.sessionId),
    config.context.sampleCap,
  );
  await saveMiningState(session.sessionId, mined);

  const onPlan = session.rl5 !== null || session.rl7 !== null;
  const style = buildStyleKit(config);
  // named processKit, not process, so it doesn't shadow the global `process`
  // this file already uses below (process.env, process.stdout).
  const processKit = { commandExists, checkHealth };

  const texts = buildFieldTexts({ session, mined, onPlan, nowEpoch, config, style, process: processKit }, registry);
  const fields: Field[] = [];
  for (const name of config.fieldOrder) {
    const text = texts[name];
    if (text === null || text === undefined) continue;
    const setting = config.fieldSettings[name];
    if (!setting) continue;
    fields.push({ line: setting.row, text, priority: setting.priority });
  }

  const cols = Number(process.env.COLUMNS) || process.stdout.columns || 80;
  const row1 = fitRow(fields, 1, cols);
  const row2 = fitRow(fields, 2, cols);

  console.log(row1);
  process.stdout.write(row2);
}
