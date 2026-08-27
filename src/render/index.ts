import { resolveAdapter } from "@adapters/registry";
import { InAppStatuslineSupport } from "@adapters/types";
import type { Config } from "@config";
import { readStdinJson } from "@process";
import { computeRows } from "@render/compute";
import { FALLBACK_COLUMNS } from "@render/layout";

export async function render(_args: string[], config: Config): Promise<void> {
  const adapter = resolveAdapter(config);
  if (adapter.capabilities.inAppStatusline === InAppStatuslineSupport.Unsupported) {
    console.error(
      `pharos: ${adapter.id} has no in-app statusline hook yet, so 'pharos render' has nothing to attach to. ` +
        "Use 'pharos tmux render' instead (see README) to get a rendered statusline in tmux's status bar.",
    );
    process.exit(1);
  }

  const parsed = await readStdinJson();

  const cols = Number(process.env.COLUMNS) || process.stdout.columns || FALLBACK_COLUMNS;
  const { row1, row2 } = await computeRows(parsed, config, cols);

  console.log(row1);
  process.stdout.write(row2);
}
