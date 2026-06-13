import os
import json

TENSORRT_AVAILABLE = False
try:
    import tensorrt
    TENSORRT_AVAILABLE = True
except ImportError:
    pass

TORCH2TRT_AVAILABLE = False
try:
    import torch2trt
    TORCH2TRT_AVAILABLE = True
except ImportError:
    pass

def _get_appdata_dir():
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        return os.path.join(appdata, "com.moongetsu.extensions", "AniSmooth", "backend")
    home = os.path.expanduser("~")
    return os.path.join(home, "AppData", "Roaming", "com.moongetsu.extensions", "AniSmooth", "backend")

ENGINES_DIR = os.path.join(_get_appdata_dir(), "models", "engines")

def log(msg_type, msg, **kw):
    out = {"type": msg_type, "msg": str(msg)}
    out.update(kw)
    print(json.dumps(out), flush=True)

def ensure_engines_dir():
    try:
        os.makedirs(ENGINES_DIR, exist_ok=True)
    except PermissionError:
        log("error", f"Permission denied creating engines directory: {ENGINES_DIR}")
        raise
    return ENGINES_DIR

def get_engine_path(model_key, resolution, precision="fp16"):
    h, w = resolution
    engine_name = f"{model_key}_{w}x{h}_{precision}.engine"
    return os.path.join(ENGINES_DIR, engine_name)

def is_tensorrt_available():
    return TENSORRT_AVAILABLE

