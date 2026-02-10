import os
from accelerate import Accelerator
from diffusers.utils.torch_utils import is_compiled_module

global_accelerator = None


def get_accelerator() -> Accelerator:
    global global_accelerator
    if global_accelerator is None:
        # Allow forcing CPU mode via environment variable.  On Apple Silicon the
        # Accelerator auto-detects MPS, but some workloads (e.g. quantized
        # backward pass) crash on MPS and need a true CPU fallback.
        force_cpu = os.environ.get("AITK_FORCE_CPU", "0") == "1"
        global_accelerator = Accelerator(cpu=force_cpu)
    return global_accelerator

def unwrap_model(model):
    try:
        accelerator = get_accelerator()
        model = accelerator.unwrap_model(model)
        model = model._orig_mod if is_compiled_module(model) else model
    except Exception as e:
        pass
    return model
