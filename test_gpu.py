import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

from utils.device import get_gpu_info, get_gpu_vendor, get_device_type, _run_nvidia_smi, _run_amd_gpu_query, _detect_gpu_vendor_wmi, _find_nvidia_smi

print("=" * 60)
print("AniSmooth GPU Detection Test")
print("=" * 60)

print()
print("--- Step 1: nvidia-smi check ---")
smi_path = _find_nvidia_smi()
print("_find_nvidia_smi() =", smi_path)
if smi_path:
    nvidia = _run_nvidia_smi()
    print("_run_nvidia_smi() =", nvidia)
else:
    print("nvidia-smi not found (no NVIDIA driver or not in PATH)")

print()
print("--- Step 2: AMD GPU query (wmic) ---")
amd = _run_amd_gpu_query()
print("_run_amd_gpu_query() =", amd)

print()
print("--- Step 3: WMI fallback (wmic general) ---")
wmi = _detect_gpu_vendor_wmi()
print("_detect_gpu_vendor_wmi() =", wmi)

print()
print("--- Step 4: CUDA availability ---")
import torch
print("torch.cuda.is_available() =", torch.cuda.is_available())

print()
print("--- Step 5: Final vendor ---")
vendor = get_gpu_vendor()
print("get_gpu_vendor() =", vendor)
print("(Checks in order: nvidia-smi -> wmic AMD -> wmic general -> CUDA fallback)")

print()
print("--- Step 6: Full GPU info ---")
info = get_gpu_info()
for k, v in sorted(info.items()):
    print("  {} = {}".format(k, v))

print()
print("Done.")
input("Press Enter to exit...")
