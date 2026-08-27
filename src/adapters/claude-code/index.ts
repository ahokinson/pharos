import { AdapterName, InAppStatuslineSupport, MiningSupport, TmuxStatusSupport } from "@adapters/types";
import type { HostAdapter } from "@adapters/types";
import { bucketFor } from "@adapters/claude-code/bucket";
import { mineTranscript } from "@adapters/claude-code/mining";
import { isIdleNotification } from "@adapters/claude-code/notify";
import { parseSession } from "@adapters/claude-code/session";

export const claudeCodeAdapter: HostAdapter = {
  id: AdapterName.ClaudeCode,
  parseSession,
  mineTranscript,
  isIdleNotification,
  bucketFor,
  capabilities: {
    inAppStatusline: InAppStatuslineSupport.NativeStdin,
    tmuxStatus: TmuxStatusSupport.NativeHooks,
    mining: MiningSupport.Stable,
  },
};
