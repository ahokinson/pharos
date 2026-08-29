import { AdapterName, MiningSupport, TmuxStatusSupport } from "@adapters/types";
import type { HostAdapter } from "@adapters/types";
import { bucketFor } from "@adapters/claude/bucket";
import { mineTranscript } from "@adapters/claude/mining";
import { isIdleNotification } from "@adapters/claude/notify";
import { parseSession } from "@adapters/claude/session";

export const claudeAdapter: HostAdapter = {
  id: AdapterName.Claude,
  parseSession,
  mineTranscript,
  isIdleNotification,
  bucketFor,
  capabilities: {
    tmuxStatus: TmuxStatusSupport.NativeHooks,
    mining: MiningSupport.Stable,
  },
};
