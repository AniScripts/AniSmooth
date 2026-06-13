import os
import json
import logging
import urllib.request
import urllib.error
from http.client import IncompleteRead

def _get_appdata_dir():
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        return os.path.join(appdata, "com.moongetsu.extensions", "AniSmooth", "backend")
    home = os.path.expanduser("~")
    return os.path.join(home, "AppData", "Roaming", "com.moongetsu.extensions", "AniSmooth", "backend")

WEIGHTS_DIR = os.path.join(_get_appdata_dir(), "weights")

TASURL = "https://github.com/NevermindNilas/TAS-Models-Host/releases/download/main/"

def _model_filename(model_key):
    mapping = {
        "rife4.25":          "rife425.pth",
        "rife4.25-heavy":    "rife425_heavy.pth",
        "shufflecugan":      "sudo_shuffle_cugan_9.584.969.pth",
        "adore":             "adore.pth",
        "fallin_soft":       "Fallin_soft.pth",
        "fallin_strong":     "Fallin_strong.pth",
    }
    name = mapping.get(model_key)
    if name is None:
        raise ValueError("Unknown model key: " + model_key)
    return name

def log(msg_type, msg, **kw):
    out = {"type": msg_type, "msg": str(msg)}
    out.update(kw)
    print(json.dumps(out), flush=True)

def ensure_weights_dir():
    try:
        os.makedirs(WEIGHTS_DIR, exist_ok=True)
    except PermissionError:
        log("error", "Permission denied creating: " + WEIGHTS_DIR)
        raise
    return WEIGHTS_DIR

def get_weight_path(model_key):
    subdir = model_key
    filename = _model_filename(model_key)
    return os.path.join(WEIGHTS_DIR, subdir, filename)

def is_weight_downloaded(model_key):
    try:
        return os.path.exists(get_weight_path(model_key))
    except ValueError:
        return False

def download_weights(model_key, force=False, retries=3):
    filename = _model_filename(model_key)
    subdir = model_key
    folder_path = os.path.join(WEIGHTS_DIR, subdir)
    dest = os.path.join(folder_path, filename)

    if os.path.exists(dest) and not force:
        log("info", "Model weights already cached: " + filename)
        return True

    os.makedirs(folder_path, exist_ok=True)
    temp_folder = os.path.join(folder_path, "TEMP")
    os.makedirs(temp_folder, exist_ok=True)
    temp_path = os.path.join(temp_folder, filename)

    url = TASURL + filename
    log("info", "Downloading " + model_key + "...")
    log("info", "URL: " + url)

    for attempt in range(retries):
        try:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

            req = urllib.request.Request(url, headers={"User-Agent": "AniSmooth/1.0"})
            resp = urllib.request.urlopen(req, timeout=120)

            if resp.getcode() != 200:
                raise urllib.error.HTTPError(url, resp.getcode(), "", None, None)

            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 65536

            with open(temp_path, "wb") as f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0 and downloaded % (chunk_size * 8) < chunk_size:
                        pct = min(99, int(downloaded * 100 / total))
                        log("progress", "Downloading " + filename + " " + str(pct) + "%",
                            pct=pct, done=downloaded, total=total)

            log("progress", "Downloading " + filename + " 100%", pct=100,
                done=downloaded, total=total)

            if total > 0 and downloaded != total:
                raise ConnectionError(
                    "Incomplete: received " + str(downloaded) + " of " + str(total) + " bytes"
                )

            os.rename(temp_path, dest)
            try:
                os.rmdir(temp_folder)
            except OSError:
                pass

            log("info", "Model downloaded to: " + dest)
            return True

        except (urllib.error.URLError, urllib.error.HTTPError, IncompleteRead,
                ConnectionError, TimeoutError) as e:
            log("warn", "Download attempt " + str(attempt + 1) + " failed: " + str(e))
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            if attempt == retries - 1:
                log("error", "All " + str(retries) + " download attempts failed.")
                return False

    return False

def _remap_state_dict_keys(state_dict, model):
    """Remap checkpoint keys to match model's expected key names.
    Handles common prefix mismatches: 'flownet.', 'module.', 'module.flownet.'
    """
    model_keys = set(model.state_dict().keys())
    ckpt_keys = set(state_dict.keys())

    
    if ckpt_keys & model_keys:
        overlap = len(ckpt_keys & model_keys)
        if overlap == len(model_keys) or overlap == len(ckpt_keys):
            return state_dict

    
    prefixes_to_strip = ["module.flownet.", "module.", "flownet."]
    prefixes_to_add = ["flownet.", "module.", "module.flownet."]

    
    for prefix in prefixes_to_strip:
        remapped = {}
        for k, v in state_dict.items():
            new_key = k[len(prefix):] if k.startswith(prefix) else k
            remapped[new_key] = v
        overlap = len(set(remapped.keys()) & model_keys)
        if overlap > len(ckpt_keys & model_keys):
            log("info", "Remapped weights: stripped '" + prefix + "' prefix (" + str(overlap) + " keys matched)")
            return remapped

    
    for prefix in prefixes_to_add:
        remapped = {}
        for k, v in state_dict.items():
            new_key = prefix + k
            remapped[new_key] = v
        overlap = len(set(remapped.keys()) & model_keys)
        if overlap > len(ckpt_keys & model_keys):
            log("info", "Remapped weights: added '" + prefix + "' prefix (" + str(overlap) + " keys matched)")
            return remapped

    
    return state_dict

def load_weights_if_available(model, model_key, device=None):
    import torch
    try:
        weight_path = get_weight_path(model_key)
    except ValueError:
        log("warn", "No weight source defined for: " + model_key)
        return False

    if not os.path.exists(weight_path):
        log("info", "Weight file not found: " + os.path.basename(weight_path))
        log("info", "Attempting download from TAS-Models-Host CDN...")
        if not download_weights(model_key):
            log("warn", "Download failed. Place the model manually at:")
            log("warn", "  " + weight_path)
            return False

    try:
        state_dict = torch.load(weight_path, map_location=device or "cpu",
                                weights_only=True)

        
        state_dict = _remap_state_dict_keys(state_dict, model)

        
        result = model.load_state_dict(state_dict, strict=False)

        
        model_param_count = len(model.state_dict())
        loaded_count = model_param_count - len(result.missing_keys)

        if len(result.missing_keys) > 0:
            log("warn", "Missing keys in checkpoint (" + str(len(result.missing_keys)) + "/" + str(model_param_count) + "): "
                + ", ".join(result.missing_keys[:5])
                + ("..." if len(result.missing_keys) > 5 else ""))
        if len(result.unexpected_keys) > 0:
            log("warn", "Unexpected keys in checkpoint (" + str(len(result.unexpected_keys)) + "): "
                + ", ".join(result.unexpected_keys[:5])
                + ("..." if len(result.unexpected_keys) > 5 else ""))

        if loaded_count == 0:
            log("error", "CRITICAL: No weights were loaded for " + model_key + "! "
                "The model will produce garbage output. Check weight file format.")
            return False

        if loaded_count < model_param_count:
            log("warn", "Partial weight load for " + model_key + ": "
                + str(loaded_count) + "/" + str(model_param_count) + " parameters loaded")
        else:
            log("info", "All " + str(loaded_count) + " weight parameters loaded successfully for " + model_key)

        return True
    except Exception as e:
        log("error", "Failed to load weights for " + model_key + ": " + str(e))
        log("warn", "Model will run with random weights (low quality).")
        return False
