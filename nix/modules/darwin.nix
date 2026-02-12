# nix-darwin module for ai-toolkit
#
# Usage:
#   imports = [ ai-toolkit.darwinModules.default ];
#   services.ai-toolkit = {
#     enable = true;
#     user = "youruser";  # your macOS login username
#   };
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.ai-toolkit;
  inherit (lib) mkDefault mkIf;

  # Build the environment export lines for the launchd script
  envLines = lib.concatStringsSep "\n" (
    lib.mapAttrsToList (name: value: "export ${name}=${lib.escapeShellArg value}") cfg.environment
  );
in
{
  imports = [ ./common-options.nix ];

  config = mkIf cfg.enable {
    # Platform-specific defaults
    services.ai-toolkit = {
      package = mkDefault pkgs.ai-toolkit-ui;
      # Use a sensible default; the wrapper script expands $HOME at runtime
      # so this is only used if the user doesn't override dataDir.
      dataDir = mkDefault "/Users/${cfg.user}/.local/share/ai-toolkit";
    };

    # launchd user agent
    launchd.user.agents.ai-toolkit = {
      script = ''
        set -euo pipefail

        # Core service configuration
        export PORT="${toString cfg.port}"
        export AI_TOOLKIT_UI_HOST="${cfg.host}"
        export AI_TOOLKIT_UI_DATA="${cfg.dataDir}"
        export AI_TOOLKIT_MDNS="${if cfg.mdns.enable then "true" else "false"}"

        ${lib.optionalString (cfg.auth != null) ''
          export AI_TOOLKIT_AUTH=${lib.escapeShellArg cfg.auth}
        ''}

        # Source secrets from environment file
        ${lib.optionalString (cfg.environmentFile != null) ''
          set -a
          source ${lib.escapeShellArg (toString cfg.environmentFile)}
          set +a
        ''}

        # Additional user environment variables
        ${envLines}

        exec ${cfg.package}/bin/ai-toolkit-ui
      '';

      serviceConfig = {
        Label = "com.ostris.ai-toolkit";
        RunAtLoad = true;
        KeepAlive = true;
        StandardOutPath = "${cfg.dataDir}/logs/stdout.log";
        StandardErrorPath = "${cfg.dataDir}/logs/stderr.log";
        ThrottleInterval = 5;
        # Ensure worker + server children are killed on stop
        AbandonProcessGroup = false;
        EnvironmentVariables = {
          # MPS environment variables for Apple Silicon training
          PYTORCH_ENABLE_MPS_FALLBACK = "1";
          PYTORCH_MPS_HIGH_WATERMARK_RATIO = "0.0";
          NODE_ENV = "production";
        };
      };
    };
  };
}
