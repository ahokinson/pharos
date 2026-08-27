{
  description = "Renders Claude Code's live session state as statusline fields and a tmux pulse";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-linux" "aarch64-linux" ];
      forEachSystem = nixpkgs.lib.genAttrs systems;

      pharosFor = pkgs: pkgs.callPackage ./package.nix { src = self; };
    in
    {
      packages = forEachSystem (system:
        let pharos = pharosFor nixpkgs.legacyPackages.${system};
        in { inherit pharos; default = pharos; });

      overlays.default = final: _prev: { pharos = pharosFor final; };
    };
}
