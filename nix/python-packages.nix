# Python package overlay for ai-toolkit
# Adds missing packages and pins versions that diverge significantly from nixpkgs
{ pkgs, lib }:

self: super:
{
  # === CUDA-enabled PyTorch on Linux ===
  # Use pre-built wheels (torch-bin) that include CUDA runtime libraries.
  # This aliases torch → torch-bin so all transitive dependencies also get CUDA.
}
// lib.optionalAttrs pkgs.stdenv.isLinux {
  torch = super.torch-bin.overridePythonAttrs (old: {
    passthru = (old.passthru or { }) // {
      # Attributes expected by downstream packages (e.g. bitsandbytes)
      cudaSupport = true;
      cudaPackages = pkgs.cudaPackages;
      rocmSupport = false;
      rocmPackages = pkgs.rocmPackages;
    };
  });
  torchvision = super.torchvision-bin;
  torchaudio = super.torchaudio-bin;
}
// {
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
    nativeBuildInputs = [ self.pythonRelaxDepsHook ];
    pythonRelaxDeps = true;

    dependencies = with self; [
      torch
      torchvision
      einops
      safetensors
      transformers
      diffusers
      timm
      peft
      accelerate
    ];

    doCheck = false;
    pythonImportsCheck = [ ];
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

    dependencies = with self; [ torch ];

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
    nativeBuildInputs = [ self.pythonRelaxDepsHook ];
    pythonRelaxDeps = true;
    pythonRemoveDeps = [
      "opencv-python"
      "opencv-python-headless"
    ];

    dependencies = with self; [
      torch
      transformers
      pillow
      opencv4
      scipy
      timm
      huggingface-hub
      einops
      scikit-image
      importlib-metadata
    ];

    doCheck = false;
    pythonImportsCheck = [ ];
  };

  lpips = self.buildPythonPackage rec {
    pname = "lpips";
    version = "0.1.4";
    pyproject = true;

    src = pkgs.fetchPypi {
      inherit pname version;
      hash = "sha256-OEYzHfbGloiuw9MApe7vbFKUNbyEYL1YIBw9YuVhiPo=";
    };

    build-system = [ self.setuptools ];
    nativeBuildInputs = [ self.pythonRelaxDepsHook ];
    pythonRelaxDeps = true;

    dependencies = with self; [
      torch
      torchvision
      numpy
      scipy
      tqdm
    ];

    doCheck = false;
    pythonImportsCheck = [ "lpips" ];
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
    nativeBuildInputs = [ self.pythonRelaxDepsHook ];
    pythonRelaxDeps = true;

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

    build-system = [
      self.setuptools
      self.setuptools-scm
    ];
    nativeBuildInputs = [ self.pythonRelaxDepsHook ];
    pythonRelaxDeps = true;

    dependencies = with self; [
      torch
      safetensors
      packaging
      ninja
    ];

    doCheck = false;
    pythonImportsCheck = [ ];
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
    nativeBuildInputs = [ self.pythonRelaxDepsHook ];
    pythonRelaxDeps = true;

    dependencies = with self; [
      torch
      numpy
      pywavelets
      six
    ];

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
    nativeBuildInputs = [ self.pythonRelaxDepsHook ];
    pythonRelaxDeps = true;
    pythonRemoveDeps = [
      "opencv-python"
      "opencv-python-headless"
      "eval-type-backport"
    ];

    dependencies = with self; [
      numpy
      scipy
      scikit-image
      opencv4
      pyyaml
      pydantic
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
    nativeBuildInputs = [ self.pythonRelaxDepsHook ];
    pythonRelaxDeps = true;
    pythonRemoveDeps = [
      "opencv-python-headless"
      "opencv-python"
    ];

    dependencies = with self; [
      numpy
      opencv4
    ];

    doCheck = false;
    pythonImportsCheck = [ "albucore" ];
  };

  # === nixpkgs package fixes ===

  # accelerate test_convert_to_fp32 fails when torch-bin's inductor can't
  # find a C compiler in the sandbox. The package itself is fine.
  accelerate = super.accelerate.overridePythonAttrs (old: {
    doCheck = false;
  });

  # bitsandbytes needs ninja at build time for CUDA kernels
  bitsandbytes = super.bitsandbytes.overridePythonAttrs (old: {
    nativeBuildInputs = (old.nativeBuildInputs or [ ]) ++ [ self.ninja ];
  });

  # torchao inductor tests fail without a C compiler in the Nix sandbox
  torchao = super.torchao.overridePythonAttrs (old: {
    doCheck = false;
  });

  # timm inductor test fails without a C compiler in the Nix sandbox
  timm = super.timm.overridePythonAttrs (old: {
    doCheck = false;
  });

  # rapidfuzz C extension fails on macOS (libatomic not available with clang)
  rapidfuzz = super.rapidfuzz.overridePythonAttrs (
    old:
    lib.optionalAttrs pkgs.stdenv.isDarwin {
      env = (old.env or { }) // {
        RAPIDFUZZ_BUILD_EXTENSION = "0";
      };
      doCheck = false;
    }
  );

  # mcp has a flaky stdio test that fails in the Nix sandbox
  mcp = super.mcp.overridePythonAttrs (old: {
    doCheck = false;
  });

  # diffusers pinned to specific git commit
  diffusers = super.diffusers.overridePythonAttrs (old: {
    version = "0.37.0.dev0";
    src = pkgs.fetchFromGitHub {
      owner = "huggingface";
      repo = "diffusers";
      rev = "8600b4c10d67b0ce200f664204358747bd53c775";
      hash = "sha256-h/cZmMjftl6fNRFR4LXCFWazcZ/borw/3Xt/vcn4s3o=";
    };
    nativeBuildInputs = (old.nativeBuildInputs or [ ]) ++ [ self.pythonRelaxDepsHook ];
    pythonRelaxDeps = true;
    dependencies = (old.dependencies or [ ]) ++ [ self.httpx ];
    doCheck = false;
  });
}