def build_rife_onnx(model, model_key, resolution, device):
    import torch

    log("info", f"Exporting {model_key} to ONNX for TensorRT conversion...")
    h, w = resolution
    model.eval()

    dummy_img0 = torch.randn(1, 3, h, w, device=device)
    dummy_img1 = torch.randn(1, 3, h, w, device=device)
    dummy_timestep = torch.full((1, 1, h, w), 0.5, device=device)

    onnx_path = os.path.join(ENGINES_DIR, f"{model_key}_{w}x{h}_v2.onnx")

    class ExportWrapper(torch.nn.Module):
        def __init__(self, model):
            super().__init__()
            self.model = model

        def forward(self, img0, img1, timestep):
            
            
            t = timestep[:, 0, 0, 0]
            return self.model(img0, img1, t)

    wrapped = ExportWrapper(model)

    torch.onnx.export(
        wrapped,
        (dummy_img0, dummy_img1, dummy_timestep),
        onnx_path,
        input_names=["img0", "img1", "timestep"],
        output_names=["output"],
        dynamic_axes={
            "img0": {2: "height", 3: "width"},
            "img1": {2: "height", 3: "width"},
            "timestep": {2: "height", 3: "width"},
            "output": {2: "height", 3: "width"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    log("info", f"ONNX model exported: {onnx_path}")
    return onnx_path

def build_rife_tensorrt_engine(onnx_path, engine_path, precision="fp16"):
    if not TENSORRT_AVAILABLE:
        log("error", "TensorRT is not available. Install nvidia-tensorrt package.")
        return None

    import tensorrt as trt

    ensure_engines_dir()
    TRT_LOGGER = trt.Logger(trt.Logger.WARNING)

    log("info", f"Building TensorRT engine: {engine_path} (precision: {precision})")

    builder = trt.Builder(TRT_LOGGER)
    network_flags = 1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)
    network = builder.create_network(network_flags)
    parser = trt.OnnxParser(network, TRT_LOGGER)

    with open(onnx_path, "rb") as f:
        if not parser.parse(f.read()):
            for i in range(parser.num_errors):
                log("error", f"ONNX parse error: {parser.get_error(i)}")
            return None

    config = builder.create_builder_config()
    config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 4 << 30)

    if precision == "fp16" and builder.platform_has_fast_fp16:
        config.set_flag(trt.BuilderFlag.FP16)
        log("info", "FP16 mode enabled for TensorRT engine")
    elif precision == "int8" and builder.platform_has_fast_int8:
        config.set_flag(trt.BuilderFlag.INT8)
        log("info", "INT8 mode enabled for TensorRT engine")

    profile = builder.create_optimization_profile()
    profile.set_shape("img0", (1, 3, 64, 64), (1, 3, 720, 1280), (1, 3, 2160, 3840))
    profile.set_shape("img1", (1, 3, 64, 64), (1, 3, 720, 1280), (1, 3, 2160, 3840))
    profile.set_shape("timestep", (1, 1, 64, 64), (1, 1, 720, 1280), (1, 1, 2160, 3840))
    config.add_optimization_profile(profile)

    log("info", "Serializing TensorRT engine... This may take several minutes.")
    serialized_engine = builder.build_serialized_network(network, config)

    if serialized_engine is None:
        log("error", "Failed to build TensorRT engine")
        return None

    with open(engine_path, "wb") as f:
        f.write(serialized_engine)

    log("info", f"TensorRT engine saved: {engine_path}")
    return engine_path

def load_tensorrt_engine(engine_path):
    if not TENSORRT_AVAILABLE:
        log("error", "TensorRT is not available.")
        return None

    import tensorrt as trt

    TRT_LOGGER = trt.Logger(trt.Logger.WARNING)
    runtime = trt.Runtime(TRT_LOGGER)

    with open(engine_path, "rb") as f:
        engine_data = f.read()

    engine = runtime.deserialize_cuda_engine(engine_data)
    if engine is None:
        log("error", "Failed to deserialize TensorRT engine")
        return None

    log("info", f"Loaded TensorRT engine: {engine_path}")
    return engine

class TensorRTInferenceEngine:
    def __init__(self, engine):
        import tensorrt as trt

        self.engine = engine
        self.context = engine.create_execution_context()

        self.input_names = []
        self.output_names = []
        for i in range(engine.num_io_tensors):
            name = engine.get_tensor_name(i)
            if engine.get_tensor_mode(name) == trt.TensorIOMode.INPUT:
                self.input_names.append(name)
            else:
                self.output_names.append(name)

        self.inputs = {}
        self.outputs = {}
        self.bindings = []
        self.stream = None

    def allocate_buffers(self, input_shapes):
        import torch
        import tensorrt as trt

        for name, shape in input_shapes.items():
            if name in self.input_names:
                self.context.set_input_shape(name, shape)
                self.inputs[name] = torch.empty(shape, dtype=torch.float16, device="cuda").contiguous()

        for name in self.output_names:
            shape = self.context.get_tensor_shape(name)
            self.outputs[name] = torch.empty(shape, dtype=torch.float16, device="cuda").contiguous()

        self.stream = torch.cuda.Stream()

    def infer(self, feed_dict):
        import torch

        for name, tensor in feed_dict.items():
            if name in self.inputs:
                self.inputs[name].copy_(tensor)
            elif name in self.input_names:
                
                
                buf = tensor.contiguous()
                self.inputs[name] = buf

        for name in self.input_names:
            if name in self.inputs:
                self.context.set_input_shape(name, tuple(self.inputs[name].shape))
                self.context.set_tensor_address(name, self.inputs[name].data_ptr())
        for name in self.output_names:
            
            shape = self.context.get_tensor_shape(name)
            if tuple(self.outputs[name].shape) != tuple(shape):
                self.outputs[name] = torch.empty(shape, dtype=torch.float16, device="cuda").contiguous()
            self.context.set_tensor_address(name, self.outputs[name].data_ptr())

        self.context.execute_async_v3(self.stream.cuda_stream)
        self.stream.synchronize()

        return {name: self.outputs[name].clone() for name in self.output_names}

def build_upscale_tensorrt_engine(model, model_key, resolution, device, precision="fp16"):
    if not TENSORRT_AVAILABLE:
        log("error", "TensorRT is not available.")
        return None

    import torch
    import tensorrt as trt

    h, w = resolution
    ensure_engines_dir()
    engine_path = get_engine_path(model_key, (h, w), precision)
    onnx_path = os.path.join(ENGINES_DIR, f"{model_key}_{w}x{h}.onnx")

    if os.path.exists(engine_path):
        log("info", f"TensorRT engine already exists: {engine_path}")
        return engine_path

    model.eval()
    dummy = torch.randn(1, 3, h, w, device=device)

    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        input_names=["input"],
        output_names=["output"],
        opset_version=17,
        do_constant_folding=True,
    )
    log("info", f"Upscale ONNX exported: {onnx_path}")

    TRT_LOGGER = trt.Logger(trt.Logger.WARNING)
    builder = trt.Builder(TRT_LOGGER)
    network_flags = 1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)
    network = builder.create_network(network_flags)
    parser = trt.OnnxParser(network, TRT_LOGGER)

    with open(onnx_path, "rb") as f:
        if not parser.parse(f.read()):
            return None

    config = builder.create_builder_config()
    config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 4 << 30)

    if precision == "fp16" and builder.platform_has_fast_fp16:
        config.set_flag(trt.BuilderFlag.FP16)

    serialized = builder.build_serialized_network(network, config)
    if serialized is None:
        return None

    with open(engine_path, "wb") as f:
        f.write(serialized)

    log("info", f"Upscale TensorRT engine saved: {engine_path}")
    return engine_path
