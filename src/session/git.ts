import { runSync } from "@process";

/** The worktree facts a card can show about the directory an agent is
 * working in. Everything here comes from git itself rather than a host's
 * transcript, so it's the one source that works identically across every
 * adapter — Claude Code and opencode carry no repository metadata at all
 * (see adapters/claude/mining.ts, adapters/opencode/db.ts). */
export interface GitProbe {
  branch: string | null;
  /** "owner/repo", from origin's URL. */
  repository: string | null;
  /** Bare hostname, e.g. "github.com" — the caller maps it to a label. */
  host: string | null;
  /** Paths git reports as changed, staged and untracked included. */
  dirtyFiles: number;
  added: number;
  removed: number;
}

/** Parses `owner/repo` and the host out of any origin URL form git accepts:
 * scp-style (git@host:owner/repo.git), ssh://, https://, or a local path
 * (which yields a repository name but no host). */
export function parseRemoteUrl(url: string): { repository: string | null; host: string | null } {
  const trimmed = url.trim().replace(/\.git$/, "");
  if (!trimmed) return { repository: null, host: null };
  const scp = /^[^/@]+@([^:]+):(.+)$/.exec(trimmed);
  const scheme = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(trimmed);
  const match = scp ?? scheme;
  if (!match) {
    // A local clone path: keep the directory name, admit there's no host.
    const name = trimmed.split("/").filter(Boolean).pop();
    return { repository: name ?? null, host: null };
  }
  const path = match[2]!.replace(/^\/+/, "");
  const segments = path.split("/").filter(Boolean);
  const repository = segments.length >= 2 ? segments.slice(-2).join("/") : (segments.at(-1) ?? null);
  return { repository, host: match[1]!.toLowerCase() };
}

/** Counts the changed-path lines in `git status --porcelain=v1` output,
 * skipping the `## branch` header that `--branch` prepends. */
function countDirty(lines: string[]): number {
  return lines.filter((line) => line.length > 0 && !line.startsWith("##")).length;
}

/** Reads the `## <branch>...<upstream>` header porcelain v1 emits with
 * `--branch`. Returns null on a detached HEAD, which git spells
 * "## HEAD (no branch)". */
function parseBranch(lines: string[]): string | null {
  const header = lines.find((line) => line.startsWith("## "));
  if (!header) return null;
  const name = header.slice(3).split("...")[0]!.trim();
  return !name || name.startsWith("HEAD (") ? null : name;
}

function sumNumstat(output: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of output.split("\n")) {
    // Binary files report "-\t-\tpath"; Number("-") is NaN, so `|| 0` drops
    // them rather than poisoning the totals.
    const [a, d] = line.split("\t");
    added += Number(a) || 0;
    removed += Number(d) || 0;
  }
  return { added, removed };
}

/** Inspects `cwd`'s worktree, or returns null when it isn't one (or git
 * isn't answering). Null is meaningfully different from a clean tree: the
 * caller must leave its worktree field unset rather than claim "clean",
 * which is what an unchecked exit code used to do here.
 *
 * `remote` is optional because origin's URL never changes within a session
 * — the caller memoizes it in the mining checkpoint and stops asking. */
export function probeGit(cwd: string, options: { remote?: boolean } = {}): GitProbe | null {
  const inside = runSync(["git", "-C", cwd, "rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") return null;

  // One spawn for both the branch and the full dirty set. `--untracked-files
  // =normal` and porcelain's staged column are what make this count agree
  // with the numstat below, which the old `git diff --numstat` (unstaged
  // tracked changes only) did not.
  const status = runSync(["git", "-C", cwd, "status", "--porcelain=v1", "--branch", "--untracked-files=normal"]);
  const lines = status.ok ? status.stdout.split("\n") : [];

  // ...HEAD, not the index: staged and unstaged changes both count as work
  // this worktree is carrying.
  const numstat = runSync(["git", "-C", cwd, "diff", "--numstat", "HEAD"]);
  const { added, removed } = numstat.ok ? sumNumstat(numstat.stdout.trim()) : { added: 0, removed: 0 };

  let repository: string | null = null;
  let host: string | null = null;
  if (options.remote) {
    const origin = runSync(["git", "-C", cwd, "remote", "get-url", "origin"]);
    if (origin.ok) ({ repository, host } = parseRemoteUrl(origin.stdout));
  }

  return { branch: parseBranch(lines), repository, host, dirtyFiles: countDirty(lines), added, removed };
}
