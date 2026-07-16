import sys, os, json, shutil, tempfile, zipfile, io, subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_DIR = os.path.join(SCRIPT_DIR, ".venv")
VENV_PYTHON = os.path.join(VENV_DIR, "Scripts", "python.exe") if os.name == "nt" else os.path.join(VENV_DIR, "bin", "python")
VENV_PIP = os.path.join(VENV_DIR, "Scripts", "pip.exe") if os.name == "nt" else os.path.join(VENV_DIR, "bin", "pip")

FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

# torch/torchvision pins depend on the running interpreter version. torch 2.4.1 /
# torchvision 0.19.1 ship cp310-cp312 wheels (no cp313 build exists on PyPI or the
# CUDA index). Python 3.13 is the current python.org default, so on a fresh box the
# system interpreter needs the newer pair that has cp313 wheels (torchvision cp313
# support starts at 0.21.0 / torch 2.6.0).
if sys.version_info >= (3, 13):
    TORCH_PIN = "torch>=2.6.0"
    TORCHVISION_PIN = "torchvision>=0.21.0"
else:
    TORCH_PIN = "torch==2.4.1"
    TORCHVISION_PIN = "torchvision==0.19.1"

PIP_PACKAGES = [
    TORCH_PIN,
    TORCHVISION_PIN,
    "opencv-python>=4.10.0.84",
    "numpy>=1.24.0,<3.0",
    "spandrel==0.3.4",
    # main.py imports psutil for the system monitor's CPU/RAM metrics. The import
    # is guarded (degrades gracefully if absent), but it is a real backend
    # dependency for a shipped feature, so install it for a complete environment.
    "psutil>=5.9.0"
]

def log(msg_type, msg, **kw):
    out = {"type": msg_type, "msg": str(msg)}
    out.update(kw)
    print(json.dumps(out), flush=True)

# Set to True when ensure_venv() returned a real .venv, False when it fell back
# to installing into the current interpreter (e.g. the embeddable Python which
# ships without venv/ensurepip).
USING_VENV = False

