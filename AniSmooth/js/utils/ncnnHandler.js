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
      var p = window.FileSystem.path;
      var cp = window.FileSystem.childProcess;

      dbg("info", "NCNN-DEBUG", "=== NCNN Run Start ===");
      dbg("info", "NCNN-DEBUG", "exeName: " + exeName);
      dbg("info", "NCNN-DEBUG", "inputPath: " + inputPath + " (exists: " + fs.existsSync(inputPath) + ", size: " + (fs.existsSync(inputPath) ? fs.statSync(inputPath).size : 0) + ")");
      dbg("info", "NCNN-DEBUG", "outputPath: " + outputPath);
      dbg("info", "NCNN-DEBUG", "options: " + JSON.stringify(options));

      var exe = this.findExe(exeName);
      if (!exe) {
        if (callbacks.onError) callbacks.onError(exeName + ".exe not found. Install NCNN Vulkan binaries.");
        return;
      }
      dbg("info", "NCNN-DEBUG", "Binary found: " + exe + " (size: " + fs.statSync(exe).size + ")");

      var outputExt = outputPath.replace(/^.*\./, "").toLowerCase();
      var inputExt = inputPath.replace(/^.*\./, "").toLowerCase();
      dbg("info", "NCNN-DEBUG", "Input ext: " + inputExt + ", Output ext: " + outputExt);

      if (outputExt === "avi") {
        outputPath = outputPath.replace(/\.\w+$/, ".mp4");
        dbg("info", "NCNN-DEBUG", "Output AVI forced to MP4: " + outputPath);
      }

      var actualInput = inputPath;
      var tempInput = null;

      if (inputExt === "avi") {
        dbg("info", "NCNN-DEBUG", "AVI input detected, looking for FFmpeg...");
        var appdata = "";
        try { appdata = process.env.APPDATA || ""; } catch (e) {}
        if (!appdata && window.FileSystem.os) {
          appdata = p.join(window.FileSystem.os.homedir(), "AppData", "Roaming");
        }
        var ffmpegPath = null;
        if (appdata) {
          var backendDir = p.join(appdata, "com.moongetsu.extensions", "AniSmooth", "backend");
          ffmpegPath = p.join(backendDir, "ffmpeg.exe");
          dbg("info", "NCNN-DEBUG", "Checking FFmpeg at: " + ffmpegPath + " (exists: " + fs.existsSync(ffmpegPath) + ")");
          if (!fs.existsSync(ffmpegPath)) ffmpegPath = null;
        }
        if (!ffmpegPath) {
          try {
            ffmpegPath = require("child_process").execSync("where ffmpeg", { encoding: "utf8" }).trim().split("\n")[0];
            dbg("info", "NCNN-DEBUG", "FFmpeg found via PATH: " + ffmpegPath);
          } catch (e) {
            dbg("warn", "NCNN-DEBUG", "FFmpeg not found in PATH: " + e.message);
          }
        }

        if (ffmpegPath && fs.existsSync(ffmpegPath)) {
          tempInput = inputPath.replace(/\.\w+$/, "_ncnn_temp.mp4");
          dbg("info", "NCNN-DEBUG", "Converting: " + inputPath + " -> " + tempInput);
          try {
            var convResult = cp.spawnSync(ffmpegPath, [
              "-y", "-i", inputPath,
              "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0",
              "-pix_fmt", "yuv420p", "-an",
              tempInput
            ], { windowsHide: true, timeout: 120000 });
            dbg("info", "NCNN-DEBUG", "FFmpeg exit code: " + convResult.status);
            dbg("info", "NCNN-DEBUG", "FFmpeg stderr: " + (convResult.stderr ? convResult.stderr.toString().slice(0, 500) : "(none)"));
            if (convResult.status === 0 && fs.existsSync(tempInput)) {
              actualInput = tempInput;
              dbg("info", "NCNN-DEBUG", "Conversion OK, temp size: " + fs.statSync(tempInput).size);
            } else {
              dbg("warn", "NCNN-DEBUG", "FFmpeg conversion failed (status=" + convResult.status + ", tempExists=" + fs.existsSync(tempInput) + ")");
              try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e) {}
              tempInput = null;
            }
          } catch (e) {
            dbg("error", "NCNN-DEBUG", "FFmpeg spawn exception: " + e.message);
            try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e2) {}
            tempInput = null;
          }
        } else {
          dbg("warn", "NCNN-DEBUG", "No FFmpeg found, using original AVI input");
        }
      }

      dbg("info", "NCNN-DEBUG", "Actual input: " + actualInput);

      var exeDir = p.dirname(exe);
      var gpuId = window.StorageManager.getItem("anismooth_ncnn_gpu_id", "0") || "0";
      var args = [
        "-i", actualInput,
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

      dbg("info", "NCNN-DEBUG", "--- DLL Pre-flight ---");
      var sysDir = process.env.SystemRoot ? p.join(process.env.SystemRoot, "System32") : "C:\\Windows\\System32";
      var vulkanPath = p.join(sysDir, "vulkan-1.dll");
      var vcrPath = p.join(sysDir, "vcruntime140.dll");
      var vulkanExists = fs.existsSync(vulkanPath);
      var vcrExists = fs.existsSync(vcrPath);
      dbg("info", "NCNN-DEBUG", "vulkan-1.dll: " + vulkanPath + " (exists: " + vulkanExists + ")");
      dbg("info", "NCNN-DEBUG", "vcruntime140.dll: " + vcrPath + " (exists: " + vcrExists + ")");

      if (!vulkanExists || !vcrExists) {
        var missing = [];
        if (!vulkanExists) missing.push("Vulkan runtime (vulkan-1.dll)");
        if (!vcrExists) missing.push("VC++ Redistributable (vcruntime140.dll)");
        dbg("error", "NCNN-DEBUG", "Missing DLLs: " + missing.join(", "));
        if (callbacks.onError) callbacks.onError(
          "Missing system libraries: " + missing.join(", ") + ". " +
          "Install Vulkan drivers from your GPU vendor and download VC++ Redistributable from https://aka.ms/vs/17/release/vc_redist.x64.exe"
        );
        return;
      }
      dbg("info", "NCNN-DEBUG", "DLL check passed");

      var fullCmd = exe + " " + args.map(function(a) { return a.indexOf(" ") >= 0 ? '"' + a + '"' : a; }).join(" ");
      dbg("info", "NCNN-DEBUG", "Spawn cmd: " + fullCmd);
      dbg("info", "NCNN-DEBUG", "CWD: " + exeDir);
      dbg("info", "NCNN-DEBUG", "GPU ID: " + gpuId);

      var env = {};
      var envKeys = 0;
      for (var key in process.env) {
        if (process.env.hasOwnProperty(key)) { env[key] = process.env[key]; envKeys++; }
      }
      if (!env.PATH) env.PATH = "";
      env.PATH = exeDir + ";" + env.PATH;
      dbg("info", "NCNN-DEBUG", "Env keys: " + envKeys + ", PATH prefix: " + exeDir);

      var proc;
      try {
        proc = cp.spawn(exe, args, { env: env, cwd: exeDir, windowsHide: true });
      } catch (e) {
        dbg("error", "NCNN-DEBUG", "Spawn exception: " + e.message);
        if (callbacks.onError) callbacks.onError("Failed to launch " + exeName + ": " + e.message);
        return;
      }
      dbg("info", "NCNN-DEBUG", "Process spawned, PID: " + (proc.pid || "unknown"));
      self.activeProcess = proc;
      if (callbacks.onStart) callbacks.onStart();

      var lastProgress = -1;
      var finished = false;
      var gotProgress = false;
      var stderrLines = [];
      var allStderr = "";

      var finalize = function (ok, message) {
        if (finished) return;
        finished = true;
        dbg("info", "NCNN-DEBUG", "Finalizing: ok=" + ok + " msg=" + (message || ""));
        dbg("info", "NCNN-DEBUG", "All stderr (" + stderrLines.length + " lines): " + allStderr.slice(0, 2000));
        self.activeProcess = null;
        if (tempInput) { try { fs.unlinkSync(tempInput); } catch (e) {} }
        if (self._cancelled) { dbg("info", "NCNN-DEBUG", "Cancelled, aborting"); self._cancelled = false; return; }
        if (ok) {
          if (fs.existsSync(outputPath)) {
            dbg("info", "NCNN-DEBUG", "Output exists: " + outputPath + " (size: " + fs.statSync(outputPath).size + ")");
            dbg("success", "NCNN", "Completed: " + outputPath);
            if (callbacks.onComplete) callbacks.onComplete();
          } else {
            dbg("error", "NCNN-DEBUG", "Output missing: " + outputPath);
            dbg("error", "NCNN", "Output file not found: " + outputPath);
            if (callbacks.onError) callbacks.onError("NCNN completed but no output file was produced.");
          }
        } else {
          dbg("error", "NCNN-DEBUG", "Error: " + message);
          dbg("error", "NCNN", message);
          if (callbacks.onError) callbacks.onError(message);
        }
      };

      var stderrBuf = "";
      proc.stderr.on("data", function (data) {
        var chunk = data.toString();
        allStderr += chunk;
        stderrBuf += chunk;
        var lines = stderrBuf.split("\n");
        stderrBuf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line) continue;
          dbg("debug", "NCNN-DEBUG", "stderr: " + line);
          if (callbacks.onLog) callbacks.onLog(line);
          var pct = _parseProgress(line);
          if (pct >= 0 && pct !== lastProgress) {
            lastProgress = pct;
            gotProgress = true;
            if (callbacks.onProgress) callbacks.onProgress(pct);
          }
          stderrLines.push(line);
          if (/error|cannot|failed/i.test(line)) {
            dbg("warn", "NCNN-DEBUG", "Error line: " + line);
            if (/could not open|cannot read|no such file/i.test(line)) {
              finalize(false, line);
            }
          }
        }
      });

      proc.stdout.on("data", function (data) {
        var chunk = data.toString().trim();
        if (chunk) dbg("debug", "NCNN-DEBUG", "stdout: " + chunk.slice(0, 500));
      });

      proc.on("close", function (code, signal) {
        dbg("info", "NCNN-DEBUG", "Process closed: code=" + code + " signal=" + (signal || "none") + " gotProgress=" + gotProgress + " stderrLines=" + stderrLines.length);
        if (finished) return;
        if (code === 0) {
          dbg("info", "NCNN-DEBUG", "Exit code 0, checking output in 500ms...");
          setTimeout(function () {
            finalize(true);
          }, 500);
        } else if (!gotProgress && code !== 0) {
          var joined = (allStderr || "").toLowerCase();
          dbg("warn", "NCNN-DEBUG", "No progress emitted, crash analysis. stderr dump: " + (allStderr || "(empty)"));
          if (/vulkan-1\.dll|vulkan/i.test(joined)) {
            finalize(false, "Vulkan runtime not found. Update your GPU drivers from AMD/NVIDIA website.");
          } else if (/vcruntime|msvcp|visual c\+\+|\.dll was not found/i.test(joined)) {
            finalize(false, "Microsoft Visual C++ Redistributable missing. Download from https://aka.ms/vs/17/release/vc_redist.x64.exe");
          } else if (/cuda|driver/i.test(joined)) {
            finalize(false, "GPU driver or CUDA error. Update your GPU drivers. Full error: " + allStderr.slice(0, 200));
          } else {
            finalize(false, "NCNN process exited immediately (code " + code + "). " +
              "Possible causes: missing Vulkan driver, missing VC++ Redistributable, or incompatible GPU. " +
              "Check console for more details.");
          }
        } else {
          finalize(false, "NCNN process exited with code " + code + ". Last stderr: " + (stderrLines.length > 0 ? stderrLines[stderrLines.length - 1] : "(none)"));
        }
      });

      proc.on("error", function (err) {
        dbg("error", "NCNN-DEBUG", "Process error event: " + err.message + " (code: " + (err.code || "none") + ")");
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
