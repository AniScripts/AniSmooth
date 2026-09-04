(function () {
  var nodeRequire = (typeof window !== 'undefined' && window.cep && window.cep.node && window.cep.node.require)
      ? window.cep.node.require
      : (typeof require !== 'undefined' ? require : null);

  var fs = nodeRequire ? nodeRequire('fs') : null;
  var path = nodeRequire ? nodeRequire('path') : null;
  var os = nodeRequire ? nodeRequire('os') : null;
  var childProcess = nodeRequire ? nodeRequire('child_process') : null;

  var FileSystem = {
    fs: fs,
    path: path,
    os: os,
    childProcess: childProcess,

    getAppDataDir: function () {
      if (process.platform === "darwin") {
        return os ? path.join(os.homedir(), "Library", "Application Support") : "";
      }
      var appdata = "";
      try { appdata = process.env.APPDATA || ""; } catch (e) {}
      if (!appdata && os) {
        appdata = path.join(os.homedir(), "AppData", "Roaming");
      }
      return appdata;
    },

    createFolder: function (folder) {
      if (!fs) return;
      try {
        if (!fs.existsSync(folder)) {
          fs.mkdirSync(folder, { recursive: true });
        }
      } catch (e) {
        console.error("Failed to create folder:", folder, e);
      }
    },

    deleteFolderRecursive: function (folderPath) {
      if (!fs) return;
      try {
        if (fs.existsSync(folderPath)) {
          var self = this;
          fs.readdirSync(folderPath).forEach(function (file) {
            var curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              self.deleteFolderRecursive(curPath);
            } else {
              fs.unlinkSync(curPath);
            }
          });
          fs.rmdirSync(folderPath);
        }
      } catch (e) {
        console.error("Failed to delete folder:", folderPath, e);
      }
    },

    copyFolderRecursive: function (sourceFolder, targetFolder) {
      if (!fs) return;
      this.createFolder(targetFolder);
      var self = this;
      fs.readdirSync(sourceFolder).forEach(function (name) {
        var sourcePath = path.join(sourceFolder, name);
        var targetPath = path.join(targetFolder, name);
        var stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
          self.copyFolderRecursive(sourcePath, targetPath);
        } else {
          fs.copyFileSync(sourcePath, targetPath);
        }
      });
    },

    calculateFolderSizeMB: function (folderPath) {
      if (!fs) return 0;
      var totalBytes = 0;
      try {
        if (!fs.existsSync(folderPath)) return 0;
        var files = fs.readdirSync(folderPath);
        files.forEach(function (file) {
          try {
            var p = path.join(folderPath, file);
            var stat = fs.statSync(p);
            if (stat.isFile()) {
              totalBytes += stat.size;
            }
          } catch (e) {}
        });
      } catch (err) {}
      return totalBytes / (1024 * 1024);
    },

    getFreeDiskSpaceMB: function (dirPath) {
      if (!childProcess) return 0;
      if (process.platform === "win32") {
        try {
          var driveLetter = (dirPath && dirPath[0]) ? dirPath[0] : "C";
          var ps = childProcess.execFileSync("powershell.exe", [
            "-NoProfile", "-Command",
            "(Get-PSDrive -Name '" + driveLetter + "').Free"
          ], { encoding: "utf8", windowsHide: true });
          var freeBytes = parseInt(ps, 10) || 0;
          return Math.floor(freeBytes / (1024 * 1024));
        } catch (e) {
          return 0;
        }
      } else {
        try {
          var checkDir = dirPath || (os ? os.homedir() : "/");
          var res = childProcess.execFileSync("df", ["-k", checkDir], { encoding: "utf8" });
          var lines = res.trim().split("\n");
          if (lines.length > 1) {
            var tokens = lines[1].trim().split(/\s+/);
            if (tokens.length >= 4) {
              var availKb = parseInt(tokens[3], 10) || 0;
              return Math.floor(availKb / 1024);
            }
          }
        } catch (e2) {}
        return 0;
      }
    },

    pathToFileUrl: function (filePath) {
      if (!filePath) return "";
      var pathName = path ? path.resolve(filePath).replace(/\\/g, "/") : filePath.replace(/\\/g, "/");
      if (!pathName.startsWith("/")) {
        pathName = "/" + pathName;
      }
      return encodeURI("file://" + pathName);
    },

    getExtension: function (filePath) {
      if (!filePath) return "";
      var dot = filePath.lastIndexOf(".");
      return dot >= 0 ? filePath.substring(dot + 1) : "";
    },

    getFileNameWithoutExtension: function (filePath) {
      if (!filePath) return "";
      var base = path ? path.basename(filePath) : filePath;
      var dot = base.lastIndexOf(".");
      return dot >= 0 ? base.substring(0, dot) : base;
    },

    runPowerShellDialog: function (command) {
      if (!childProcess || process.platform !== "win32") {
        return "";
      }
      try {
        var result = childProcess.execFileSync(
          "powershell.exe",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-Command", command],
          { encoding: "utf8", windowsHide: true }
        );
        return String(result || "").replace(/\r/g, "").replace(/\n/g, "").trim();
      } catch (e) {
        console.error("PowerShell dialog failed:", e.message);
        return "";
      }
    },

    runAppleScript: function (script) {
      if (!childProcess || process.platform !== "darwin") {
        return "";
      }
      try {
        var result = childProcess.execFileSync(
          "osascript",
          ["-e", script],
          { encoding: "utf8" }
        );
        return String(result || "").replace(/\r/g, "").replace(/\n/g, "").trim();
      } catch (e) {
        return "";
      }
    },

    extractZipArchive: function (zipPath, destFolder) {
      if (!childProcess) return false;
      if (process.platform === "win32") {
        try {
          var env = Object.assign({}, process.env, {
            ANISMOOTH_ZIP: String(zipPath || ""),
            ANISMOOTH_DEST: String(destFolder || "")
          });
          childProcess.execFileSync(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
             "Expand-Archive -LiteralPath $env:ANISMOOTH_ZIP -DestinationPath $env:ANISMOOTH_DEST -Force"],
            { encoding: "utf8", windowsHide: true, env: env }
          );
          return true;
        } catch (e) {
          console.error("Zip extraction failed:", e.message);
          return false;
        }
      } else {
        try {
          childProcess.execFileSync("unzip", ["-q", "-o", zipPath, "-d", destFolder], { encoding: "utf8" });
          return true;
        } catch (e2) {
          console.error("Zip extraction failed:", e2.message);
          return false;
        }
      }
    },

    extractZipPowerShell: function (zipPath, destFolder) {
      return this.extractZipArchive(zipPath, destFolder);
    },

    chooseFileWithSystemExplorer: function (title, startFolder, filter) {
      if (process.platform === "darwin") {
        var prompt = String(title || "Choose file").replace(/"/g, '\\"');
        var script = 'POSIX path of (choose file with prompt "' + prompt + '")';
        return this.runAppleScript(script);
      }

      var safeTitle = String(title || "Choose file").replace(/'/g, "''");
      var safeFolder = String(startFolder || (os ? os.homedir() : "")).replace(/'/g, "''");
      var safeFilter = String(filter || "All files (*.*)|*.*").replace(/'/g, "''");

      var command =
        "Add-Type -AssemblyName System.Windows.Forms; " +
        "$dialog = New-Object System.Windows.Forms.OpenFileDialog; " +
        "$dialog.Title = '" + safeTitle + "'; " +
        "$dialog.InitialDirectory = '" + safeFolder + "'; " +
        "$dialog.Filter = '" + safeFilter + "'; " +
        "$dialog.Multiselect = $false; " +
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { " +
        "  Write-Output $dialog.FileName " +
        "}";

      return this.runPowerShellDialog(command);
    },

    chooseFolderWithSystemExplorer: function (title, startFolder) {
      if (process.platform === "darwin") {
        var prompt = String(title || "Choose folder").replace(/"/g, '\\"');
        var script = 'POSIX path of (choose folder with prompt "' + prompt + '")';
        return this.runAppleScript(script);
      }

      var safeTitle = String(title || "Choose folder").replace(/'/g, "''");
      var safeFolder = String(startFolder || (os ? os.homedir() : "")).replace(/'/g, "''");

      var command =
        "Add-Type -AssemblyName System.Windows.Forms; " +
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; " +
        "$dialog.Description = '" + safeTitle + "'; " +
        "$dialog.SelectedPath = '" + safeFolder + "'; " +
        "$dialog.ShowNewFolderButton = $true; " +
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { " +
        "  Write-Output $dialog.SelectedPath " +
        "}";

      return this.runPowerShellDialog(command);
    },

    chooseSaveFileWithSystemExplorer: function (title, startFolder, defaultName) {
      if (process.platform === "darwin") {
        var prompt = String(title || "Save file").replace(/"/g, '\\"');
        var name = String(defaultName || "output.txt").replace(/"/g, '\\"');
        var script = 'POSIX path of (choose file name with prompt "' + prompt + '" default name "' + name + '")';
        return this.runAppleScript(script);
      }

      var safeTitle = String(title || "Save file").replace(/'/g, "''");
      var safeFolder = String(startFolder || (os ? os.homedir() : "")).replace(/'/g, "''");
      var safeName = String(defaultName || "log.txt").replace(/'/g, "''");

      var command =
        "Add-Type -AssemblyName System.Windows.Forms; " +
        "$dialog = New-Object System.Windows.Forms.SaveFileDialog; " +
        "$dialog.Title = '" + safeTitle + "'; " +
        "$dialog.InitialDirectory = '" + safeFolder + "'; " +
        "$dialog.FileName = '" + safeName + "'; " +
        "$dialog.Filter = 'Text files (*.txt)|*.txt|All files (*.*)|*.*'; " +
        "$dialog.DefaultExt = 'txt'; " +
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { " +
        "  Write-Output $dialog.FileName " +
        "}";

      return this.runPowerShellDialog(command);
    },

    revealFileInExplorer: function (filePath) {
      if (!filePath || !childProcess) return;
      try {
        if (process.platform === "darwin") {
          childProcess.spawn("open", ["-R", filePath], { detached: true, stdio: "ignore" }).unref();
        } else {
          var normPath = String(filePath).replace(/\//g, "\\");
          childProcess.spawn("explorer.exe", ["/select,", normPath], { detached: true, stdio: "ignore" }).unref();
        }
      } catch (e) {
        console.error("Failed to reveal file:", e.message);
      }
    }
  };

  window.FileSystem = FileSystem;
})();
