{ stdenvNoCC, bun, src }:

# stdenvNoCC, not stdenv: this is a statically self-contained bun --compile
# binary, not something a C compiler links, so it has no business going
# through stdenv's C-toolchain-oriented fixupPhase (patchelf RPATH-shrinking,
# then `strip`) — those steps normalize/truncate to what they consider "the
# real ELF" and silently discard bun's appended bundled-module payload,
# producing a binary that runs as plain bun instead of pharos. nixpkgs' own
# opencode package (also a bun --compile binary) uses stdenvNoCC for the
# same reason.
let
  version = "0.2.3";

  # `bun build --compile` resolves imports from a real node_modules, so the
  # dependency tree has to exist before the build proper. Fetching it needs
  # the network, which only a fixed-output derivation may have — hence the
  # hash below. It is NOT just a function of bun.lock: `bun install` writes
  # `node_modules/.bin/*` symlinks whose targets embed `src`'s own (content-
  # addressed) store path, so this changes on every release, dependency
  # bump or not. Update it on every version bump — the build reports the
  # correct one on mismatch.
  nodeModules = stdenvNoCC.mkDerivation {
    pname = "pharos-node-modules";
    inherit version src;

    nativeBuildInputs = [ bun ];
    dontConfigure = true;

    buildPhase = ''
      runHook preBuild
      export HOME=$TMPDIR
      bun install --frozen-lockfile --no-progress --ignore-scripts
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
    outputHash = "sha256-0OczA3Ibot6XUEFrDIqonbXOQR18mK50+mSwDxGJ4cM=";
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
