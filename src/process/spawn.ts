export interface RunResult {
  ok: boolean;
  stdout: string;
}

export function runSync(cmd: string[]): RunResult {
  try {
    const result = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "ignore" });
    return { ok: result.exitCode === 0, stdout: result.stdout.toString() };
  } catch {
    return { ok: false, stdout: "" };
  }
}
