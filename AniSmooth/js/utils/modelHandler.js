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
      this._ffCancelled = true;
      if (this._ffPoll) { clearInterval(this._ffPoll); this._ffPoll = null; }

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
      if (options.sceneThreshold !== undefined && options.sceneThreshold !== null) {
        args.push("--scene-threshold", String(options.sceneThreshold));
      }

      this.executeModel(pythonCmd, args, callbacks);
    },

    
    upscaleClip: function (inputPath, outputPath, modelKey, options, callbacks) {
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

    
    dedupeClip: function (inputPath, outputPath, threshold, options, callbacks) {
      var pythonCmd = window.App && window.App.settings.pythonPath ? window.App.settings.pythonPath : 'python';

      var extPath = "";
      try {
        var cs = new CSInterface();
        extPath = cs.getSystemPath(SystemPath.EXTENSION);
      } catch (e) {}

      var scriptPath = (window.FileSystem.path && extPath) ? window.FileSystem.path.join(extPath, 'python', 'main.py') : 'main.py';

      var args = [
        scriptPath,
        "--mode", "dedupe",
        "--input", inputPath,
        "--output", outputPath,
        "--threshold", String(threshold)
      ];

      if (options) {
        if (options.regionSensitivity !== undefined) {
          args.push("--region-sensitivity", String(options.regionSensitivity));
        }
        if (options.useOpticalFlow === false) {
          args.push("--no-optical-flow");
        }
        if (options.cameraCompensation === false) {
          args.push("--no-camera-comp");
        }
        if (options.removeStaticSubject === false) {
          args.push("--no-static-subject");
        }
      }

      this.executeModel(pythonCmd, args, callbacks);
    },

    findFlowframes: function () {
      try {
        var fs = window.FileSystem.fs;
        var path = window.FileSystem.path;
        var configured = window.App && window.App.settings && window.App.settings.flowframesPath;
        if (configured && fs.existsSync(configured)) return configured;
        var localappdata = (process.env && process.env.LOCALAPPDATA) || "";
        if (localappdata) {
          var guess = path.join(localappdata, "Flowframes", "Flowframes.exe");
          if (fs.existsSync(guess)) return guess;
        }
      } catch (e) {}
      return null;
    },

    flowframesClip: function (inputPath, jobOutDir, options, callbacks) {
      var self = this;
      if (this.activeProcess || this._cancelling) {
        if (callbacks.onError) callbacks.onError("A model execution process is already running.");
        return;
      }

      var fs = window.FileSystem.fs;
      var path = window.FileSystem.path;
      var cp = window.FileSystem.childProcess;

      var exe = this.findFlowframes();
      if (!exe) {
        if (callbacks.onError) callbacks.onError("Flowframes.exe not found. Set its path in Settings.");
        return;
      }

      var logsDir = path.join(path.dirname(exe), "FlowframesData", "logs");

      var args = [
        "-a", "-nc", "-mdc",
        "-f", String(options.factor || "2"),
        "-ai", options.ai || "RifeNcnn",
        "-m", options.model || "RIFE 4.26",
        "-vf", options.format || "Mp4",
        "-ve", options.encoder || "X264",
        "-pf", options.pixelFormat || "Yuv420P",
        "-o", jobOutDir,
        inputPath
      ];
      if (options.maxFps && parseFloat(options.maxFps) > 0) args.push("-fps", String(parseFloat(options.maxFps)));
      if (options.maxHeight && parseInt(options.maxHeight) > 0) args.push("-mh", String(parseInt(options.maxHeight)));
      if (options.sceneChange) {
        args.push("-scn");
        if (options.sceneSensitivity) args.push("-scnv", String(options.sceneSensitivity));
      }

      var existingSessions = {};
      try {
        var pre = fs.readdirSync(logsDir);
        for (var i = 0; i < pre.length; i++) existingSessions[pre[i]] = true;
      } catch (e) {}

      var startTime = Date.now();
      this._ffCancelled = false;

      dbg("info", "Flowframes", "Launching: " + exe + " " + args.join(" "));

      var spawnAndWatch = function () {
        var env = {};
        for (var key in process.env) {
          if (process.env.hasOwnProperty(key) && key.toLowerCase() !== "nodefaultcurrentdirectoryinexepath") {
            env[key] = process.env[key];
          }
        }

        var proc;
        try {
          proc = cp.spawn(exe, args, { env: env });
        } catch (e) {
          if (callbacks.onError) callbacks.onError("Failed to launch Flowframes: " + e.message);
          return;
        }
        self.activeProcess = proc;
        if (callbacks.onStart) callbacks.onStart();

        var sessionLog = null;
        var lastLineCount = 0;
        var lastOutSize = -1;
        var stableCount = 0;
        var finished = false;

        var finalize = function (ok, message, producedPath) {
          if (finished) return;
          finished = true;
          if (self._ffPoll) { clearInterval(self._ffPoll); self._ffPoll = null; }
          self.activeProcess = null;
          self._cancelling = false;
          try { cp.exec('taskkill /F /T /IM Flowframes.exe', function () {}); } catch (e) {}
          if (self._ffCancelled) { self._ffCancelled = false; return; }
          if (ok) {
            dbg("success", "Flowframes", "Completed: " + producedPath);
            if (callbacks.onComplete) callbacks.onComplete(producedPath);
          } else {
            dbg("error", "Flowframes", message);
            if (callbacks.onError) callbacks.onError(message);
          }
        };

        var findNewestOutput = function () {
          try {
            var files = fs.readdirSync(jobOutDir);
            var best = null, bestM = 0;
            for (var i = 0; i < files.length; i++) {
              if (!/\.(mp4|mkv|webm|mov|avi)$/i.test(files[i])) continue;
              var fp = path.join(jobOutDir, files[i]);
              var st = fs.statSync(fp);
              if (st.isFile() && st.mtimeMs >= startTime - 2000 && st.mtimeMs >= bestM) {
                bestM = st.mtimeMs; best = fp;
              }
            }
            return best;
          } catch (e) { return null; }
        };

        self._ffPoll = setInterval(function () {
          if (!sessionLog) {
            try {
              var dirs = fs.readdirSync(logsDir);
              for (var i = 0; i < dirs.length; i++) {
                if (!existingSessions[dirs[i]]) {
                  var cand = path.join(logsDir, dirs[i], "sessionlog.txt");
                  if (fs.existsSync(cand)) { sessionLog = cand; break; }
                }
              }
            } catch (e) {}
          }
          if (sessionLog) {
            try {
              var content = fs.readFileSync(sessionLog, "utf8");
              var lines = content.split(/\r?\n/);
              for (var j = lastLineCount; j < lines.length; j++) {
                var ln = lines[j];
                if (!ln) continue;
                if (callbacks.onLog) callbacks.onLog(JSON.stringify({ type: "info", msg: ln }));
                if (/Failed to initialize MediaFile|\bError\b|\bFailed\b|could not|No frames/i.test(ln)) {
                  finalize(false, "Flowframes error: " + ln.replace(/^\[[^\]]*\]\s*\[[^\]]*\]:\s*/, ""));
                  return;
                }
                var pm = ln.match(/(\d+(?:\.\d+)?)\s*%/);
                if (pm && callbacks.onProgress) callbacks.onProgress(parseFloat(pm[1]));
                else {
                  var fm = ln.match(/Interpolating.*?(\d+)\s*\/\s*(\d+)/i);
                  if (fm && callbacks.onProgress && parseInt(fm[2], 10) > 0) {
                    callbacks.onProgress(Math.round((parseInt(fm[1], 10) / parseInt(fm[2], 10)) * 100));
                  }
                }
              }
              lastLineCount = lines.length;
            } catch (e) {}
          }

          var out = findNewestOutput();
          if (out) {
            try {
              var sz = fs.statSync(out).size;
              if (sz > 0 && sz === lastOutSize) {
                stableCount++;
                if (stableCount >= 2) { finalize(true, null, out); return; }
              } else { stableCount = 0; }
              lastOutSize = sz;
            } catch (e) {}
          }
        }, 1500);

        proc.on('close', function () {
          setTimeout(function () {
            if (finished) return;
            var out = findNewestOutput();
            if (out) finalize(true, null, out);
            else finalize(false, "Flowframes exited without producing an output file.");
          }, 2500);
        });

        proc.on('error', function (err) {
          finalize(false, "Flowframes process error: " + err.message);
        });
      };

      try {
        cp.exec('taskkill /F /T /IM Flowframes.exe', function () { setTimeout(spawnAndWatch, 800); });
      } catch (e) {
        spawnAndWatch();
      }
    }
  };

  window.ModelHandler = ModelHandler;
})();
