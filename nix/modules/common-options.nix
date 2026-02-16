# Shared option declarations for ai-toolkit service modules.
# Imported by both the NixOS and nix-darwin modules.
{ lib, ... }:
let
  inherit (lib) mkEnableOption mkOption types;
in
{
  options.services.ai-toolkit = {
    enable = mkEnableOption "AI Toolkit web UI service";

    package = mkOption {
      type = types.package;
      description = "The ai-toolkit-ui package to use.";
      # Default is set per-platform by the NixOS/Darwin module
    };

    port = mkOption {
      type = types.port;
      default = 8675;
      description = "Port for the web UI to listen on.";
    };

    host = mkOption {
      type = types.str;
      default = "0.0.0.0";
      description = "Bind address for the web UI.";
    };

    dataDir = mkOption {
      type = types.str;
      description = ''
        Directory for writable data (SQLite DB, datasets, training output).
        Default is platform-specific: /var/lib/ai-toolkit on NixOS,
        ~/.local/share/ai-toolkit on Darwin.
      '';
      # Default is set per-platform by the NixOS/Darwin module
    };

    user = mkOption {
      type = types.str;
      default = "ai-toolkit";
      description = ''
        User to run the service as.
        On NixOS, a system user is created automatically.
        On Darwin, this should be an existing login user.
      '';
    };

    group = mkOption {
      type = types.str;
      default = "ai-toolkit";
      description = "Group for the service. Only used on NixOS.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Whether to open the firewall for the web UI port. Only effective on NixOS.";
    };

    auth = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = ''
        Password for web UI authentication (AI_TOOLKIT_AUTH).
        Consider using environmentFile for secrets instead.
      '';
    };

    environmentFile = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = ''
        Path to an environment file with secrets (e.g. HF_TOKEN,
        CLAUDE_CODE_OAUTH_TOKEN). Loaded before the service starts.
      '';
    };

    environment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      description = "Additional environment variables for the service.";
    };

    createUser = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to create a dedicated system user and group. Set to false when using an existing user.";
    };

    requiresMounts = mkOption {
      type = types.listOf types.str;
      default = [ ];
      description = "List of systemd mount units the service requires before starting (e.g. ZFS datasets).";
    };

    mdns = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Whether to enable mDNS discovery and advertising.";
      };
    };

    secrets = {
      claudeOauthTokenFile = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = ''
          Path to a file containing the Claude Code OAuth token.
          Sets CLAUDE_CODE_OAUTH_TOKEN at runtime. Use this with agenix
          or sops-nix to avoid storing secrets in the Nix store.
        '';
      };

      hfTokenFile = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = ''
          Path to a file containing the HuggingFace token.
          Sets HF_TOKEN at runtime for downloading gated/private models.
        '';
      };

      anthropicApiKeyFile = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = ''
          Path to a file containing the Anthropic API key.
          Sets ANTHROPIC_API_KEY at runtime. Only needed if not using
          claudeOauthTokenFile (OAuth token takes priority in the app).
        '';
      };
    };
  };
}