def ensure_venv():
    """Create virtual environment if it doesn't exist. Returns path to a usable
    python (the venv python, or the current interpreter as a fallback). Returns
    None only on hard failure."""
    global USING_VENV

    if os.path.exists(VENV_PYTHON):
        log("info", f"Virtual environment found at {VENV_DIR}")
        USING_VENV = True
        return VENV_PYTHON

    # The Windows embeddable Python distribution (used by the setup wizard's
    # "Install Python First" path) ships without the venv/ensurepip modules, so
    # `python -m venv` cannot work. Detect that and fall back to installing
    # packages directly into the current interpreter instead.
    try:
        chk = subprocess.run(
            [sys.executable, "-c", "import venv, ensurepip"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30
        )
        venv_available = chk.returncode == 0
    except Exception:
        venv_available = False

    if not venv_available:
        log("info", "venv/ensurepip unavailable (embeddable Python?). "
                     "Installing packages into the current interpreter instead.")
        USING_VENV = False
        return sys.executable

    log("info", f"Creating virtual environment at {VENV_DIR}...")
    try:
        subprocess.check_call([sys.executable, "-m", "venv", VENV_DIR], timeout=120)
        log("success", "Virtual environment created")
        log("venv", VENV_PYTHON)
        USING_VENV = True
        return VENV_PYTHON
    except Exception as e:
        log("error", f"Failed to create venv: {e}")
        return None

def download_file(url, dest_path, label, attempts=3):
    """Download a file with progress reporting and bounded retry. Returns True on success."""
    import urllib.request
    import time

    for attempt in range(1, attempts + 1):
        if attempt == 1:
            log("info", f"Downloading {label}...", pct=0)
        else:
            log("info", f"Retrying download of {label} (attempt {attempt}/{attempts})...", pct=0)

        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AniSmooth/1.0"})
            resp = urllib.request.urlopen(req, timeout=30)
        except Exception as e:
            log("warn", f"Could not connect to download server: {e}")
            if attempt < attempts:
                time.sleep(2 * attempt)
                continue
            log("error", f"Could not connect to download server after {attempts} attempts: {e}")
            return False

        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 65536

        try:
            with open(dest_path, "wb") as f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = min(99, int(downloaded * 100 / total))
                        if downloaded % (chunk_size * 8) < chunk_size:
                            log("progress", f"Downloading {label}: {pct}%", pct=pct, done=downloaded, total=total)
        except Exception as e:
            log("warn", f"Download interrupted: {e}")
            try:
                os.unlink(dest_path)
            except Exception:
                pass
            if attempt < attempts:
                time.sleep(2 * attempt)
                continue
            log("error", f"Download failed after {attempts} attempts: {e}")
            return False

        log("progress", f"Downloading {label}: 100%", pct=100, done=downloaded, total=total)
        return True

    return False

def find_in_zip(zip_path, exe_name, dest_dir):
    """Extract a single .exe from a zip, searching recursively."""
    import fnmatch
    result = None
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                base = os.path.basename(member)
                if base.lower() == exe_name.lower():
                    dest = os.path.join(dest_dir, base)
                    zf.extract(member, dest_dir)
                    extracted = os.path.join(dest_dir, member)
                    if extracted != dest:
                        shutil.move(extracted, dest)
                    result = dest
        return result
    except Exception as e:
        log("warn", f"Zip extraction error: {e}")
        return None

def _download_and_verify_ffmpeg_zip(zip_path):
    """Download the FFmpeg zip and verify it against its .sha256 sidecar.

    Returns one of:
      "ok"       - zip downloaded and checksum verified (or sidecar genuinely
                    unavailable, in which case we proceed without verification).
      "mismatch" - zip downloaded but checksum did not match (caller may retry;
                    the rolling gyan build can rotate between the two GETs).
      "fail"     - zip could not be downloaded at all.
    Leaves zip_path in place on "ok"/"mismatch"; cleans up its own sidecar.
    """
    if not download_file(FFMPEG_URL, zip_path, "FFmpeg"):
        return "fail"

    sha_path = zip_path + ".sha256"
    if not download_file(FFMPEG_URL + ".sha256", sha_path, "FFmpeg checksum"):
        # A genuine 404/absent sidecar: proceed without verification.
        log("warn", "Checksum sidecar unavailable, proceeding without verification.")
        return "ok"

    try:
        with open(sha_path, "r", encoding="utf-8") as sf:
            expected_sha = sf.read().strip().split()[0].lower()
        import hashlib
        sha256 = hashlib.sha256()
        with open(zip_path, "rb") as f:
            while True:
                data = f.read(65536)
                if not data:
                    break
                sha256.update(data)
        calculated_sha = sha256.hexdigest().lower()
    except Exception as e:
        log("error", f"Failed to verify FFmpeg checksum: {e}")
        try:
            os.unlink(zip_path); os.unlink(sha_path)
        except Exception:
            pass
        return "fail"
    finally:
        try:
            os.unlink(sha_path)
        except Exception:
            pass

    if calculated_sha != expected_sha:
        log("warn", f"FFmpeg checksum mismatch. Expected: {expected_sha}, Got: {calculated_sha}")
        return "mismatch"

    log("info", "FFmpeg checksum verified successfully.")
    return "ok"

def install_ffmpeg():
    """Download and install ffmpeg.exe and ffprobe.exe with SHA-256 integrity verification."""
    ffmpeg_exe = os.path.join(SCRIPT_DIR, "ffmpeg.exe")
    ffprobe_exe = os.path.join(SCRIPT_DIR, "ffprobe.exe")

    if os.path.exists(ffmpeg_exe) and os.path.exists(ffprobe_exe):
        log("info", "FFmpeg already installed")
        log("done", "ffmpeg", path=ffmpeg_exe)
        log("done", "ffprobe", path=ffprobe_exe)
        return True

    zip_path = os.path.join(SCRIPT_DIR, "_ffmpeg_download.zip")

    # The gyan 'ffmpeg-release-essentials.zip' is a rolling build: it can rotate
    # between the zip GET and the sha GET, producing a spurious mismatch. Retry
    # the zip+sha download once before giving up.
    status = _download_and_verify_ffmpeg_zip(zip_path)
    if status == "mismatch":
        log("info", "Retrying FFmpeg download once (rolling build may have rotated)...")
        try:
            os.unlink(zip_path)
        except Exception:
            pass
        status = _download_and_verify_ffmpeg_zip(zip_path)

    if status == "fail":
        return False
    if status == "mismatch":
        log("error", "FFmpeg checksum verification failed after retry.")
        try:
            os.unlink(zip_path)
        except Exception:
            pass
        return False

    log("info", "Extracting FFmpeg...")
    ffmpeg_found = find_in_zip(zip_path, "ffmpeg.exe", SCRIPT_DIR)
    ffprobe_found = find_in_zip(zip_path, "ffprobe.exe", SCRIPT_DIR)

    try:
        os.unlink(zip_path)
    except Exception:
        pass

    if ffmpeg_found and ffprobe_found:
        log("info", "FFmpeg installed successfully")
        log("done", "ffmpeg", path=ffmpeg_found)
        log("done", "ffprobe", path=ffprobe_found)
        return True
    else:
        log("error", "Could not extract FFmpeg from the downloaded archive")
        return False

def _find_nvidia_smi():
    """Find nvidia-smi executable. Prefers NVIDIA's install dir over System32 stub."""
    import shutil

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

def _get_cuda_version_from_smi(smi_path):
    """Run nvidia-smi and extract CUDA version. Returns version string or None."""
    try:
        result = subprocess.run(
            [smi_path], capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return None

        for line in result.stdout.split("\n"):
            if "CUDA Version:" in line:
                raw = line.strip().split("CUDA Version:")[-1].strip()
                return raw.split(" ")[0]

        result2 = subprocess.run(
            [smi_path, "--query-gpu=driver_version", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10
        )
        if result2.returncode == 0:
            driver = result2.stdout.strip().split(".")[0]
            driver_int = int(driver) if driver.isdigit() else 0
            if driver_int >= 570: return "12.6"
            if driver_int >= 550: return "12.4"
            if driver_int >= 525: return "12.0"
            if driver_int >= 470: return "11.4"
    except Exception:
        pass
    return None

def _detect_cuda_pytorch_index():
    """Detect CUDA version and return appropriate PyTorch index URL."""
    import shutil

    nvidia_paths = [
        r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
        r"C:\Program Files (x86)\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
    ]
    for p in nvidia_paths:
        if not os.path.exists(p):
            continue
        ver = _get_cuda_version_from_smi(p)
        if ver:
            log("info", f"nvidia-smi: {p} -> CUDA {ver}")
            major = int(ver.split(".")[0])
            return "https://download.pytorch.org/whl/cu124" if major >= 12 else "https://download.pytorch.org/whl/cu118"

    smi = shutil.which("nvidia-smi")
    if smi:
        ver = _get_cuda_version_from_smi(smi)
        if ver:
            log("info", f"nvidia-smi: {smi} -> CUDA {ver}")
            major = int(ver.split(".")[0])
            return "https://download.pytorch.org/whl/cu124" if major >= 12 else "https://download.pytorch.org/whl/cu118"

    if os.path.exists(r"C:\Windows\System32\nvidia-smi.exe"):
        ver = _get_cuda_version_from_smi(r"C:\Windows\System32\nvidia-smi.exe")
        if ver:
            log("info", f"nvidia-smi: System32 -> CUDA {ver}")
            major = int(ver.split(".")[0])
            return "https://download.pytorch.org/whl/cu124" if major >= 12 else "https://download.pytorch.org/whl/cu118"

    return None

def _run_pip(venv_python, args):
    """Run pip inside the venv and stream output. Returns exit code."""
    cmd = [venv_python, "-m", "pip"] + list(args)
    # For network-bound install operations, make pip resilient to transient
    # registry/index hiccups.
    if args and args[0] == "install":
        if "--retries" not in cmd:
            cmd += ["--retries", "5"]
        if "--timeout" not in cmd:
            cmd += ["--timeout", "120"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in proc.stdout:
        log("pip", line.strip())
    proc.wait()
    return proc.returncode

def _bare_name(pin):
    """Return the bare package name from a pin like 'torch==2.4.1' or 'numpy>=1.24.0,<3.0'."""
    return pin.split("==")[0].split(">=")[0].split("<")[0].split(">")[0].strip()

def _installed_version_ok(installed, pin):
    """Return True if the installed version string satisfies the constraint in pin.
    Supports the simple ==/>=/< forms (and comma-combined) used in PIP_PACKAGES.
    Falls back to True (assume satisfied) if the constraint can't be parsed."""
    try:
        try:
            from packaging.version import Version
            from packaging.specifiers import SpecifierSet
        except Exception:
            # `packaging` is not a declared dependency and is absent on a fresh
            # embeddable Python; pip always vendors it, so fall back to that.
            from pip._vendor.packaging.version import Version
            from pip._vendor.packaging.specifiers import SpecifierSet
        spec_part = pin[len(_bare_name(pin)):].strip()
        if not spec_part:
            return True
        return Version(installed) in SpecifierSet(spec_part)
    except Exception:
        # packaging may be unavailable on a fresh embeddable Python; do a best
        # effort exact-pin check, otherwise assume satisfied.
        try:
            if "==" in pin and ">=" not in pin and "<" not in pin:
                return installed.strip() == pin.split("==", 1)[1].strip()
        except Exception:
            pass
        return True

def _installed_version(venv_python, pkg_name):
    """Return the installed version string for pkg_name, or None if not installed."""
    try:
        out = subprocess.check_output(
            [venv_python, "-m", "pip", "show", pkg_name],
            stderr=subprocess.DEVNULL, timeout=15, text=True
        )
    except Exception:
        return None
    for line in out.splitlines():
        if line.lower().startswith("version:"):
            return line.split(":", 1)[1].strip()
    return ""

def _compute_missing(venv_python, packages):
    """Return the subset of `packages` (full pin strings) that are not installed
    or whose installed version does not satisfy the pin's constraint."""
    missing = []
    for pkg in packages:
        installed = _installed_version(venv_python, _bare_name(pkg))
        if installed is None:
            missing.append(pkg)
        elif not _installed_version_ok(installed, pkg):
            log("info", f"{_bare_name(pkg)} {installed} does not satisfy '{pkg}', will reinstall")
            missing.append(pkg)
    return missing

def install_non_torch_packages(venv_python):
    """Install/repair the non-torch PIP_PACKAGES (opencv-python, numpy, spandrel).
    Returns True on success."""
    non_torch = [p for p in PIP_PACKAGES if _bare_name(p) not in ("torch", "torchvision")]
    missing = _compute_missing(venv_python, non_torch)
    if not missing:
        log("info", "Non-torch pip packages already satisfied")
        return True
    log("info", f"Installing pip packages: {', '.join(missing)}...")
    rc = _run_pip(venv_python, ["install"] + missing)
    return rc == 0

def install_pip_packages():
    """Install required pip packages into the virtual environment."""
    venv_python = ensure_venv()
    if not venv_python:
        log("error", "Cannot install packages without virtual environment")
        return False

    # A freshly-created venv or freshly get-pip'd embeddable Python may carry an
    # old pip that fails to resolve recent torch wheels / the CUDA index.
    _run_pip(venv_python, ["install", "--upgrade", "pip", "setuptools", "wheel"])

    missing = _compute_missing(venv_python, PIP_PACKAGES)

    if not missing:
        log("info", "All pip packages already installed in venv")
        return True

    log("info", f"Installing pip packages into venv: {', '.join(missing)}...")

    names = {_bare_name(p) for p in missing}
    rc = 0
    if "torch" in names or "torchvision" in names:
        # Install torch/torchvision with their exact pins from PIP_PACKAGES so the
        # CUDA index gets versioned requirements (cu124 has no bare-name fallback
        # for old versions), and so the CPU/default path stays pinned too.
        torch_pins = [p for p in PIP_PACKAGES if _bare_name(p) in ("torch", "torchvision")]
        cuda_index = _detect_cuda_pytorch_index()
        cmd = ["install"] + torch_pins
        if cuda_index:
            log("info", "NVIDIA GPU detected. Installing CUDA PyTorch...")
            log("info", "Using index: " + cuda_index)
            cmd += ["--index-url", cuda_index]
        else:
            log("info", "No NVIDIA GPU found. Installing CPU PyTorch...")
        rc = _run_pip(venv_python, cmd)
        # Drop torch/torchvision from `missing` (matched by bare name) so the
        # trailing install of the remaining packages does not re-append them.
        missing = [p for p in missing if _bare_name(p) not in ("torch", "torchvision")]

    if missing:
        rc2 = _run_pip(venv_python, ["install"] + missing)
        rc = rc or rc2

    if rc != 0:
        return False

    # Smoke test: pip exiting 0 does not prove the packages are importable (a
    # missing transitive dep still exits 0). Mirror the --force-gpu path so the
    # normal/CPU install also fails loudly instead of reporting a broken env as OK.
    log("info", "Verifying backend imports in venv...")
    smoke = subprocess.run(
        [venv_python, "-c", "import torch; import torchvision; import cv2; import numpy; import spandrel; import psutil"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if smoke.returncode != 0:
        log("error", "Backend import smoke test failed:")
        for line in (smoke.stderr or "").splitlines():
            log("error", line)
        return False

    return True

def force_gpu_pytorch():
    """Install CUDA PyTorch into the virtual environment."""
    log("section", "GPU PyTorch Installer", step=1, total=1)

    smi_path = _find_nvidia_smi()
    if not smi_path:
        log("error", "nvidia-smi not found. Cannot detect NVIDIA GPU.")
        log("error", "Please install NVIDIA drivers from https://www.nvidia.com/drivers")
        return False

    log("info", f"Found nvidia-smi at: {smi_path}")

    cuda_index = _detect_cuda_pytorch_index()
    if not cuda_index:
        log("error", "Could not detect CUDA version. Drivers may be outdated or corrupted.")
        log("error", "Try updating NVIDIA drivers from https://www.nvidia.com/drivers")
        return False

    venv_python = ensure_venv()
    if not venv_python:
        log("error", "Failed to create virtual environment")
        return False

    log("info", f"Using venv Python: {venv_python}")

    # Old pip can fail to resolve recent torch wheels / the CUDA index.
    _run_pip(venv_python, ["install", "--upgrade", "pip", "setuptools", "wheel"])

    log("info", "Reinstalling PyTorch + torchvision with CUDA...")
    log("info", "Index: " + cuda_index)

    torch_pins = [p for p in PIP_PACKAGES if _bare_name(p) in ("torch", "torchvision")]
    # Resolve torch's mandatory runtime deps (sympy/mpmath/networkx/jinja2/
    # MarkupSafe/fsspec/filelock/typing-extensions). On the GPU wizard path this is
    # the SOLE torch install (no prior normal install runs), so --no-deps would leave
    # those transitive packages missing and main.py's top-level `import torch` would
    # crash. The cu124 index serves torch's pure-python transitive deps, mirroring the
    # working normal path in install_pip_packages().
    rc = _run_pip(venv_python, [
        "install", "--force-reinstall"
    ] + torch_pins + ["--index-url", cuda_index])
    ok = rc == 0

    # A complete GPU environment also needs ffmpeg and the non-torch packages
    # (spandrel is required at runtime for upscaling; numpy/opencv for I/O).
    log("info", "Installing FFmpeg...")
    if not install_ffmpeg():
        log("error", "FFmpeg install failed during --force-gpu")
        ok = False

    log("info", "Installing remaining backend packages (opencv-python, numpy, spandrel)...")
    if not install_non_torch_packages(venv_python):
        log("error", "Failed to install non-torch backend packages during --force-gpu")
        ok = False

    # Smoke test: verify the core runtime imports actually work in the venv before
    # reporting success. pip exit codes alone do not prove torch is importable (a
    # missing transitive dep still exits 0), which is what previously let a broken
    # GPU environment report success.
    if ok:
        log("info", "Verifying backend imports in venv...")
        smoke = subprocess.run(
            [venv_python, "-c", "import torch; import torchvision; import cv2; import numpy; import spandrel; import psutil"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if smoke.returncode != 0:
            log("error", "Backend import smoke test failed:")
            for line in (smoke.stderr or "").splitlines():
                log("error", line)
            ok = False

    if ok:
        log("success", "CUDA PyTorch + backend environment installed. Restart GPU detection.")
        log("venv", VENV_PYTHON)
    else:
        log("error", "GPU environment install failed.")
    return ok

def install_ncnn_binaries():
    log("section", "NCNN Vulkan Binary Installer", step=1, total=1)

    ncnn_dir = os.path.join(SCRIPT_DIR, "ncnn_binaries")
    os.makedirs(ncnn_dir, exist_ok=True)

    NCNN_VERSION = "1.1.0"
    BIN_URL = "https://github.com/AniScripts/AniSmooth-Models/releases/download/ncnn/"

    NCNN_BINARIES = {
        "rife-ncnn-vulkan": {
            "url": BIN_URL + "rife.zip",
            "version": "20221029-full",
            "is_zip": True,
        },
        "realesrgan-ncnn-vulkan": {
            "url": BIN_URL + "realesrgan.zip",
            "version": "20220424-full",
            "is_zip": True,
        },
    }

    version_file = os.path.join(ncnn_dir, "version.json")
    installed = {}
    if os.path.exists(version_file):
        try:
            with open(version_file, "r") as f:
                installed = json.load(f)
        except Exception:
            pass

    import urllib.request
    import zipfile

    ok = True
    for name, meta in NCNN_BINARIES.items():
        exe_path = os.path.join(ncnn_dir, name + ".exe")
        installed_ver = installed.get(name, {}).get("version", "")

        if os.path.exists(exe_path) and installed_ver == meta["version"]:
            log("info", name + " " + meta["version"] + " already installed, skipping")
            continue

        log("info", "Downloading " + name + " (" + meta["version"] + ")...")
        if meta.get("is_zip"):
            zip_path = os.path.join(ncnn_dir, name + ".zip")
            try:
                urllib.request.urlretrieve(meta["url"], zip_path)
                with zipfile.ZipFile(zip_path, "r") as zf:
                    zf.extractall(ncnn_dir)
                installed[name] = {"version": meta["version"]}
                log("info", "Extracted: " + name + " (with models)")
            except Exception as e:
                log("error", "Download/extract failed for " + name + ": " + str(e))
                ok = False
            finally:
                try:
                    os.remove(zip_path)
                except Exception:
                    pass
        else:
            try:
                urllib.request.urlretrieve(meta["url"], exe_path)
                installed[name] = {"version": meta["version"]}
                log("info", "Downloaded: " + name + ".exe")
            except Exception as e:
                log("error", "Download failed for " + name + ": " + str(e))
                ok = False

    if installed:
        try:
            with open(version_file, "w") as f:
                json.dump({"_version": NCNN_VERSION, "binaries": installed}, f, indent=2)
        except Exception:
            pass

    if ok:
        log("success", "NCNN Vulkan binaries installed to: " + ncnn_dir)
    else:
        log("error", "NCNN binary install had errors. Check your internet connection.")
    return ok

def main():
    import argparse
    parser = argparse.ArgumentParser(description="AniSmooth Setup")
    parser.add_argument("--force-gpu", action="store_true", help="Reinstall PyTorch with CUDA support")
    parser.add_argument("--force-ncnn", action="store_true", help="Download NCNN Vulkan binaries for AMD GPU support")
    args = parser.parse_args()

    # Fail fast on interpreters too old to have any compatible torch wheel rather
    # than letting pip emit an opaque 'no matching distribution' later. Runs before
    # both the force-gpu and normal paths so the wizard GPU path also fails fast.
    if sys.version_info < (3, 10):
        log("error",
            "Unsupported Python {}.{}. AniSmooth requires Python 3.10 or newer "
            "(3.10-3.12 recommended; 3.13 supported).".format(
                sys.version_info[0], sys.version_info[1]))
        sys.exit(1)

    if args.force_gpu:
        try:
            ok = force_gpu_pytorch()
            sys.exit(0 if ok else 1)
        except Exception as e:
            log("fatal", str(e))
            sys.exit(1)
        return

    if args.force_ncnn:
        try:
            ok = install_ncnn_binaries()
            sys.exit(0 if ok else 1)
        except Exception as e:
            log("fatal", str(e))
            sys.exit(1)
        return

    log("info", "AniSmooth Python Setup")
    log("info", f"Target directory: {SCRIPT_DIR}")
    log("info", f"System Python: {sys.version}")

    venv_python = ensure_venv()
    if not venv_python:
        log("error", "Failed to set up virtual environment. Aborting.")
        sys.exit(1)

    log("info", f"Virtual environment: {VENV_DIR}")
    log("info", f"Venv Python: {venv_python}")
    log("venv", VENV_PYTHON)

    results = {"ffmpeg": False, "ffprobe": False, "pip": False}

    log("section", "FFmpeg Installer", step=1, total=2)
    results["ffmpeg"] = install_ffmpeg()
    if results["ffmpeg"]:
        results["ffprobe"] = True

    log("section", "Pip Packages Installer", step=2, total=2)
    results["pip"] = install_pip_packages()

    all_ok = results["ffmpeg"] and results["pip"]
    log("summary", "installation_summary", results=results, all_ok=all_ok)

    if all_ok:
        log("success", "AniSmooth environment configuration complete!")
    else:
        log("warn", "Setup completed with warnings. Check logs for missing files/dependencies.")
        # Exit non-zero so the setup wizard cannot report success on a silent
        # pip/ffmpeg failure (its close handler treats code===0 as complete).
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log("fatal", str(e))
        sys.exit(1)
