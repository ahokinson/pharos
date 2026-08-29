import { AdapterName, MiningSupport, TmuxStatusSupport } from "@adapters/types";
import type { HostAdapter } from "@adapters/types";
import { bucketFor } from "@adapters/opencode/bucket";
import { mineTranscript } from "@adapters/opencode/mining";
import { isIdleNotification } from "@adapters/opencode/notify";
import { parseSession } from "@adapters/opencode/session";

export const opencodeAdapter: HostAdapter = {
  id: AdapterName.Opencode,
  parseSession,
  mineTranscript,
  isIdleNotification,
  bucketFor,
  capabilities: {
    // opencode exposes in-process plugin events only, not process-spawned
    // hook commands — examples/opencode-bridge.ts is the bridge that
    // shells out to pharos's tmux entry points on those events.
    tmuxStatus: TmuxStatusSupport.BridgeRequired,
    // Verified against a real DB (opencode 1.18.21), but the schema is
    // internal to opencode and migration-owned; re-verify after upgrades
    // (see adapters/opencode/db.ts).
    mining: MiningSupport.BestEffort,
  },
};
