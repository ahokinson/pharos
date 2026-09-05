{ stdenvNoCC, bun, src, lockSrc ? src }:

# stdenvNoCC, not stdenv: this is a statically self-contained bun --compile
# binary, not something a C compiler links, so it has no business going
# through stdenv's C-toolchain-oriented fixupPhase (patchelf RPATH-shrinking,
# then `strip`) — those steps normalize/truncate to what they consider "the
# real ELF" and silently discard bun's appended bundled-module payload,
# producing a binary that runs as plain bun instead of pharos. nixpkgs' own
# opencode package (also a bun --compile binary) uses stdenvNoCC for the
# same reason.
let
  version = "0.2.5";

  # `bun build --compile` resolves imports from a real node_modules, so the
  # dependency tree has to exist before the build proper. Fetching it needs
  # the network, which only a fixed-output derivation may have — hence the
  # hash below.
  #
  # `--os '*' --cpu '*'` is what makes that hash portable. @opentui/core ships
  # its native Zig library as eight per-platform optional dependencies gated by
  # `os`/`cpu`; left to itself `bun install` materializes only the ones matching
  # the machine it runs on, so a darwin tree and a linux tree hash differently
  # and no single value can describe both. Installing every platform's prebuild
  # makes this output identical everywhere. It costs nothing at the far end:
  # opentui picks its library through `process.platform` branches that bun's
  # bundler resolves at compile time, so the binary still embeds only ours.
  # Quote the globs — bare `*` would glob against the build directory.
  #
  # The name deliberately carries no version. A fixed-output derivation's store
  # path is derived from its name and hash alone, so a versioned name would
  # change the path on every release, forcing a re-fetch and re-verification of
  # a dependency tree that never moved. Update outputHash when bun.lock changes;
  # the build reports the correct value on mismatch.
  nodeModules = stdenvNoCC.mkDerivation {
    name = "pharos-node-modules";
    src = lockSrc;

    nativeBuildInputs = [ bun ];
    dontConfigure = true;

    buildPhase = ''
      runHook preBuild
      export HOME=$TMPDIR
      bun install --frozen-lockfile --no-progress --ignore-scripts --os '*' --cpu '*'
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out
      cp -R node_modules $out/
      runHook postInstall
    '';

    dontFixup = true;
    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = "sha256-Kiht1OpSa5AEVuqZQ3SFhkdTKU8XmGDQBCImNy+SUqc=";
  };
in
stdenvNoCC.mkDerivation {
  pname = "pharos";
  inherit version src;

  nativeBuildInputs = [ bun ];

  dontConfigure = true;

  buildPhase = ''
    runHook preBuild
    export HOME=$TMPDIR
    cp -R ${nodeModules}/node_modules .
    bun build ./src/index.ts --compile --outfile pharos
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    install -Dm755 pharos $out/bin/pharos
    runHook postInstall
  '';

  meta = {
    description = "Renders an AI coding agent's live session state as statusline fields and a tmux pulse";
    homepage = "https://github.com/ahokinson/pharos";
    mainProgram = "pharos";
  };
}
