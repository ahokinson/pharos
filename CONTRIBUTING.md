# Contributing

## Building from source

```sh
bun install
bun test
bun run typecheck
```

Compile a standalone binary with `bun run build` (outputs `./pharos`).

## CI

Every push to `develop` and every PR runs `bun run typecheck` and
`bun test` (`.github/workflows/ci.yml`).

## Releasing

Push a tag matching `v*` (e.g. `v0.2.0`) and `.github/workflows/release.yml`
cross-compiles binaries for linux-x64, linux-arm64, darwin-x64, and
darwin-arm64 from a single runner, generates `checksums.txt`, and attaches
them to a GitHub Release. Bump `version` in `package.json` first so
`pharos --version` matches the tag.
