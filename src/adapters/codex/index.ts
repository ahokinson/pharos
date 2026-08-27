import { AdapterName, InAppStatuslineSupport, MiningSupport, TmuxStatusSupport } from "@adapters/types";
import type { HostAdapter } from "@adapters/types";
import { bucketFor } from "@adapters/codex/bucket";
import { mineTranscript } from "@adapters/codex/mining";
import { isIdleNotification } from "@adapters/codex/notify";
import { parseSession } from "@adapters/codex/session";

export const codexAdapter: HostAdapter = {
  id: AdapterName.Codex,
  parseSession,
  mineTranscript,
  isIdleNotification,
  bucketFor,
  capabilities: {
    // No command-backed in-app statusline exists yet (open, unshipped
    // feature requests: openai/codex#20140, #17827).
    inAppStatusline: InAppStatuslineSupport.Unsupported,
    // Codex's hooks are spawned-process commands with session_id/
    // transcript_path/etc on stdin, same shape tmux dispatch/render need —
    // see session.ts for exactly which fields are and aren't verified.
    tmuxStatus: TmuxStatusSupport.NativeHooks,
    // mining.ts is verified against real transcripts for tokens/tool-count;
    // toolErrors and permissionMode are known, documented gaps, not bugs.
    mining: MiningSupport.BestEffort,
  },
};
