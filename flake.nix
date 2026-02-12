{
  description = "AI Toolkit - training suite for diffusion models";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    devshell.url = "github:numtide/devshell";
    devshell.inputs.nixpkgs.follows = "nixpkgs";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.devshell.flakeModule
        inputs.treefmt-nix.flakeModule
        ./nix/devshell.nix
      ];

      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      # Non-per-system outputs: overlay and service modules
      flake = {
        overlays.default = import ./nix/overlay.nix;
        nixosModules.default = import ./nix/modules/nixos.nix;
        darwinModules.default = import ./nix/modules/darwin.nix;
      };

      perSystem =
        { lib, system, ... }:
        let
          # Import nixpkgs with unfree packages allowed (required for CUDA on Linux)
          pkgs = import inputs.nixpkgs {
            inherit system;
            config = {
              allowUnfree = true;
            };
          };

          isDarwin = pkgs.stdenv.isDarwin;
          isLinux = pkgs.stdenv.isLinux;

          # Python with custom package overlay
          python3 = pkgs.python312.override {
            packageOverrides = import ./nix/python-packages.nix {
              inherit pkgs lib;
            };
          };

          # Main package
          ai-toolkit = pkgs.callPackage ./nix/ai-toolkit.nix {
            inherit python3;
          };

          # Next.js web UI
          ai-toolkit-ui = pkgs.callPackage ./nix/ai-toolkit-ui.nix {
            inherit ai-toolkit;
          };

          # Docker image (Linux only)
          docker-image = pkgs.callPackage ./nix/docker-image.nix {
            inherit ai-toolkit ai-toolkit-ui;
          };

        in
        {
          # Override the default pkgs so all perSystem modules (including devshell)
          # get nixpkgs with allowUnfree = true (required for CUDA on Linux).
          _module.args.pkgs = pkgs;

          # treefmt — provides `nix fmt` and `checks.treefmt`
          treefmt = {
            projectRootFile = "flake.nix";
            programs = {
              nixfmt.enable = true;
              prettier = {
                enable = true;
                includes = [ "ui/**/*.{ts,tsx,js,jsx,css,json}" ];
                excludes = [
                  "ui/node_modules/**"
                  "ui/.next/**"
                  "ui/dist/**"
                  "ui/prisma/generated/**"
                ];
              };
            };
          };

          # nix build / nix build .#default
          packages = {
            default = ai-toolkit-ui;
            ai-toolkit = ai-toolkit;
            ui = ai-toolkit-ui;
          }
          // lib.optionalAttrs isLinux {
            docker = docker-image;
          };

          # nix run / nix run .#ui -- start the web UI
          apps = {
            default = {
              type = "app";
              program = "${ai-toolkit-ui}/bin/ai-toolkit-ui";
              meta.description = "Start the Next.js dashboard for managing training jobs";
            };
            train = {
              type = "app";
              program = "${ai-toolkit}/bin/ai-toolkit-train";
              meta.description = "Run a diffusion model training job from a YAML config";
            };
            gradio = {
              type = "app";
              program = "${ai-toolkit}/bin/ai-toolkit-gradio";
              meta.description = "Launch the Gradio web UI for interactive LoRA training";
            };
            ui = {
              type = "app";
              program = "${ai-toolkit-ui}/bin/ai-toolkit-ui";
              meta.description = "Start the Next.js dashboard for managing training jobs";
            };
          };

          # nix develop — provided by ./nix/devshell.nix
        };
    };
}
