# numtide/devshell module — categorized command menu for `nix develop`
{ lib, ... }:
{
  perSystem = { pkgs, system, ... }:
    let
      isDarwin = pkgs.stdenv.isDarwin;
      isLinux = pkgs.stdenv.isLinux;
    in
    {
      devshells.default = {
        name = "ai-toolkit";

        # ── Commands ────────────────────────────────────────────

        commands = [
          # — development —
          {
            name = "dev";
            command = "cd ui && PORT=8675 npm run dev";
            help = "Start Next.js dev server with hot reload on :8675";
            category = "development";
          }
          {
            name = "setup";
            command = "cd ui && npm install && npm run update_db";
            help = "Install npm deps and run Prisma generate + DB push";
            category = "development";
          }
          {
            name = "lint";
            command = "cd ui && npm run lint";
            help = "Run ESLint on the web UI";
            category = "development";
          }
          {
            name = "format";
            command = "cd ui && npm run format";
            help = "Run Prettier on the web UI";
            category = "development";
          }

          # — training —
          {
            name = "train";
            command = ''python run.py "$@"'';
            help = "Run a training job (pass config YAML as argument)";
            category = "training";
          }
        ]
        ++ lib.optionals isDarwin [
          {
            name = "train-mps";
            command = ''
              PYTORCH_ENABLE_MPS_FALLBACK=1 \
              PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0 \
              python run.py "$@"
            '';
            help = "Run training with MPS env vars (Apple Silicon)";
            category = "training";
          }
        ]
        ++ [
          # — build —
          {
            name = "build-ui";
            command = "nix build";
            help = "Build the Next.js web UI via Nix";
            category = "build";
          }
          {
            name = "build-toolkit";
            command = "nix build .#ai-toolkit";
            help = "Build the Python training package via Nix";
            category = "build";
          }
        ]
        ++ lib.optionals isLinux [
          {
            name = "build-docker";
            command = "nix build .#docker";
            help = "Build the Docker image via Nix";
            category = "build";
          }
        ]
        ++ [
          # — run —
          {
            name = "ui-prod";
            command = "cd ui && npm run build_and_start";
            help = "Build and start the web UI in production mode";
            category = "run";
          }
          {
            name = "gradio";
            command = "python run_gradio.py";
            help = "Launch the Gradio web UI";
            category = "run";
          }
        ];

        # ── Packages ───────────────────────────────────────────

        packages = with pkgs;
          [
            # build tools
            cmake
            pkg-config
            ninja
            # common libs
            ffmpeg-full
            libjpeg
            libpng
            zlib
            libtiff
            libwebp
            openssl
            sqlite
            # runtimes
            python312
            nodejs_22
            git
          ]
          ++ lib.optionals isDarwin [
            libiconv
          ]
          ++ lib.optionals isLinux [
            cudaPackages.cudatoolkit
            libGL
            glib
            stdenv.cc.cc.lib
            libx11
          ];

        # ── Environment variables ──────────────────────────────

        env = lib.optionals isLinux [
          {
            name = "CUDA_HOME";
            value = "${pkgs.cudaPackages.cudatoolkit}";
          }
        ];

        # ── Startup hook ──────────────────────────────────────

        devshell.startup.setup.text = ''
          ${lib.optionalString isLinux ''
            export LD_LIBRARY_PATH="${lib.makeLibraryPath (with pkgs; [
              stdenv.cc.cc.lib
              libGL
              glib
              cudaPackages.cudatoolkit
            ])}"''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
          ''}

          # Use the same data directory as nix run / Docker for parity
          _DATA_DIR="''${AI_TOOLKIT_UI_DATA:-''${XDG_DATA_HOME:-$HOME/.local/share}/ai-toolkit}"
          export TOOLKIT_ROOT="$(pwd)"
          export DATABASE_URL="file:''${_DATA_DIR}/aitk_db.db"
          export DATASETS_FOLDER="''${DATASETS_FOLDER:-''${_DATA_DIR}/datasets}"
          export TRAINING_FOLDER="''${TRAINING_FOLDER:-''${_DATA_DIR}/output}"
          export DATA_ROOT="''${DATA_ROOT:-''${_DATA_DIR}/data}"
          export PORT="''${PORT:-8675}"
          mkdir -p "''${DATASETS_FOLDER}" "''${TRAINING_FOLDER}" "''${DATA_ROOT}"

          if [ ! -d "venv" ]; then
            echo "Creating Python virtual environment..."
            python3 -m venv venv
          fi
          source venv/bin/activate
        '';
      };
    };
}
