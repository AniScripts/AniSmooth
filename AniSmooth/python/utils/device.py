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

def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    try:
        import torch_directml
        return torch_directml.device()
    except ImportError:
        pass
    return torch.device("cpu")

def get_device_type():
    if torch.cuda.is_available():
        return "cuda"
    try:
        import torch_directml
        return "dml"
    except ImportError:
        pass
    return "cpu"

def get_gpu_vendor():
    dev_type = get_device_type()
    if dev_type == "cuda":
        return "nvidia"
    if dev_type == "dml":
        return _detect_dml_vendor()
    return _detect_gpu_vendor_wmi()

def _detect_dml_vendor():
    try:
        import torch_directml
        dev = torch_directml.device()
        name = str(dev)
        name_lower = name.lower()
        if "nvidia" in name_lower or "geforce" in name_lower or "rtx" in name_lower or "gtx" in name_lower or "quadro" in name_lower:
            return "nvidia"
        if "amd" in name_lower or "radeon" in name_lower or "rx" in name_lower:
            return "amd"
        if "intel" in name_lower or "arc" in name_lower or "uhd" in name_lower or "iris" in name_lower:
            return "intel"
    except Exception:
        pass
    return "unknown"

def _detect_gpu_vendor_wmi():
    try:
        ps_cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"'
        result = subprocess.run(ps_cmd, capture_output=True, text=True, timeout=10, shell=True)
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

    gpu_name = None
    memory_total_mb = 0
    driver_version = None
    cuda_driver_version = None

    try:
        result = subprocess.run(
            [smi_path, "--query-gpu=name,memory.total,driver_version",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = [p.strip() for p in result.stdout.strip().split(",")]
            if len(parts) >= 2:
                gpu_name = parts[0]
                if parts[1].isdigit():
                    memory_total_mb = int(parts[1])
                if len(parts) > 2 and parts[2].lower() != "n/a":
                    driver_version = parts[2]
    except Exception:
        log("warn", "nvidia-smi CSV parsing failed", trace=traceback.format_exc())

    if not gpu_name or not driver_version:
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
            log("warn", "nvidia-smi full output parsing failed", trace=traceback.format_exc())

    if not gpu_name:
        return None

    return {
        "name": gpu_name,
        "memory_total_mb": memory_total_mb,
        "driver_version": driver_version,
        "cuda_driver_version": cuda_driver_version,
    }

def _run_amd_gpu_query():
    try:
        ps_cmd = (
            'powershell -NoProfile -Command "'
            '$gpu = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match ''(AMD|Radeon|RX)'' } | Select-Object -First 1;'
            'if ($gpu) { Write-Output ($gpu.Name + ''|'' + [math]::Round($gpu.AdapterRAM/1MB) + ''|'' + $gpu.DriverVersion) }"'
        )
        result = subprocess.run(ps_cmd, capture_output=True, text=True, timeout=10, shell=True)
        if result.returncode == 0 and result.stdout.strip():
            parts = result.stdout.strip().split("|")
            if len(parts) >= 2:
                return {
                    "name": parts[0].strip(),
                    "memory_total_mb": int(parts[1]) if parts[1].isdigit() else 0,
                    "driver_version": parts[2].strip() if len(parts) > 2 else None,
                }
    except Exception:
        pass
    return None

def _pytorch_has_cuda():
    ver = torch.__version__
    return "+cu" in ver or "+cuda" in ver

def get_gpu_info():
    nvidia = _run_nvidia_smi()
    amd = _run_amd_gpu_query() if not nvidia else None
    torch_cuda = torch.cuda.is_available()
    torch_has_cuda_build = _pytorch_has_cuda()
    dml_available = False
    try:
        import torch_directml
        dml_available = True
    except ImportError:
        pass

    vendor = get_gpu_vendor()
    dev_type = get_device_type()

    gpu_name = None
    gpu_mem_total = 0
    gpu_mem_free = 0

    if torch_cuda:
        gpu_name = torch.cuda.get_device_name(0) if torch.cuda.device_count() > 0 else None
        gpu_mem_total = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024) if torch.cuda.device_count() > 0 else 0
        try:
            free_bytes, total_bytes = torch.cuda.mem_get_info(0)
            gpu_mem_free = free_bytes // (1024 * 1024)
        except Exception:
            pass
    elif dml_available:
        try:
            import torch_directml
            dev = torch_directml.device()
            gpu_name = str(dev)
        except Exception:
            pass
        if amd:
            gpu_name = amd["name"]
            gpu_mem_total = amd["memory_total_mb"]
    elif nvidia:
        gpu_name = nvidia["name"]
        gpu_mem_total = nvidia["memory_total_mb"]
    elif amd:
        gpu_name = amd["name"]
        gpu_mem_total = amd["memory_total_mb"]

    info = {
        "gpu_vendor": vendor,
        "device_type": dev_type,
        "cuda_available": torch_cuda,
        "dml_available": dml_available,
        "device": dev_type,
        "gpu_name": gpu_name,
        "gpu_memory_total_mb": gpu_mem_total,
        "gpu_memory_free_mb": gpu_mem_free,
        "cuda_version": torch.version.cuda if torch_cuda else None,
        "gpu_count": torch.cuda.device_count() if torch_cuda else (1 if (nvidia or amd) else 0),
        "pytorch_variant": "cuda" if torch_has_cuda_build else ("dml" if dml_available else "cpu"),
        "nvidia_gpu_detected": vendor == "nvidia",
        "amd_gpu_detected": vendor == "amd",
        "nvidia_name": nvidia["name"] if nvidia else None,
        "nvidia_driver": nvidia["driver_version"] if nvidia else None,
        "nvidia_cuda_ver": nvidia["cuda_driver_version"] if nvidia else None,
        "nvidia_vram_mb": nvidia["memory_total_mb"] if nvidia else 0,
        "amd_name": amd["name"] if amd else None,
        "amd_driver": amd["driver_version"] if amd else None,
        "amd_vram_mb": amd["memory_total_mb"] if amd else 0,
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
    log("info", "DirectML available: " + str(info["dml_available"]))

    if info["cuda_available"]:
        log("info", "NVIDIA GPU: " + str(info["gpu_name"]))
        log("info", "CUDA version: " + str(info["cuda_version"]))
        log("info", "VRAM: " + str(info["gpu_memory_free_mb"]) + "/" + str(info["gpu_memory_total_mb"]) + " MB")
        log("info", "TensorRT: " + str(check_tensorrt()))
    elif info["amd_gpu_detected"]:
        log("info", "AMD GPU: " + str(info["gpu_name"]))
        log("info", "DirectML: " + ("available" if info["dml_available"] else "not installed"))
        log("info", "VRAM: " + str(info["amd_vram_mb"]) + " MB")
    else:
        log("warn", "No supported GPU detected. Models run on CPU (slow).")

    log("info", "==============================")
    return info
