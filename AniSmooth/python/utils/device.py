import json
import subprocess
import shutil
import os
import traceback
import torch

def log(msg_type, msg, **kw):
    out = {"type": msg_type, "msg": str(msg)}
    out.update(kw)
    print(json.dumps(out), flush=True)

def get_device(gpu_id=0):
    if torch.cuda.is_available():
        cnt = torch.cuda.device_count()
        safe_id = max(0, min(int(gpu_id or 0), cnt - 1)) if cnt > 0 else 0
        return torch.device(f"cuda:{safe_id}")
    return torch.device("cpu")

def get_device_type():
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"

def get_gpu_vendor():
    if _find_nvidia_smi() is not None:
        return "nvidia"
    if _run_amd_gpu_query() is not None:
        return "amd"
    vendor = _detect_gpu_vendor_wmi()
    if vendor != "unknown":
        return vendor
    if torch.cuda.is_available():
        return "nvidia"
    return "unknown"

def _run_powershell_gpu():
    try:
        cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json -Compress"'
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15, shell=True)
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout.strip())
            if isinstance(data, dict):
                data = [data]
            return data
    except Exception:
        pass
    return None

def _detect_gpu_vendor_wmi():
    data = _run_powershell_gpu()
    if not data:
        try:
            result = subprocess.run(
                ["wmic", "path", "Win32_VideoController", "get", "Name"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                name_lower = result.stdout.strip().lower()
                if "nvidia" in name_lower or "geforce" in name_lower or "rtx" in name_lower or "gtx" in name_lower or "quadro" in name_lower:
                    return "nvidia"
                if "amd" in name_lower or "radeon" in name_lower or "rx" in name_lower:
                    return "amd"
                if "intel" in name_lower or "arc" in name_lower or "uhd" in name_lower or "iris" in name_lower:
                    return "intel"
        except Exception:
            pass
        return "unknown"
    for gpu in data:
        name = str(gpu.get("Name", ""))
        vendor = _name_to_vendor(name)
        if vendor != "unknown":
            return vendor
    return "unknown"

def _find_nvidia_smi():
    nvidia_dirs = [
        r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
        r"C:\Program Files (x86)\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
    ]
    for path in nvidia_dirs:
        if os.path.exists(path):
            return path
    smi = shutil.which("nvidia-smi")
    if smi:
        return smi
    if os.path.exists(r"C:\Windows\System32\nvidia-smi.exe"):
        return r"C:\Windows\System32\nvidia-smi.exe"
    return None

def _run_nvidia_smi():
    smi_path = _find_nvidia_smi()
    if not smi_path:
        return None

    gpus = []
    try:
        result = subprocess.run(
            [smi_path, "--query-gpu=index,name,memory.total,driver_version",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            for line in result.stdout.strip().splitlines():
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 3:
                    idx = int(parts[0]) if parts[0].isdigit() else len(gpus)
                    name = parts[1]
                    mem_total = int(parts[2]) if parts[2].isdigit() else 0
                    drv = parts[3] if len(parts) > 3 else "N/A"
                    gpus.append({
                        "index": idx,
                        "name": name,
                        "memory_total_mb": mem_total,
                        "driver_version": drv,
                        "vendor": "nvidia"
                    })
    except Exception:
        pass

    if gpus:
        return gpus

    gpu_name = None
    memory_total_mb = 0
    driver_version = None
    cuda_driver_version = None

    try:
        result = subprocess.run(
            [smi_path], capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            for line in result.stdout.split("\n"):
                if not gpu_name and "NVIDIA" in line.upper() and "GeForce" in line:
                    gpu_name = line.strip()
                if "CUDA Version:" in line:
                    raw = line.strip().split("CUDA Version:")[-1].strip()
                    cuda_driver_version = raw.split(" ")[0]
                if "Driver Version:" in line:
                    raw = line.strip().split("Driver Version:")[-1].strip()
                    driver_version = raw.split(" ")[0]
    except Exception:
        pass

    if gpu_name:
        return [{
            "index": 0,
            "name": gpu_name,
            "memory_total_mb": memory_total_mb,
            "driver_version": driver_version,
            "cuda_driver_version": cuda_driver_version,
            "vendor": "nvidia"
        }]

    return None

def _name_to_vendor(name):
    n = name.lower()
    if "nvidia" in n or "geforce" in n or "rtx" in n or "gtx" in n or "quadro" in n:
        return "nvidia"
    if "amd" in n or "radeon" in n or "rx" in n:
        return "amd"
    if "intel" in n or "arc" in n or "uhd" in n or "iris" in n:
        return "intel"
    return "unknown"

def _run_amd_gpu_query():
    data = _run_powershell_gpu()
    if not data:
        return None
    amd_gpus = []
    idx = 0
    for gpu in data:
        name = str(gpu.get("Name", ""))
        vendor = _name_to_vendor(name)
        if vendor == "amd":
            mem = gpu.get("AdapterRAM", 0)
            mem_mb = int(mem) // (1024 * 1024) if isinstance(mem, (int, float)) and mem > 0 else 0
            amd_gpus.append({
                "index": idx,
                "name": name,
                "memory_total_mb": mem_mb,
                "driver_version": str(gpu.get("DriverVersion", "")),
                "vendor": "amd"
            })
            idx += 1
    return amd_gpus if amd_gpus else None

def _pytorch_has_cuda():
    ver = torch.__version__
    return "+cu" in ver or "+cuda" in ver

def get_gpu_info():
    nvidia_list = _run_nvidia_smi()
    amd_list = _run_amd_gpu_query()
    torch_cuda = torch.cuda.is_available()
    torch_has_cuda_build = _pytorch_has_cuda()

    vendor = get_gpu_vendor()
    dev_type = get_device_type()

    gpus = []
    if torch_cuda and torch.cuda.device_count() > 0:
        for i in range(torch.cuda.device_count()):
            prop = torch.cuda.get_device_properties(i)
            tot_mb = prop.total_memory // (1024 * 1024)
            free_mb = 0
            try:
                fb, _ = torch.cuda.mem_get_info(i)
                free_mb = fb // (1024 * 1024)
            except Exception:
                pass
            gpus.append({
                "index": i,
                "id": str(i),
                "name": torch.cuda.get_device_name(i),
                "memory_total_mb": tot_mb,
                "memory_free_mb": free_mb,
                "vendor": "nvidia"
            })
    elif nvidia_list:
        for item in nvidia_list:
            item["id"] = str(item["index"])
            gpus.append(item)
    elif amd_list:
        for item in amd_list:
            item["id"] = str(item["index"])
            gpus.append(item)

    primary = gpus[0] if gpus else {}
    gpu_name = primary.get("name")
    gpu_mem_total = primary.get("memory_total_mb", 0)
    gpu_mem_free = primary.get("memory_free_mb", 0)

    vulkan_available = False
    if os.name == "nt":
        sys32_vulkan = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "vulkan-1.dll")
        if os.path.exists(sys32_vulkan):
            vulkan_available = True
        elif shutil.which("vulkan-1.dll") is not None or shutil.which("vulkaninfo") is not None:
            vulkan_available = True
    else:
        vulkan_available = shutil.which("vulkaninfo") is not None

    info = {
        "gpu_vendor": vendor,
        "device_type": dev_type,
        "cuda_available": torch_cuda,
        "vulkan_available": vulkan_available,
        "dml_available": False,
        "device": dev_type,
        "gpu_name": gpu_name,
        "gpu_memory_total_mb": gpu_mem_total,
        "gpu_memory_free_mb": gpu_mem_free,
        "cuda_version": torch.version.cuda if torch_cuda else None,
        "gpu_count": len(gpus) if gpus else (torch.cuda.device_count() if torch_cuda else 0),
        "gpus": gpus,
        "pytorch_variant": "cuda" if torch_has_cuda_build else "cpu",
        "nvidia_gpu_detected": vendor == "nvidia",
        "amd_gpu_detected": vendor == "amd",
        "nvidia_name": primary.get("name") if vendor == "nvidia" else None,
        "nvidia_driver": primary.get("driver_version") if vendor == "nvidia" else None,
        "nvidia_cuda_ver": primary.get("cuda_driver_version") if vendor == "nvidia" else None,
        "nvidia_vram_mb": gpu_mem_total if vendor == "nvidia" else 0,
        "amd_name": primary.get("name") if vendor == "amd" else None,
        "amd_driver": primary.get("driver_version") if vendor == "amd" else None,
        "amd_vram_mb": gpu_mem_total if vendor == "amd" else 0,
        "spandrel_available": False,
        "spandrel_version": None,
    }

    try:
        import spandrel
        info["spandrel_available"] = True
        info["spandrel_version"] = spandrel.__version__
    except ImportError:
        pass

    return info

def check_tensorrt():
    try:
        import tensorrt
        return True
    except ImportError:
        return False

def print_gpu_info():
    info = get_gpu_info()
    log("info", "=== GPU Detection Report ===")
    log("info", "Vendor: " + str(info["gpu_vendor"]))
    log("info", "Device type: " + str(info["device_type"]))
    log("info", "PyTorch variant: " + info["pytorch_variant"])
    log("info", "CUDA available to PyTorch: " + str(info["cuda_available"]))

    if info["cuda_available"]:
        log("info", "NVIDIA GPU: " + str(info["gpu_name"]))
        log("info", "CUDA version: " + str(info["cuda_version"]))
        log("info", "VRAM: " + str(info["gpu_memory_free_mb"]) + "/" + str(info["gpu_memory_total_mb"]) + " MB")
        log("info", "TensorRT: " + str(check_tensorrt()))
    elif info["amd_gpu_detected"]:
        log("info", "AMD GPU: " + str(info["gpu_name"]))
        log("info", "VRAM: " + str(info["amd_vram_mb"]) + " MB")
    else:
        log("warn", "No supported GPU detected. Models run on CPU (slow).")

    log("info", "==============================")
    return info
