{
  description = "AI Toolkit - training suite for diffusion models";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      perSystem = { lib, system, ... }:
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

          # Docker image (Linux only)
          docker-image = pkgs.callPackage ./nix/docker-image.nix {
            inherit ai-toolkit;
          };

          # === Dev shell dependencies ===
          buildTools = with pkgs; [
            cmake
            pkg-config
            ninja
          ];

          commonLibs = with pkgs; [
            ffmpeg-full
            libjpeg
            libpng
            zlib
            libtiff
            libwebp
            openssl
            sqlite
          ];

          runtimes = with pkgs; [
            python312
            nodejs_22
            git
          ];

          darwinDeps = lib.optionals isDarwin [
            pkgs.libiconv
          ];

          linuxDeps = lib.optionals isLinux (with pkgs; [
            cudaPackages.cudatoolkit
            cudaPackages.cudnn
            libGL
            glib
            stdenv.cc.cc.lib
            xorg.libX11
          ]);
        in
        {
          # nix build / nix build .#default
          packages = {
            default = ai-toolkit;
            ai-toolkit = ai-toolkit;
          } // lib.optionalAttrs isLinux {
            docker = docker-image;
          };

          # nix run / nix run .#train -- config.yaml
          apps = {
            default = {
              type = "app";
              program = "${ai-toolkit}/bin/ai-toolkit-train";
            };
            train = {
              type = "app";
              program = "${ai-toolkit}/bin/ai-toolkit-train";
            };
            gradio = {
              type = "app";
              program = "${ai-toolkit}/bin/ai-toolkit-gradio";
            };
          };

          # nix develop
          devShells.default = pkgs.mkShell {
            packages = buildTools ++ commonLibs ++ runtimes ++ darwinDeps ++ linuxDeps;

            env = lib.optionalAttrs isLinux {
              CUDA_HOME = "${pkgs.cudaPackages.cudatoolkit}";
            };

            shellHook = ''
              ${lib.optionalString isLinux ''
                export LD_LIBRARY_PATH="${lib.makeLibraryPath [
                  pkgs.stdenv.cc.cc.lib
                  pkgs.libGL
                  pkgs.glib
                  pkgs.cudaPackages.cudatoolkit
                  pkgs.cudaPackages.cudnn
                ]}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
              ''}

              if [ ! -d "venv" ]; then
                echo "Creating Python virtual environment..."
                python3 -m venv venv
              fi
              source venv/bin/activate

              echo ""
              echo "AI Toolkit dev shell"
              echo "  Python: $(python3 --version)"
              echo "  Node:   $(node --version)"
              echo ""
              echo "Quick start:"
              echo "  pip install -r requirements.txt   # first time only"
              echo "  python run.py config/your_config.yaml"
              echo ""
              echo "Nix package targets:"
              echo "  nix build          # build ai-toolkit package"
              echo "  nix run . -- config/your_config.yaml  # run training"
              ${lib.optionalString isLinux ''echo "  nix build .#docker  # build Docker image"''}
            '';
          };
        };
    };
}
