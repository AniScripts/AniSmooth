(function () {
  var NcnnHandler = {
    activeProcess: null,
    _cancelled: false,
    _modelsCache: {},

    findExe: function (name) {
      try {
        var fs = window.FileSystem.fs;
        var path = window.FileSystem.path;
        var exeName = name + ".exe";
        var configured = window.StorageManager.getItem("anismooth_ncnn_path", "");
        if (configured && fs.existsSync(configured)) return configured;
        var extPath = "";
        try { var cs = new CSInterface(); extPath = cs.getSystemPath(SystemPath.EXTENSION); } catch (e) {}
        if (extPath) {
          var ncnnDir = path.join(extPath, "python", "ncnn_binaries");
          var guess = path.join(ncnnDir, exeName);
          if (fs.existsSync(guess)) return guess;
        }
        var appdata = "";
        try { appdata = process.env.APPDATA || ""; } catch (e) {}
        if (!appdata && window.FileSystem.os) {
          appdata = path.join(window.FileSystem.os.homedir(), "AppData", "Roaming");
        }
        if (appdata) {
          var backend = path.join(appdata, "com.moongetsu.extensions", "AniSmooth", "backend");
          var guess2 = path.join(backend, "ncnn_binaries", exeName);
          if (fs.existsSync(guess2)) return guess2;
          var guess3 = path.join(backend, exeName);
          if (fs.existsSync(guess3)) return guess3;
        }
      } catch (e) {}
      return null;
    },

    isAvailable: function () {
      return !!this.findExe("rife-ncnn-vulkan");
    },

    run: function (inputPath, outputPath, exeName, options, callbacks) {
      var self = this;
      callbacks = callbacks || {};
      if (this.activeProcess) {
        if (callbacks.onError) callbacks.onError("NCNN process is already running.");
        return;
      }

      var fs = window.FileSystem.fs;
      var path = window.FileSystem.path;
      var cp = window.FileSystem.childProcess;

      var exe = this.findExe(exeName);
      if (!exe) {
        if (callbacks.onError) callbacks.onError(exeName + ".exe not found. Install NCNN Vulkan binaries.");
        return;
      }

      var exeDir = path.dirname(exe);
      var gpuId = window.StorageManager.getItem("anismooth_ncnn_gpu_id", "0") || "0";
      var args = [
        "-i", inputPath,
        "-o", outputPath,
        "-g", gpuId,
        "-m", options.model || "rife-v4.26",
        "-j", String(options.threadCount || "4:4:4")
      ];
      if (options.factor) args.push("-x", String(options.factor));
      if (options.scale) args.push("-s", String(options.scale));
      if (options.ttafnm) args.push("-f", options.ttafnm);
      if (options.tta) args.push("-x");
      if (options.uhdMode) args.push("-u");

      this._cancelled = false;
      dbg("info", "NCNN", "Launching: " + exe + " " + args.join(" "));

      var env = {};
      for (var key in process.env) {
        if (process.env.hasOwnProperty(key)) env[key] = process.env[key];
      }
      if (!env.PATH) env.PATH = "";
      env.PATH = exeDir + ";" + env.PATH;

      var proc;
      try {
        proc = cp.spawn(exe, args, { env: env, cwd: exeDir, windowsHide: true });
      } catch (e) {
        if (callbacks.onError) callbacks.onError("Failed to launch " + exeName + ": " + e.message);
        return;
      }
      self.activeProcess = proc;
      if (callbacks.onStart) callbacks.onStart();

      var lastProgress = -1;
      var finished = false;
      var gotProgress = false;
      var stderrLines = [];

      var finalize = function (ok, message) {
        if (finished) return;
        finished = true;
        self.activeProcess = null;
        if (self._cancelled) { self._cancelled = false; return; }
        if (ok) {
          if (fs.existsSync(outputPath)) {
            dbg("success", "NCNN", "Completed: " + outputPath);
            if (callbacks.onComplete) callbacks.onComplete();
          } else {
            dbg("error", "NCNN", "Output file not found: " + outputPath);
            if (callbacks.onError) callbacks.onError("NCNN completed but no output file was produced.");
          }
        } else {
          dbg("error", "NCNN", message);
          if (callbacks.onError) callbacks.onError(message);
        }
      };

      var stderrBuf = "";
      proc.stderr.on("data", function (data) {
        stderrBuf += data.toString();
        var lines = stderrBuf.split("\n");
        stderrBuf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line) continue;
          if (callbacks.onLog) callbacks.onLog(line);
          var pct = _parseProgress(line);
          if (pct >= 0 && pct !== lastProgress) {
            lastProgress = pct;
            gotProgress = true;
            if (callbacks.onProgress) callbacks.onProgress(pct);
          }
          stderrLines.push(line);
          if (/error|cannot|failed/i.test(line)) {
            dbg("warn", "NCNN", line);
            if (/could not open|cannot read|no such file/i.test(line)) {
              finalize(false, line);
            }
          }
        }
      });

      proc.on("close", function (code) {
        if (finished) return;
        if (code === 0) {
          setTimeout(function () {
            finalize(true);
          }, 500);
        } else if (!gotProgress && code !== 0) {
          var joined = stderrLines.join(" ").toLowerCase();
          if (/vulkan-1\.dll|vulkan/i.test(joined)) {
            finalize(false, "Vulkan runtime not found. Update your GPU drivers from AMD/NVIDIA website.");
          } else if (/vcruntime|msvcp|visual c\+\+|\.dll was not found/i.test(joined)) {
            finalize(false, "Microsoft Visual C++ Redistributable missing. Download from https://aka.ms/vs/17/release/vc_redist.x64.exe");
          } else {
            finalize(false, "NCNN process exited immediately (code " + code + "). Update GPU drivers and install VC++ Redistributable.");
          }
        } else {
          finalize(false, "NCNN process exited with code " + code);
        }
      });

      proc.on("error", function (err) {
        finalize(false, "NCNN process error: " + err.message);
      });
    },

    cancel: function () {
      if (!this.activeProcess) return false;
      this._cancelled = true;
      var proc = this.activeProcess;
      try {
        if (process.platform === "win32" && proc.pid) {
          window.FileSystem.childProcess.exec("taskkill /F /T /PID " + proc.pid, function () {});
        } else {
          proc.kill("SIGTERM");
        }
      } catch (e) {
        try { proc.kill("SIGKILL"); } catch (e2) {}
      }
      this.activeProcess = null;
      return true;
    },

    getRifeModels: function () {
      return [
        { value: "rife-v4.26", label: "RIFE 4.26", backend: "vulkan", desc: "Latest, best motion quality" },
        { value: "rife-v4.25", label: "RIFE 4.25", backend: "vulkan", desc: "Stable release" },
        { value: "rife-v4.24", label: "RIFE 4.24", backend: "vulkan", desc: "Previous stable" },
        { value: "rife-v4.22", label: "RIFE 4.22", backend: "vulkan", desc: "Fast, good quality" },
        { value: "rife-v4.18", label: "RIFE 4.18", backend: "vulkan", desc: "Balanced speed/quality" },
        { value: "rife-v4.15-lite", label: "RIFE 4.15 Lite", backend: "vulkan", desc: "Fastest, lower VRAM" },
        { value: "rife-v4.6", label: "RIFE 4.6", backend: "vulkan", desc: "Widely compatible" },
        { value: "rife-anime", label: "RIFE Anime", backend: "vulkan", desc: "Optimized for 2D/anime" },
        { value: "rife-v3.1", label: "RIFE 3.1", backend: "vulkan", desc: "Legacy v3 model" },
        { value: "rife-v2.4", label: "RIFE 2.4", backend: "vulkan", desc: "Widest GPU compatibility" }
      ];
    },

    getUpscaleModels: function () {
      return [
        { value: "realesr-animevideov3", label: "AnimeVideo v3", backend: "vulkan", desc: "Best for anime, 4x" },
        { value: "realesrgan-x4plus-anime", label: "x4plus Anime", backend: "vulkan", desc: "4x anime upscale" },
        { value: "realesrgan-x4plus", label: "x4plus", backend: "vulkan", desc: "General 4x upscale" },
        { value: "realesrnet-x4plus", label: "x4plus Net", backend: "vulkan", desc: "Faster, lighter 4x" },
        { value: "realesrgan-x2plus", label: "x2plus", backend: "vulkan", desc: "General 2x upscale" }
      ];
    }
  };

  function _parseProgress(line) {
    var m = line.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) return parseFloat(m[1]);
    m = line.match(/^\s*(\d+)\s*\/\s*(\d+)\b/);
    if (m) {
      var cur = parseInt(m[1], 10);
      var total = parseInt(m[2], 10);
      if (total > 0) return Math.round((cur / total) * 100);
    }
    return -1;
  }

  window.NcnnHandler = NcnnHandler;
})();
