import os
import sys
import json
import numpy as np

def log(msg_type, msg, **kw):
    out = {"type": msg_type, "msg": str(msg)}
    out.update(kw)
    print(json.dumps(out), flush=True)

def is_coreml_available():
    if sys.platform != "darwin":
        return False
    try:
        import coremltools as ct
        return True
    except Exception:
        return False

def get_coreml_model_path(model_key, shape):
    from models.weight_loader import _get_appdata_dir
    h, w = shape
    models_dir = os.path.join(_get_appdata_dir(), "coreml_models")
    os.makedirs(models_dir, exist_ok=True)
    return os.path.join(models_dir, f"{model_key}_{w}x{h}.mlpackage")

def build_coreml_model(pt_model, model_key, shape):
    if not is_coreml_available():
        return None
    import torch
    import coremltools as ct
    h, w = shape
    out_path = get_coreml_model_path(model_key, shape)
    if os.path.exists(out_path):
        return out_path

    log("info", f"Compiling CoreML model for {model_key} ({w}x{h})...")
    try:
        pt_model.eval()
        dummy_img0 = torch.rand(1, 3, h, w, dtype=torch.float32)
        dummy_img1 = torch.rand(1, 3, h, w, dtype=torch.float32)
        dummy_timestep = torch.tensor([0.5], dtype=torch.float32)

        class CoreMLRifeWrapper(torch.nn.Module):
            def __init__(self, model):
                super().__init__()
                self.model = model

            def forward(self, img0, img1, timestep):
                return self.model(img0, img1, timestep)

        wrapper = CoreMLRifeWrapper(pt_model).eval()
        traced_model = torch.jit.trace(wrapper, (dummy_img0, dummy_img1, dummy_timestep))

        coreml_model = ct.convert(
            traced_model,
            inputs=[
                ct.TensorType(name="img0", shape=(1, 3, h, w)),
                ct.TensorType(name="img1", shape=(1, 3, h, w)),
                ct.TensorType(name="timestep", shape=(1,))
            ],
            compute_units=ct.ComputeUnit.ALL,
            minimum_deployment_target=ct.target.macOS13
        )
        coreml_model.save(out_path)
        log("success", f"CoreML model compiled: {out_path}")
        return out_path
    except Exception as e:
        log("warn", f"CoreML compilation failed ({e}), using PyTorch MPS")
        return None

class CoreMLInferenceEngine:
    def __init__(self, mlpackage_path):
        import coremltools as ct
        self.model = ct.models.MLModel(mlpackage_path, compute_units=ct.ComputeUnit.ALL)

    def infer(self, img0_np, img1_np, timestep_float):
        preds = self.model.predict({
            "img0": img0_np,
            "img1": img1_np,
            "timestep": np.array([timestep_float], dtype=np.float32)
        })
        first_key = list(preds.keys())[0]
        return preds[first_key]
