# NixOS module for ai-toolkit
#
# Usage:
#   imports = [ ai-toolkit.nixosModules.default ];
#   services.ai-toolkit = {
#     enable = true;
#     openFirewall = true;
#     environmentFile = "/run/secrets/ai-toolkit.env";
#   };
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.ai-toolkit;
  inherit (lib) mkDefault mkIf mkMerge;
  isDefaultDataDir = lib.hasPrefix "/var/lib/" cfg.dataDir;
  stateDirectoryName = lib.removePrefix "/var/lib/" cfg.dataDir;
  # Detect NVIDIA GPU support so we can put nvidia-smi on the service PATH
  hasNvidia = builtins.elem "nvidia" (config.services.xserver.videoDrivers or [ ]);
in
{
  imports = [ ./common-options.nix ];

  config = mkIf cfg.enable (mkMerge [
    {
      # Platform-specific defaults
      services.ai-toolkit = {
        package = mkDefault pkgs.ai-toolkit-ui;
        dataDir = mkDefault "/var/lib/ai-toolkit";
      };

      # systemd service
      systemd.services.ai-toolkit = {
        description = "AI Toolkit Web UI";
        after = [ "network.target" ] ++ cfg.requiresMounts;
        requires = cfg.requiresMounts;
        wantedBy = [ "multi-user.target" ];

        # Put nvidia-smi on the service PATH so the UI can detect GPUs
        path = lib.optional hasNvidia config.hardware.nvidia.package;

        environment = {
          PORT = toString cfg.port;
          AI_TOOLKIT_UI_HOST = cfg.host;
          AI_TOOLKIT_UI_DATA = cfg.dataDir;
          DATABASE_URL = "file:${cfg.dataDir}/aitk_db.db";
          DATASETS_FOLDER = "${cfg.dataDir}/datasets";
          TRAINING_FOLDER = "${cfg.dataDir}/output";
          DATA_ROOT = "${cfg.dataDir}/data";
          AI_TOOLKIT_MDNS = if cfg.mdns.enable then "true" else "false";
          NODE_ENV = "production";
        }
        // lib.optionalAttrs (cfg.auth != null) {
          AI_TOOLKIT_AUTH = cfg.auth;
        }
        // cfg.environment;

        serviceConfig = {
          Type = "exec";
          ExecStart = "${cfg.package}/bin/ai-toolkit-ui";
          User = cfg.user;
          Group = cfg.group;

          # Restart policy
          Restart = "on-failure";
          RestartSec = 5;

          # Hardening
          ProtectSystem = "strict";
          ReadWritePaths = [ cfg.dataDir ];
          ProtectHome = cfg.createUser;
          PrivateTmp = true;
          NoNewPrivileges = true;
          ProtectKernelTunables = true;
          ProtectKernelModules = true;
          ProtectControlGroups = true;
          RestrictSUIDSGID = true;
          RemoveIPC = true;

          # GPU access needed for training jobs spawned by the worker
          PrivateDevices = false;
        }
        // lib.optionalAttrs isDefaultDataDir {
          StateDirectory = stateDirectoryName;
          StateDirectoryMode = "0750";
        }
        // lib.optionalAttrs (cfg.environmentFile != null) {
          EnvironmentFile = cfg.environmentFile;
        };
      };
    }

    # System user and group (only when createUser is true)
    (mkIf cfg.createUser {
      users.users.${cfg.user} = {
        isSystemUser = true;
        group = cfg.group;
        home = cfg.dataDir;
        description = "AI Toolkit service user";
      };
      users.groups.${cfg.group} = { };
    })

    # Create data directory via tmpfiles when not using StateDirectory
    (mkIf (!isDefaultDataDir) {
      systemd.tmpfiles.rules = [
        "d ${cfg.dataDir} 0750 ${cfg.user} ${cfg.group} -"
      ];
    })

    # Firewall rules
    (mkIf cfg.openFirewall {
      networking.firewall.allowedTCPPorts = [ cfg.port ];
    })

    (mkIf (cfg.openFirewall && cfg.mdns.enable) {
      networking.firewall.allowedUDPPorts = [ 5353 ];
    })
  ]);
}
