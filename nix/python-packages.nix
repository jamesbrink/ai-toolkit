# Python package overlay for ai-toolkit
# Adds missing packages and pins versions that diverge significantly from nixpkgs
{ pkgs, lib }:

self: super: {
  # === Missing packages (not in nixpkgs) ===

  lycoris-lora = self.buildPythonPackage rec {
    pname = "lycoris-lora";
    version = "1.8.3";
    pyproject = true;

    src = pkgs.fetchPypi {
      pname = "lycoris_lora";
      inherit version;
      hash = "sha256-UnHnhjBCw4gfKmxhD4lmBLHUyDnvEY1ci8/r7QO/v8M=";
    };

    build-system = [ self.setuptools ];

    dependencies = with self; [
      torch
      einops
      safetensors
      transformers
    ];

    doCheck = false;
    pythonImportsCheck = [ "lycoris" ];
  };

  prodigyopt = self.buildPythonPackage rec {
    pname = "prodigyopt";
    version = "1.1.2";
    pyproject = true;

    src = pkgs.fetchPypi {
      inherit pname version;
      hash = "sha256-9u90lEiVybmgBF5V/dBNB72wO58Josd+LsdyydHs4V8=";
    };

    build-system = [ self.setuptools ];

    dependencies = with self; [
      torch
    ];

    doCheck = false;
    pythonImportsCheck = [ "prodigyopt" ];
  };

  controlnet-aux = self.buildPythonPackage rec {
    pname = "controlnet-aux";
    version = "0.0.10";
    pyproject = true;

    src = pkgs.fetchPypi {
      pname = "controlnet_aux";
      inherit version;
      hash = "sha256-MdwmWlREi9zuAzoTC0dCPIBYf6NcysdSETrxtNSPUYM=";
    };

    build-system = [ self.setuptools ];

    dependencies = with self; [
      torch
      transformers
      pillow
      opencv4
      scipy
      timm
      huggingface-hub
    ];

    # Disable checks - requires model downloads
    doCheck = false;
    pythonImportsCheck = [ "controlnet_aux" ];
  };

  pytorch-fid = self.buildPythonPackage rec {
    pname = "pytorch-fid";
    version = "0.3.0";
    pyproject = true;

    src = pkgs.fetchPypi {
      inherit pname version;
      hash = "sha256-HIDREsnPXry8xCigt+phXDAoBa1ngOwp6OKVW6MVccg=";
    };

    build-system = [ self.setuptools ];

    dependencies = with self; [
      torch
      torchvision
      scipy
      pillow
      numpy
    ];

    doCheck = false;
    pythonImportsCheck = [ "pytorch_fid" ];
  };

  optimum-quanto = self.buildPythonPackage rec {
    pname = "optimum-quanto";
    version = "0.2.4";
    pyproject = true;

    src = pkgs.fetchPypi {
      pname = "optimum_quanto";
      inherit version;
      hash = "sha256-Kc7v2ltBH7OkqTb67wdvALy7kGWieoZKihQEl+syPRY=";
    };

    build-system = [ self.setuptools self.setuptools-scm ];

    dependencies = with self; [
      torch
      safetensors
      packaging
    ];

    doCheck = false;
    pythonImportsCheck = [ "optimum" ];
  };

  pytorch-wavelets = self.buildPythonPackage rec {
    pname = "pytorch-wavelets";
    version = "1.3.0";
    pyproject = true;

    src = pkgs.fetchPypi {
      pname = "pytorch_wavelets";
      inherit version;
      hash = "sha256-i1xj+Hwrs25rNCp7spSSa9pc2XRhT7SEjeq27CeS9W8=";
    };

    build-system = [ self.setuptools ];

    dependencies = with self; [
      torch
      numpy
    ];

    # Has optional CUDA extensions; skip build isolation to let torch provide CUDA
    dontUseCmakeConfigure = true;

    doCheck = false;
    pythonImportsCheck = [ "pytorch_wavelets" ];
  };

  # === Version-pinned overrides (nixpkgs versions differ significantly) ===

  # albumentations 2.0.x in nixpkgs has breaking API changes vs 1.4.x
  albumentations = self.buildPythonPackage rec {
    pname = "albumentations";
    version = "1.4.15";
    pyproject = true;

    src = pkgs.fetchPypi {
      inherit pname version;
      hash = "sha256-DobC5SLxLH9BPXZdYJVSO55lp7/j0I+5WZ2YqYkJOkg=";
    };

    build-system = [ self.setuptools ];

    dependencies = with self; [
      numpy
      scipy
      scikit-image
      opencv4
      pyyaml
      albucore
    ];

    doCheck = false;
    pythonImportsCheck = [ "albumentations" ];
  };

  albucore = self.buildPythonPackage rec {
    pname = "albucore";
    version = "0.0.16";
    pyproject = true;

    src = pkgs.fetchPypi {
      inherit pname version;
      hash = "sha256-gUaYK0KO3C8K/7/+NiCRQzVUEM3QW57TPUtwi0lldMY=";
    };

    build-system = [ self.setuptools ];

    dependencies = with self; [
      numpy
      opencv4
    ];

    doCheck = false;
    pythonImportsCheck = [ "albucore" ];
  };

  # diffusers pinned to specific git commit
  diffusers = super.diffusers.overridePythonAttrs (old: rec {
    version = "0.33.0.dev0";
    src = pkgs.fetchFromGitHub {
      owner = "huggingface";
      repo = "diffusers";
      rev = "8600b4c10d67b0ce200f664204358747bd53c775";
      hash = "sha256-h/cZmMjftl6fNRFR4LXCFWazcZ/borw/3Xt/vcn4s3o=";
    };
    # Disable tests since they require model downloads
    doCheck = false;
  });
}
