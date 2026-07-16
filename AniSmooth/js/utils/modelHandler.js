(function () {
  var ModelHandler = {
    
    activeProcess: null,
    _cancelling: false,

    
    executeModel: function (command, args, callbacks) {
      var self = this;
      if (this.activeProcess || this._cancelling) {
        if (callbacks.onError) {
          callbacks.onError("A model execution process is already running.");
        }
        return;
      }

      
      var lowerCmd = command.toLowerCase();
      if (lowerCmd !== "python" && lowerCmd !== "python3") {
        if (command.indexOf("\\\\") === 0 || command.indexOf("//") === 0) {
          if (callbacks.onError) {
            callbacks.onError("UNC/network path rejected: " + command);
          }
          return;
        }
        var exeName = lowerCmd.split(/[\\\/]/).pop();
        if (exeName !== "python.exe" && exeName !== "python3.exe") {
          if (callbacks.onError) {
            callbacks.onError("Untrusted or invalid Python executable path rejected: " + command);
          }
          return;
        }
      }

      dbg('info', 'ModelHandler', 'Spawning: ' + command + ' ' + args.join(' '));
      
      try {
        var appdata = "";
        try { appdata = process.env.APPDATA || ""; } catch (e) {}
        if (!appdata && window.FileSystem && window.FileSystem.os && window.FileSystem.path) {
          appdata = window.FileSystem.path.join(window.FileSystem.os.homedir(), "AppData", "Roaming");
        }
        var toolsFolder = appdata ? window.FileSystem.path.join(appdata, "com.moongetsu.extensions", "AniSmooth", "backend") : "C:\\AniSmoothTools";

        var env = {};
        for (var key in process.env) {
          if (process.env.hasOwnProperty(key)) {
            env[key] = process.env[key];
          }
        }
        
        
        if (process.platform === 'win32') {
          if (!env.SystemRoot) env.SystemRoot = process.env.SystemRoot || "C:\\Windows";
          if (!env.windir) env.windir = process.env.windir || "C:\\Windows";
          var pathKey = 'PATH';
          if ('Path' in env) pathKey = 'Path';
          else if ('PATH' in env) pathKey = 'PATH';
          
          if (env[pathKey]) {
            env[pathKey] = env[pathKey] + ";" + toolsFolder;
          } else {
            env[pathKey] = toolsFolder;
          }
        } else {
          if (env.PATH) {
            env.PATH = env.PATH + ":" + toolsFolder;
          } else {
            env.PATH = toolsFolder;
          }
        }

        var proc = window.FileSystem.childProcess.spawn(command, args, { env: env });
        this.activeProcess = proc;

        if (callbacks.onStart) {
          callbacks.onStart();
        }

        proc.stdout.on('data', function (data) {
          var text = data.toString();
          if (callbacks.onLog) callbacks.onLog(text);
          self.parseProgress(text, callbacks.onProgress);
        });

        proc.stderr.on('data', function (data) {
          var text = data.toString();
          if (callbacks.onLog) callbacks.onLog('[stderr] ' + text);
          self.parseProgress(text, callbacks.onProgress);
        });

        proc.on('close', function (code) {
          self.activeProcess = null;
          self._cancelling = false;
          if (code === 0) {
            dbg('success', 'ModelHandler', 'Process completed successfully.');
            if (callbacks.onComplete) callbacks.onComplete();
          } else {
            dbg('error', 'ModelHandler', 'Process exited with code ' + code);
            if (callbacks.onError) callbacks.onError('Process exited with code ' + code);
          }
        });

        proc.on('error', function (err) {
          if (err.code === 'ENOENT' && command === 'python') {
            dbg('warn', 'ModelHandler', 'python not found in PATH. Attempting automatic local lookup...');
            var localPython = self.findLocalPython();
            if (localPython) {
              dbg('info', 'ModelHandler', 'Found Python at: ' + localPython + '. Updating config and retrying...');
              if (window.App && window.App.settings) {
                window.App.settings.pythonPath = localPython;
                window.StorageManager.setItem("anismooth_python_path", localPython);
                var pythonInput = document.getElementById("pythonPathInput");
                if (pythonInput) pythonInput.value = localPython;
              }
              self.activeProcess = null;
              self._cancelling = false;
              self.executeModel(localPython, args, callbacks);
              return;
            }
          }
          self.activeProcess = null;
          self._cancelling = false;
          dbg('error', 'ModelHandler', 'Process error: ' + err.message);
          if (callbacks.onError) callbacks.onError(err.message);
        });

      } catch (err) {
        if (err.code === 'ENOENT' && command === 'python') {
          dbg('warn', 'ModelHandler', 'python spawn throw. Attempting lookup...');
          var localPython = self.findLocalPython();
          if (localPython) {
            if (window.App && window.App.settings) {
              window.App.settings.pythonPath = localPython;
              window.StorageManager.setItem("anismooth_python_path", localPython);
            }
            this.activeProcess = null;
            this._cancelling = false;
            this.executeModel(localPython, args, callbacks);
            return;
          }
        }
        this.activeProcess = null;
        this._cancelling = false;
        dbg('error', 'ModelHandler', 'Failed to start process: ' + err.message);
        if (callbacks.onError) callbacks.onError(err.message);
      }
    },

    findLocalPython: function() {
      try {
        var localappdata = (process.env && process.env.LOCALAPPDATA) || "";
        var userprofile = (process.env && process.env.USERPROFILE) || "";
        var programfiles = (process.env && process.env.ProgramFiles) || "C:\\Program Files";
        var fs = window.FileSystem.fs;
        var path = window.FileSystem.path;
        
        if (fs && path) {
          var searchDirs = [];
          if (localappdata) searchDirs.push(path.join(localappdata, "Programs", "Python"));
          if (userprofile) searchDirs.push(path.join(userprofile, "AppData", "Local", "Programs", "Python"));
          if (programfiles) searchDirs.push(path.join(programfiles, "Python"));
          
          for (var i = 0; i < searchDirs.length; i++) {
            var dir = searchDirs[i];
            if (fs.existsSync(dir)) {
              var subdirs = fs.readdirSync(dir);
              for (var j = 0; j < subdirs.length; j++) {
                var sub = subdirs[j];
                if (sub.toLowerCase().indexOf("python3") === 0 || sub.toLowerCase().indexOf("python") === 0) {
                  var fullPath = path.join(dir, sub, "python.exe");
                  if (fs.existsSync(fullPath)) {
                    return fullPath;
                  }
                }
              }
            }
          }
          
          if (localappdata) {
            var storePath = path.join(localappdata, "Microsoft", "WindowsApps", "python.exe");
            if (fs.existsSync(storePath)) {
              return storePath;
            }
          }
        }
      } catch (e) {}
      return null;
    },

    
    parseProgress: function (text, onProgress) {
      if (!onProgress) return;
      
      
      var match = text.match(/(\d+(?:\.\d+)?)\s*%/);
      if (match) {
        onProgress(parseFloat(match[1]));
        return;
      }

      match = text.match(/(\d+)\/(\d+)/);
      if (match) {
        var current = parseInt(match[1], 10);
        var total = parseInt(match[2], 10);
        if (total > 0) {
          onProgress(Math.round((current / total) * 100));
        }
      }
    },

    
    cancelActiveProcess: function () {
      if (!this.activeProcess || this._cancelling) return false;
      dbg('info', 'ModelHandler', 'Killing active process...');
      var proc = this.activeProcess;
      this._cancelling = true;

      try {
        if (process.platform === 'win32' && proc.pid) {
          var self = this;
          window.FileSystem.childProcess.exec('taskkill /F /T /PID ' + proc.pid, function () {
            self._cancelling = false;
          });
        } else {
          proc.kill('SIGTERM');
          this._cancelling = false;
        }
      } catch (e) {
        try { proc.kill('SIGKILL'); } catch (e2) {}
        this._cancelling = false;
      }
      return true;
    },

    
    interpolateClip: function (inputPath, outputPath, modelKey, options, callbacks) {
      var vendor = (window.App && window.App._gpuVendor) || "unknown";
      if (vendor === "amd" && window.NcnnHandler && window.NcnnHandler.isAvailable()) {
        outputPath = outputPath.replace(/\.\w+$/, ".mp4");
        var ncnnOpts = {
          model: modelKey || "rife-v4.26",
          factor: options.fpsFactor || "2",
          threadCount: "4:4:4"
        };
        window.NcnnHandler.run(inputPath, outputPath, "rife-ncnn-vulkan", ncnnOpts, callbacks);
        return;
      }
      if (vendor === "amd") {
        if (callbacks.onError) callbacks.onError("NCNN Vulkan binaries not found. Install them in Settings → Tools.");
        return;
      }

      var pythonCmd = window.App && window.App.settings.pythonPath ? window.App.settings.pythonPath : 'python';
      
      var extPath = "";
      try {
        var cs = new CSInterface();
        extPath = cs.getSystemPath(SystemPath.EXTENSION);
      } catch (e) {}

      var scriptPath = (window.FileSystem.path && extPath) ? window.FileSystem.path.join(extPath, 'python', 'main.py') : 'main.py';

      var args = [
        scriptPath,
        "--mode", "interpolate",
        "--input", inputPath,
        "--output", outputPath,
        "--model", modelKey,
        "--factor", options.fpsFactor || "2"
      ];
      if (options.targetSizeMb && parseFloat(options.targetSizeMb) > 0) {
        args.push("--target-size-mb", String(parseFloat(options.targetSizeMb)));
      }
      if (options.preset) {
        args.push("--preset", options.preset);
      }

      this.executeModel(pythonCmd, args, callbacks);
    },

    
    upscaleClip: function (inputPath, outputPath, modelKey, options, callbacks) {
      var vendor = (window.App && window.App._gpuVendor) || "unknown";
      if (vendor === "amd" && window.NcnnHandler && window.NcnnHandler.isAvailable()) {
        outputPath = outputPath.replace(/\.\w+$/, ".mp4");
        var ncnnOpts = {
          model: modelKey || "realesr-animevideov3",
          scale: options.scale || "2",
          threadCount: "4:4:4"
        };
        window.NcnnHandler.run(inputPath, outputPath, "realesrgan-ncnn-vulkan", ncnnOpts, callbacks);
        return;
      }
      if (vendor === "amd") {
        if (callbacks.onError) callbacks.onError("NCNN Vulkan binaries not found. Install them in Settings → Tools.");
        return;
      }

      var pythonCmd = window.App && window.App.settings.pythonPath ? window.App.settings.pythonPath : 'python';
      
      var extPath = "";
      try {
        var cs = new CSInterface();
        extPath = cs.getSystemPath(SystemPath.EXTENSION);
      } catch (e) {}

      var scriptPath = (window.FileSystem.path && extPath) ? window.FileSystem.path.join(extPath, 'python', 'main.py') : 'main.py';
      
      var args = [
        scriptPath,
        "--mode", "upscale",
        "--input", inputPath,
        "--output", outputPath,
        "--model", modelKey,
        "--factor", options.scale || "2"
      ];
      if (options.targetSizeMb && parseFloat(options.targetSizeMb) > 0) {
        args.push("--target-size-mb", String(parseFloat(options.targetSizeMb)));
      }
      if (options.preset) {
        args.push("--preset", options.preset);
      }
      if (options.fitW && parseInt(options.fitW) > 0) {
        args.push("--fit-w", String(parseInt(options.fitW)));
      }
      if (options.fitH && parseInt(options.fitH) > 0) {
        args.push("--fit-h", String(parseInt(options.fitH)));
      }

      this.executeModel(pythonCmd, args, callbacks);
    },

    
    dedupeClip: function (inputPath, outputPath, options, callbacks) {
      var pythonCmd = window.App && window.App.settings.pythonPath ? window.App.settings.pythonPath : 'python';

      var extPath = "";
      try {
        var cs = new CSInterface();
        extPath = cs.getSystemPath(SystemPath.EXTENSION);
      } catch (e) {}

      var scriptPath = (window.FileSystem.path && extPath) ? window.FileSystem.path.join(extPath, 'python', 'main.py') : 'main.py';

      var opts = options || {};
      var args = [
        scriptPath,
        "--mode", "dedupe",
        "--input", inputPath,
        "--output", outputPath,
        "--flow-threshold", String(opts.flowThreshold !== undefined ? opts.flowThreshold : 0.5),
        "--motion-area-fraction", String(opts.motionAreaFraction !== undefined ? opts.motionAreaFraction : 0.15),
        "--cadence", String(opts.cadence !== undefined ? opts.cadence : 3),
        "--detect-scale", String(opts.detectScale !== undefined ? opts.detectScale : 1.0)
      ];

      if (opts.auto) {
        args.push("--auto");
      }
      if (opts.keepTalking) {
        args.push("--keep-talking");
      }
      if (opts.keepCamera) {
        args.push("--keep-camera");
      }
      if (opts.parallax) {
        args.push("--parallax");
      }
      if (opts.smallMovements !== undefined && opts.smallMovements !== null) {
        args.push("--small-movements", String(opts.smallMovements));
      }

      this.executeModel(pythonCmd, args, callbacks);
    }
  };

  window.ModelHandler = ModelHandler;
})();
