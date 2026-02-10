import os
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
os.environ["NO_ALBUMENTATIONS_UPDATE"] = "1"
import warnings
import sys
from typing import Union, OrderedDict
from dotenv import load_dotenv
# Load the .env file if it exists
load_dotenv()

sys.path.insert(0, os.getcwd())
# must come before ANY torch or fastai imports
# import toolkit.cuda_malloc

# turn off diffusers telemetry until I can figure out how to make it opt-in
os.environ['DISABLE_TELEMETRY'] = 'YES'

# check if we have DEBUG_TOOLKIT in env
if os.environ.get("DEBUG_TOOLKIT", "0") == "1":
    # set torch to trace mode
    import torch
    torch.autograd.set_detect_anomaly(True)

# Suppress harmless CUDA autocast warnings on non-CUDA systems (MPS/CPU).
# Libraries like diffusers and accelerate may reference device_type='cuda'
# in autocast calls even when CUDA is unavailable.
warnings.filterwarnings(
    "ignore",
    message="User provided device_type of 'cuda', but CUDA is not available",
    category=UserWarning,
)

# Workaround for PyTorch 2.9.x MPS bug: torch.cat and torch.stack crash with
# SIGTRAP on Apple Silicon. Replace with pre-allocated tensor + slice assignment.
# Two layers of patching are needed:
#   1. Python-level: monkey-patch torch.cat/stack for direct Python calls
#   2. Dispatch-level: TorchDispatchMode for C++ autograd backward calls
import torch as _torch
if hasattr(_torch.backends, 'mps') and _torch.backends.mps.is_available():
    from torch.utils._python_dispatch import TorchDispatchMode as _TorchDispatchMode

    def _safe_cat_impl(tensors, dim=0):
        ndim = tensors[0].ndim
        if dim < 0:
            dim = ndim + dim
        cat_size = sum(t.shape[dim] for t in tensors)
        out_shape = list(tensors[0].shape)
        out_shape[dim] = cat_size
        result = _torch.empty(out_shape, dtype=tensors[0].dtype, device=tensors[0].device)
        offset = 0
        for t in tensors:
            size = t.shape[dim]
            slices = [slice(None)] * ndim
            slices[dim] = slice(offset, offset + size)
            result[tuple(slices)] = t
            offset += size
        return result

    # Layer 1: Python-level monkey-patch
    _original_cat = _torch.cat

    def _mps_safe_cat(tensors, dim=0, *, out=None):
        if not tensors or not tensors[0].is_mps or out is not None:
            return _original_cat(tensors, dim=dim, out=out)
        return _safe_cat_impl(tensors, dim)

    _original_stack = _torch.stack

    def _mps_safe_stack(tensors, dim=0, *, out=None):
        if not tensors or not tensors[0].is_mps or out is not None:
            return _original_stack(tensors, dim=dim, out=out)
        return _safe_cat_impl([t.unsqueeze(dim) for t in tensors], dim)

    _torch.cat = _mps_safe_cat
    _torch.concat = _mps_safe_cat
    _torch.stack = _mps_safe_stack

    # Layer 2: Dispatch-level interception for C++ autograd backward passes
    class _MPSCatFixMode(_TorchDispatchMode):
        def __torch_dispatch__(self, func, types, args, kwargs=None):
            kwargs = kwargs or {}
            if func in (_torch.ops.aten.cat.default,):
                tensors = args[0]
                dim = args[1] if len(args) > 1 else 0
                if tensors and tensors[0].is_mps:
                    return _safe_cat_impl(tensors, dim)
            elif func == _torch.ops.aten.stack.default:
                tensors = args[0]
                dim = args[1] if len(args) > 1 else 0
                if tensors and tensors[0].is_mps:
                    return _safe_cat_impl([t.unsqueeze(dim) for t in tensors], dim)
            return func(*args, **kwargs)

    # Enable the dispatch mode globally
    _mps_cat_fix = _MPSCatFixMode()
    _mps_cat_fix.__enter__()

import argparse
from toolkit.job import get_job
from toolkit.accelerator import get_accelerator
from toolkit.print import print_acc, setup_log_to_file

accelerator = get_accelerator()


def print_end_message(jobs_completed, jobs_failed):
    if not accelerator.is_main_process:
        return
    failure_string = f"{jobs_failed} failure{'' if jobs_failed == 1 else 's'}" if jobs_failed > 0 else ""
    completed_string = f"{jobs_completed} completed job{'' if jobs_completed == 1 else 's'}"

    print_acc("")
    print_acc("========================================")
    print_acc("Result:")
    if len(completed_string) > 0:
        print_acc(f" - {completed_string}")
    if len(failure_string) > 0:
        print_acc(f" - {failure_string}")
    print_acc("========================================")


def main():
    parser = argparse.ArgumentParser()

    # require at lease one config file
    parser.add_argument(
        'config_file_list',
        nargs='+',
        type=str,
        help='Name of config file (eg: person_v1 for config/person_v1.json/yaml), or full path if it is not in config folder, you can pass multiple config files and run them all sequentially'
    )

    # flag to continue if failed job
    parser.add_argument(
        '-r', '--recover',
        action='store_true',
        help='Continue running additional jobs even if a job fails'
    )

    # flag to continue if failed job
    parser.add_argument(
        '-n', '--name',
        type=str,
        default=None,
        help='Name to replace [name] tag in config file, useful for shared config file'
    )
    
    parser.add_argument(
        '-l', '--log',
        type=str,
        default=None,
        help='Log file to write output to'
    )
    args = parser.parse_args()
    
    if args.log is not None:
        setup_log_to_file(args.log)

    config_file_list = args.config_file_list
    if len(config_file_list) == 0:
        raise Exception("You must provide at least one config file")

    jobs_completed = 0
    jobs_failed = 0

    if accelerator.is_main_process:
        print_acc(f"Running {len(config_file_list)} job{'' if len(config_file_list) == 1 else 's'}")

    for config_file in config_file_list:
        try:
            job = get_job(config_file, args.name)
            job.run()
            job.cleanup()
            jobs_completed += 1
        except Exception as e:
            print_acc(f"Error running job: {e}")
            jobs_failed += 1
            try:
                job.process[0].on_error(e)
            except Exception as e2:
                print_acc(f"Error running on_error: {e2}")
            if not args.recover:
                print_end_message(jobs_completed, jobs_failed)
                raise e
        except KeyboardInterrupt as e:
            try:
                job.process[0].on_error(e)
            except Exception as e2:
                print_acc(f"Error running on_error: {e2}")
            if not args.recover:
                print_end_message(jobs_completed, jobs_failed)
                raise e


if __name__ == '__main__':
    main()
