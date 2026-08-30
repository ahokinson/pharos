import { AdapterName, MiningSupport, TmuxStatusSupport } from "@adapters/types";
import type { HostAdapter } from "@adapters/types";
import { bucketFor } from "@adapters/hermes/bucket";
import { mineTranscript } from "@adapters/hermes/mining";
import { isIdleNotification } from "@adapters/hermes/notify";
import { parseSession } from "@adapters/hermes/session";

export const hermesAdapter: HostAdapter = {
  id: AdapterName.Hermes, parseSession, mineTranscript, isIdleNotification, bucketFor,
  capabilities: { tmuxStatus: TmuxStatusSupport.NativeHooks, mining: MiningSupport.BestEffort },
};
