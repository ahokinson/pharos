import { existsSync } from "node:fs";
import { commandExists } from "@process/exists";

export enum HealthStatus {
  Absent = "absent",
  Degraded = "degraded",
  Healthy = "healthy",
}

/** Is `binary` on PATH, and are its `requirements` (each either an absolute
 * path, existence-checked, or another PATH-checked binary name) also
 * present? An optional shared `sentinel` path, if given and present, forces
 * "degraded" regardless of the checks below it: the common pattern of one
 * external health-check process signaling "something's wrong" to everyone
 * that depends on it. A generic "is this external tool here and configured"
 * check, useful to any plugin reporting on an external dependency. */
export function checkHealth(binary: string, requirements: string[] = [], sentinel?: string): HealthStatus {
  if (!commandExists(binary)) return HealthStatus.Absent;
  if (sentinel && existsSync(sentinel)) return HealthStatus.Degraded;
  for (const dep of requirements) {
    if (dep.startsWith("/")) {
      if (!existsSync(dep)) return HealthStatus.Degraded;
    } else if (!commandExists(dep)) {
      return HealthStatus.Degraded;
    }
  }
  return HealthStatus.Healthy;
}
