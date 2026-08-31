import { describe, expect, test } from "bun:test";
import { parseRemoteUrl } from "@session/git";

describe("parseRemoteUrl", () => {
  test("scp-style ssh remote", () => {
    expect(parseRemoteUrl("git@github.com:ahokinson/pharos.git")).toEqual({
      repository: "ahokinson/pharos",
      host: "github.com",
    });
  });

  test("https remote", () => {
    expect(parseRemoteUrl("https://gitlab.com/group/project.git")).toEqual({
      repository: "group/project",
      host: "gitlab.com",
    });
  });

  test("ssh:// remote with a port", () => {
    expect(parseRemoteUrl("ssh://git@codeberg.org:2222/owner/repo")).toEqual({
      repository: "owner/repo",
      host: "codeberg.org",
    });
  });

  test("https remote with embedded credentials", () => {
    expect(parseRemoteUrl("https://token@github.com/owner/repo.git")).toEqual({
      repository: "owner/repo",
      host: "github.com",
    });
  });

  // Nested groups are a GitLab staple; the last two segments are the pair a
  // card has room to show.
  test("keeps the final owner/repo pair from a nested group path", () => {
    expect(parseRemoteUrl("https://gitlab.com/a/b/c/repo.git")).toEqual({
      repository: "c/repo",
      host: "gitlab.com",
    });
  });

  test("a local clone path yields a name but admits no host", () => {
    expect(parseRemoteUrl("/srv/git/mirror.git")).toEqual({ repository: "mirror", host: null });
  });

  test("an empty remote yields nothing rather than an empty label", () => {
    expect(parseRemoteUrl("   ")).toEqual({ repository: null, host: null });
  });
});
