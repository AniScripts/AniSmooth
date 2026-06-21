(function () {
  const nodeRequire = (typeof window !== 'undefined' && window.cep && window.cep.node && window.cep.node.require)
      ? window.cep.node.require
      : (typeof require !== 'undefined' ? require : null);

  const fs = nodeRequire ? nodeRequire('fs') : null;
  const path = nodeRequire ? nodeRequire('path') : null;
  const os = nodeRequire ? nodeRequire('os') : null;
  const childProcess = nodeRequire ? nodeRequire('child_process') : null;

  const FileSystem = {
    fs,
    path,
    os,
    childProcess,

    createFolder(folder) {
      if (!fs) return;
      try {
        if (!fs.existsSync(folder)) {
          fs.mkdirSync(folder, { recursive: true });
        }
      } catch (e) {
        console.error("Failed to create folder:", folder, e);
      }
    },

    deleteFolderRecursive(folderPath) {
      if (!fs) return;
      try {
        if (fs.existsSync(folderPath)) {
          fs.readdirSync(folderPath).forEach((file) => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              this.deleteFolderRecursive(curPath);
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

    copyFolderRecursive(sourceFolder, targetFolder) {
      if (!fs) return;
      this.createFolder(targetFolder);
      fs.readdirSync(sourceFolder).forEach((name) => {
        const sourcePath = path.join(sourceFolder, name);
        const targetPath = path.join(targetFolder, name);
        const stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
          this.copyFolderRecursive(sourcePath, targetPath);
        } else {
          fs.copyFileSync(sourcePath, targetPath);
        }
      });
    },

    calculateFolderSizeMB(folderPath) {
      if (!fs) return 0;
      let totalBytes = 0;
      try {
        if (!fs.existsSync(folderPath)) return 0;
        const files = fs.readdirSync(folderPath);
        files.forEach((file) => {
          try {
            const p = path.join(folderPath, file);
            const stat = fs.statSync(p);
            if (stat.isFile()) {
              totalBytes += stat.size;
            }
          } catch (e) {}
        });
      } catch (err) {}
      return totalBytes / (1024 * 1024);
    },

    pathToFileUrl(filePath) {
      if (!filePath) return "";
      let pathName = path ? path.resolve(filePath).replace(/\\/g, "/") : filePath.replace(/\\/g, "/");
      if (!pathName.startsWith("/")) {
        pathName = "/" + pathName;
      }
      return encodeURI("file://" + pathName);
    },

    getExtension(filePath) {
      if (!filePath) return "";
      const dot = filePath.lastIndexOf(".");
      return dot >= 0 ? filePath.substring(dot + 1) : "";
    },

    getFileNameWithoutExtension(filePath) {
      if (!filePath) return "";
      const base = path ? path.basename(filePath) : filePath;
      const dot = base.lastIndexOf(".");
      return dot >= 0 ? base.substring(0, dot) : base;
    },

    runPowerShellDialog(command) {
      if (!childProcess || process.platform !== "win32") {
        return "";
      }
      try {
        const result = childProcess.execFileSync(
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

    extractZipPowerShell(zipPath, destFolder) {
      if (!childProcess || process.platform !== "win32") {
        return false;
      }
      try {
        // Pass the paths as environment data rather than interpolating them
        // into the command string. PowerShell only ever sees $env:* references,
        // so a path containing quotes/metacharacters cannot break out and
        // execute arbitrary code. -LiteralPath also disables wildcard globbing.
        const env = Object.assign({}, process.env, {
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
    },

    chooseFileWithSystemExplorer(title, startFolder, filter) {
      const safeTitle = String(title || "Choose file").replace(/'/g, "''");
      const safeFolder = String(startFolder || (os ? os.homedir() : "")).replace(/'/g, "''");
      const safeFilter = String(filter || "All files (*.*)|*.*").replace(/'/g, "''");

      const command =
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

    chooseFolderWithSystemExplorer(title, startFolder) {
      const safeTitle = String(title || "Choose folder").replace(/'/g, "''");
      const safeFolder = String(startFolder || (os ? os.homedir() : "")).replace(/'/g, "''");

      const command =
        "Add-Type -AssemblyName System.Windows.Forms; " +
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; " +
        "$dialog.Description = '" + safeTitle + "'; " +
        "$dialog.SelectedPath = '" + safeFolder + "'; " +
        "$dialog.ShowNewFolderButton = $true; " +
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { " +
        "  Write-Output $dialog.SelectedPath " +
        "}";

      return this.runPowerShellDialog(command);
    }
  };

  window.FileSystem = FileSystem;
})();
