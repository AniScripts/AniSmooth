import subprocess
import shutil
import os
import sys
import datetime

OUTPUT = ""
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gpu_report.txt")

def log(msg):
    global OUTPUT
    print(msg)
    OUTPUT += msg + "\n"

def save_report():
    try:
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.write(OUTPUT)
        log("")
        log("Report saved to: " + LOG_FILE)
    except Exception as e:
        log("Could not save report: " + str(e))

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
        pass
    if not gpu_name:
        return None
    return {
        "name": gpu_name,
        "memory_total_mb": memory_total_mb,
        "driver_version": driver_version,
    }

def _run_wmic_raw(columns):
    try:
        result = subprocess.run(
            ["wmic", "path", "Win32_VideoController", "get", columns, "/format:csv"],
            capture_output=True, text=True, timeout=10
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except Exception as e:
        return -1, "", str(e)

def _run_powershell_gpu():
    try:
        cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json -Compress"'
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15, shell=True)
        if result.returncode == 0 and result.stdout.strip():
            import json
            data = json.loads(result.stdout.strip())
            if isinstance(data, dict):
                data = [data]
            return data
        return None
    except Exception as e:
        return None

def _detect_from_name(name):
    n = name.lower()
    if "nvidia" in n or "geforce" in n or "rtx" in n or "gtx" in n or "quadro" in n:
        return "nvidia"
    if "amd" in n or "radeon" in n or "rx" in n:
        return "amd"
    if "intel" in n or "arc" in n or "uhd" in n or "iris" in n:
        return "intel"
    return "unknown"

log("=" * 60)
log("AniSmooth GPU Detection Test v2")
log("=" * 60)

log("")
log("--- RAW wmic output (all GPUs) ---")
code, out, err = _run_wmic_raw("Name,AdapterRAM,DriverVersion")
log("wmic return code: " + str(code))
log("wmic stdout: " + (out if out else "(empty)"))
log("wmic stderr: " + (err if err else "(none)"))

log("")
log("--- RAW wmic simple ---")
code2, out2, err2 = _run_wmic_raw("Name")
log("wmic return code: " + str(code2))
log("wmic stdout: " + (out2 if out2 else "(empty)"))
log("wmic stderr: " + (err2 if err2 else "(none)"))

log("")
log("--- PowerShell GPU detection ---")
ps = _run_powershell_gpu()
if ps:
    for g in ps:
        log("Found: " + str(g.get("Name", "?")))
        log("  VRAM: " + str(int(g.get("AdapterRAM", 0)) // (1024*1024)) + " MB" if g.get("AdapterRAM") else "  VRAM: N/A")
        log("  Driver: " + str(g.get("DriverVersion", "N/A")))
        vendor = _detect_from_name(str(g.get("Name", "")))
        log("  Detected vendor: " + vendor.upper())
else:
    log("PowerShell detection FAILED")

log("")
log("--- Checking nvidia-smi ---")
smi_path = _find_nvidia_smi()
log("nvidia-smi found: " + (smi_path or "NO"))
if smi_path:
    nvidia = _run_nvidia_smi()
    log("GPU: " + (nvidia["name"] if nvidia else "N/A"))
    log("VRAM: " + (str(nvidia["memory_total_mb"]) + " MB" if nvidia else "N/A"))
    log("Driver: " + (nvidia["driver_version"] if nvidia else "N/A"))
else:
    log("(no NVIDIA driver detected)")

log("")
log("--- CUDA availability ---")
try:
    import torch
    cuda = torch.cuda.is_available()
    log("torch.cuda.is_available(): " + str(cuda))
    if cuda:
        log("CUDA version: " + str(torch.version.cuda))
        log("GPU: " + torch.cuda.get_device_name(0))
except ImportError:
    log("PyTorch not installed - cannot check CUDA")
    cuda = False

log("")
log("============================================================")
log("FINAL: Vendor from nvidia-smi = " + ("nvidia" if _find_nvidia_smi() else "N/A"))
if ps:
    for g in ps:
        v = _detect_from_name(str(g.get("Name","")))
        if v != "unknown":
            log("FINAL: Vendor from PS = " + v + " (" + str(g.get("Name","?")) + ")")
            break
    else:
        log("FINAL: Vendor from PS = unknown")
else:
    log("FINAL: Vendor from PS = N/A")
log("============================================================")

log("")
log("System info:")
log("  Python: " + sys.version.split()[0])
log("  OS: " + sys.platform)
log("  Date: " + datetime.datetime.now().isoformat())

save_report()
