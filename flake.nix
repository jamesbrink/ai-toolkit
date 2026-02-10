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

      perSystem = { pkgs, lib, system, ... }:
        let
          isDarwin = pkgs.stdenv.isDarwin;
          isLinux = pkgs.stdenv.isLinux;

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

          # On current nixpkgs-unstable, Apple frameworks (Accelerate, Metal,
          # MetalPerformanceShaders, CoreGraphics, CoreVideo, Foundation,
          # Security, SystemConfiguration) are bundled into the default SDK
          # provided by the Darwin stdenv. No explicit framework deps needed.
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

              echo "AI Toolkit dev shell"
              echo "  Python: $(python3 --version)"
              echo "  Node:   $(node --version)"
            '';
          };
        };
    };
}
