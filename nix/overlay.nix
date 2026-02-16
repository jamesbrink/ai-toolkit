# Package overlay for ai-toolkit
#
# Usage in a NixOS or nix-darwin configuration:
#   nixpkgs.overlays = [ ai-toolkit.overlays.default ];
#
# This adds pkgs.ai-toolkit and pkgs.ai-toolkit-ui to nixpkgs.
#
# NOTE: On Linux, CUDA support requires allowUnfree in the consumer's nixpkgs config:
#   nixpkgs.config.allowUnfree = true;
{ nixpkgs }:
final: prev:
let
  pythonOverlay = import ./python-packages.nix {
    pkgs = final;
    lib = final.lib;
  };

  python3 = final.python312.override {
    packageOverrides = pythonOverlay;
  };

  # Prisma 7 engine binaries — the consumer's nixpkgs may not ship
  # prisma-engines_7, so fall back to the flake's own nixpkgs input.
  flakePkgs = import nixpkgs {
    inherit (final) system;
    config.allowUnfree = true;
  };
  prismaEngines7 = final.prisma-engines_7 or flakePkgs.prisma-engines_7 or final.prisma-engines;
in
{
  ai-toolkit = final.callPackage ./ai-toolkit.nix { inherit python3; };
  ai-toolkit-ui = final.callPackage ./ai-toolkit-ui.nix {
    ai-toolkit = final.ai-toolkit;
    prisma-engines_7 = prismaEngines7;
  };
}
