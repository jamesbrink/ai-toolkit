"""Device utilities for MPS/CUDA/CPU compatibility."""
import gc
import torch


def is_mps_available():
    return hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()


def is_cuda_available():
    return torch.cuda.is_available()


def get_device():
    if is_mps_available():
        return torch.device("mps")
    elif is_cuda_available():
        return torch.device("cuda")
    return torch.device("cpu")


def get_device_name():
    if is_mps_available():
        return "mps"
    elif is_cuda_available():
        return "cuda"
    return "cpu"


def empty_cache():
    gc.collect()
    if is_mps_available():
        torch.mps.empty_cache()
    elif is_cuda_available():
        torch.cuda.empty_cache()


def manual_seed(seed):
    torch.manual_seed(seed)
    if is_mps_available():
        torch.mps.manual_seed(seed)
    elif is_cuda_available():
        torch.cuda.manual_seed(seed)


def synchronize():
    if is_mps_available():
        torch.mps.synchronize()
    elif is_cuda_available():
        torch.cuda.synchronize()


def autocast(dtype=None):
    if is_mps_available():
        return torch.autocast(device_type='mps', dtype=dtype) if dtype else torch.autocast(device_type='mps')
    elif is_cuda_available():
        return torch.autocast(device_type='cuda', dtype=dtype) if dtype else torch.autocast(device_type='cuda')
    return torch.autocast(device_type='cpu', dtype=dtype) if dtype else torch.autocast(device_type='cpu')
