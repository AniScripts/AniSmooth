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

      var finalOutputPath = outputPath;
      var tempPngDir = null;

      if (outputExt === "avi") {
        finalOutputPath = outputPath.replace(/\.\w+$/, ".mp4");
      }

      var appdata = "";
      try { appdata = process.env.APPDATA || ""; } catch (e) {}
      if (!appdata && window.FileSystem.os) {
        appdata = p.join(window.FileSystem.os.homedir(), "AppData", "Roaming");
      }
      var backendDir = appdata ? p.join(appdata, "com.moongetsu.extensions", "AniSmooth", "backend") : "";
      var ffmpegPath = backendDir ? p.join(backendDir, "ffmpeg.exe") : "";
      var ffmpegDir = "";
      if (ffmpegPath && fs.existsSync(ffmpegPath)) {
        ffmpegDir = backendDir;
      } else {
        ffmpegPath = null;
        try {
          ffmpegPath = require("child_process").execSync("where ffmpeg", { encoding: "utf8" }).trim().split("\n")[0];
          if (ffmpegPath) ffmpegDir = p.dirname(ffmpegPath);
        } catch (e) {}
      }
      dbg("info", "NCNN-DEBUG", "FFmpeg: " + (ffmpegPath || "NOT FOUND") + " dir: " + (ffmpegDir || "N/A"));

      tempPngDir = inputPath.replace(/\.\w+$/, "_ncnn_frames");
      try { if (fs.existsSync(tempPngDir)) { var oldFiles = fs.readdirSync(tempPngDir); for (var fi = 0; fi < oldFiles.length; fi++) fs.unlinkSync(p.join(tempPngDir, oldFiles[fi])); } else { fs.mkdirSync(tempPngDir); } } catch (e) { dbg("warn", "NCNN-DEBUG", "Temp dir error: " + e.message); }
      dbg("info", "NCNN-DEBUG", "PNG output dir: " + tempPngDir);

      var exeDir = p.dirname(exe);
      var gpuId = window.StorageManager.getItem("anismooth_ncnn_gpu_id", "0") || "0";

      var ncnnInputDir = null;
      var ncnnOutputDir = tempPngDir;

      if (inputExt === "avi" && ffmpegPath) {
        ncnnInputDir = inputPath.replace(/\.\w+$/, "_ncnn_input");
        dbg("info", "NCNN-DEBUG", "Converting AVI to PNG frames: " + inputPath + " -> " + ncnnInputDir);
        try {
          if (fs.existsSync(ncnnInputDir)) {
            var oldF = fs.readdirSync(ncnnInputDir);
            for (var oi = 0; oi < oldF.length; oi++) fs.unlinkSync(p.join(ncnnInputDir, oldF[oi]));
          } else { fs.mkdirSync(ncnnInputDir); }
          var avi2png = cp.spawnSync(ffmpegPath, [
            "-y", "-i", inputPath,
            "-fps_mode", "cfr",
            p.join(ncnnInputDir, "frame_%08d.png")
          ], { windowsHide: true, timeout: 120000 });
          dbg("info", "NCNN-DEBUG", "AVI->PNG exit: " + avi2png.status + " stderr: " + (avi2png.stderr ? avi2png.stderr.toString().slice(0, 300) : ""));
          if (avi2png.status !== 0) {
            dbg("warn", "NCNN-DEBUG", "AVI->PNG conversion failed, trying direct AVI file");
            try { fs.rmdirSync(ncnnInputDir); } catch (e) {}
            ncnnInputDir = null;
          }
        } catch (e) {
          dbg("warn", "NCNN-DEBUG", "AVI->PNG error: " + e.message);
          ncnnInputDir = null;
        }
      }

      var args;
      var factor = parseInt(options.factor, 10) || 2;
      var passes = Math.max(1, Math.round(Math.log2(factor)));
      dbg("info", "NCNN-DEBUG", "Factor " + factor + " -> " + passes + " pass(es)");

      if (ncnnInputDir) {
        this._cancelled = false;
        var passInput = ncnnInputDir;
        var passOutput = tempPngDir;
        var currentPass = 0;

        var envAsync = {};
        for (var key in process.env) {
          if (process.env.hasOwnProperty(key)) envAsync[key] = process.env[key];
        }
        if (!envAsync.PATH) envAsync.PATH = "";
        envAsync.PATH = exeDir + ";" + (ffmpegDir ? ffmpegDir + ";" : "") + envAsync.PATH;

        function runNextPass() {
          if (self._cancelled) {
            _cleanupTempDir();
            return;
          }
          if (currentPass > 0) {
            var tmp = passInput;
            passInput = passOutput;
            passOutput = tmp;
            try {
              if (fs.existsSync(passOutput)) {
                var oldF = fs.readdirSync(passOutput);
                for (var oi = 0; oi < oldF.length; oi++) fs.unlinkSync(p.join(passOutput, oldF[oi]));
              } else { fs.mkdirSync(passOutput); }
            } catch (e) {}
          }
          var inCount = fs.existsSync(passInput) ? fs.readdirSync(passInput).length : 0;
          dbg("info", "NCNN-DEBUG", "Pass " + (currentPass + 1) + "/" + passes + ": " + inCount + " frames, " + passInput + " -> " + passOutput);
          var passArgs = ["-i", passInput, "-o", passOutput, "-g", gpuId, "-m", options.model || "rife-v4.6", "-j", String(options.threadCount || "4:4:4")];
          if (passes === 1) passArgs.push("-x", String(factor));

          var passProc = cp.spawn(exe, passArgs, { env: envAsync, cwd: exeDir, windowsHide: true });
          self.activeProcess = passProc;
          if (callbacks.onProgress && currentPass === 0) callbacks.onProgress(0);

          passProc.on("close", function (code) {
            if (self._cancelled) { _cleanupTempDir(); return; }
            if (code !== 0) {
              dbg("error", "NCNN-DEBUG", "Pass " + (currentPass + 1) + " failed with code " + code);
              if (callbacks.onError) callbacks.onError("NCNN pass " + (currentPass + 1) + " failed with code " + code);
              _cleanupTempDir();
              return;
            }
            dbg("info", "NCNN-DEBUG", "Pass " + (currentPass + 1) + " done");
            currentPass++;
            if (callbacks.onProgress) callbacks.onProgress(Math.round((currentPass / passes) * 50));
            if (currentPass >= passes) {
              tempPngDir = passOutput;
              self.activeProcess = null;
              dbg("info", "NCNN-DEBUG", "All passes done, output dir: " + tempPngDir + " (" + (fs.existsSync(tempPngDir) ? fs.readdirSync(tempPngDir).length : 0) + " frames)");
              finished = false;
              finalize(true);
            } else {
              runNextPass();
            }
          });
          passProc.on("error", function (err) {
            dbg("error", "NCNN-DEBUG", "Pass " + (currentPass + 1) + " error: " + err.message);
            if (callbacks.onError) callbacks.onError("NCNN pass error: " + err.message);
            _cleanupTempDir();
          });
          passProc.stderr.on("data", function (data) {
            var text = data.toString().trim();
            if (text) dbg("debug", "NCNN-DEBUG", "Pass " + (currentPass + 1) + " stderr: " + text);
            if (callbacks.onLog) callbacks.onLog(text);
          });
        }

        if (callbacks.onStart) callbacks.onStart();
        runNextPass();
        return;
      } else {
        dbg("info", "NCNN-DEBUG", "No FFmpeg, direct file mode: " + inputPath + " -> " + finalOutputPath);
        args = ["-i", inputPath, "-o", finalOutputPath, "-g", gpuId, "-m", options.model || "rife-v4.6", "-j", String(options.threadCount || "4:4:4")];
        if (factor > 0) args.push("-x", String(factor));
      }

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
      env.PATH = exeDir + ";" + (ffmpegDir ? ffmpegDir + ";" : "") + env.PATH;
      dbg("info", "NCNN-DEBUG", "Env keys: " + envKeys + ", PATH prefix: " + exeDir + (ffmpegDir ? ";" + ffmpegDir : ""));

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
        if (self._cancelled) { dbg("info", "NCNN-DEBUG", "Cancelled, aborting"); self._cancelled = false; _cleanupTempDir(); return; }
        if (ok) {
          if (tempPngDir && ffmpegPath && fs.existsSync(tempPngDir)) {
            var frames = [];
            try { var allFiles = fs.readdirSync(tempPngDir); for (var fi = 0; fi < allFiles.length; fi++) { if (/\.png$/i.test(allFiles[fi])) frames.push(allFiles[fi]); } } catch (e) {}
            dbg("info", "NCNN-DEBUG", "PNG frames found: " + frames.length);
            if (frames.length > 0) {
              frames.sort();
              var concatPath = p.join(tempPngDir, "_concat.txt");
              var concatContent = "";
              for (var fi = 0; fi < frames.length; fi++) {
                concatContent += "file '" + frames[fi] + "'\n";
              }
              fs.writeFileSync(concatPath, concatContent);
              var fpsEstimate = options.factor ? (parseFloat(options.factor) * 24) : 24;
              dbg("info", "NCNN-DEBUG", "Encoding " + frames.length + " PNG frames -> MP4 at " + fpsEstimate + "fps");
              try {
                var encResult = cp.spawnSync(ffmpegPath, [
                  "-y", "-f", "concat", "-safe", "0", "-r", String(fpsEstimate), "-i", concatPath,
                  "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                  "-pix_fmt", "yuv420p", "-an",
                  finalOutputPath
                ], { cwd: tempPngDir, windowsHide: true, timeout: 300000 });
                dbg("info", "NCNN-DEBUG", "FFmpeg encode exit: " + encResult.status);
                if (encResult.status === 0 && fs.existsSync(finalOutputPath)) {
                  dbg("info", "NCNN-DEBUG", "Final MP4: " + finalOutputPath + " (" + fs.statSync(finalOutputPath).size + " bytes)");
                  _cleanupTempDir();
                  dbg("success", "NCNN", "Completed: " + finalOutputPath);
                  if (callbacks.onComplete) callbacks.onComplete(finalOutputPath);
                  return;
                }
              } catch (e) { dbg("error", "NCNN-DEBUG", "FFmpeg encode error: " + e.message); }
            }
          }
          _cleanupTempDir();
          if (fs.existsSync(finalOutputPath)) {
            dbg("info", "NCNN-DEBUG", "Output exists: " + finalOutputPath + " (size: " + fs.statSync(finalOutputPath).size + ")");
            dbg("success", "NCNN", "Completed: " + finalOutputPath);
            if (callbacks.onComplete) callbacks.onComplete(finalOutputPath);
          } else {
            dbg("error", "NCNN-DEBUG", "Output missing: " + finalOutputPath);
            dbg("error", "NCNN", "Output file not found: " + finalOutputPath);
            if (callbacks.onError) callbacks.onError("NCNN completed but no output file was produced.");
          }
        } else {
          _cleanupTempDir();
          dbg("error", "NCNN-DEBUG", "Error: " + message);
          dbg("error", "NCNN", message);
          if (callbacks.onError) callbacks.onError(message);
        }
      };

      function _cleanupTempDir() {
        if (tempPngDir) {
          try {
            if (fs.existsSync(tempPngDir)) {
              var files = fs.readdirSync(tempPngDir);
              for (var fi = 0; fi < files.length; fi++) fs.unlinkSync(p.join(tempPngDir, files[fi]));
              fs.rmdirSync(tempPngDir);
            }
          } catch (e) {}
        }
        if (ncnnInputDir) {
          try {
            if (fs.existsSync(ncnnInputDir)) {
              var files2 = fs.readdirSync(ncnnInputDir);
              for (var fi = 0; fi < files2.length; fi++) fs.unlinkSync(p.join(ncnnInputDir, files2[fi]));
              fs.rmdirSync(ncnnInputDir);
            }
          } catch (e) {}
        }
      }

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
        { value: "rife-v4.6", label: "RIFE 4.6", backend: "vulkan", desc: "Latest, best quality" },
        { value: "rife-v4", label: "RIFE 4.0", backend: "vulkan", desc: "v4 base model" },
        { value: "rife-v3.1", label: "RIFE 3.1", backend: "vulkan", desc: "v3 general" },
        { value: "rife-v3.0", label: "RIFE 3.0", backend: "vulkan", desc: "v3 base model" },
        { value: "rife-v2.4", label: "RIFE 2.4", backend: "vulkan", desc: "Widest GPU compat" },
        { value: "rife-v2.3", label: "RIFE 2.3", backend: "vulkan", desc: "Legacy v2 model" },
        { value: "rife-v2", label: "RIFE 2.0", backend: "vulkan", desc: "Oldest v2 model" },
        { value: "rife-anime", label: "RIFE Anime", backend: "vulkan", desc: "2D/anime optimized" },
        { value: "rife-HD", label: "RIFE HD", backend: "vulkan", desc: "HD optimized" },
        { value: "rife-UHD", label: "RIFE UHD", backend: "vulkan", desc: "4K+ optimized" },
        { value: "rife", label: "RIFE (default)", backend: "vulkan", desc: "Original default model" }
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
