{
  description = "Renders Claude Code's live session state as statusline fields and a tmux pulse";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-linux" "aarch64-linux" ];
      forEachSystem = nixpkgs.lib.genAttrs systems;

      # The node_modules fixed-output derivation only reads these two files, so
      # hand it just those: everything else changing on every commit would keep
      # perturbing a derivation whose contents never move.
      lockSrc = nixpkgs.lib.fileset.toSource {
        root = ./.;
        fileset = nixpkgs.lib.fileset.unions [ ./package.json ./bun.lock ];
      };

      pharosFor = pkgs: pkgs.callPackage ./package.nix { src = self; inherit lockSrc; };
    in
    {
      packages = forEachSystem (system:
        let pharos = pharosFor nixpkgs.legacyPackages.${system};
        in { inherit pharos; default = pharos; });

      overlays.default = final: _prev: { pharos = pharosFor final; };
    };
}
