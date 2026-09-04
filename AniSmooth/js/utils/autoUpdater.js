(function () {
  var AutoUpdater = {
    currentVersion: "1.0.0",
    repo: "AniScripts/AniSmooth",
    latestRelease: null,
    isChecking: false,
    isUpdating: false,

    getCurrentVersion: function () {
      return this.currentVersion;
    },

    compareSemver: function (v1, v2) {
      var parse = function (v) {
        return String(v || "").replace(/^[^\d]*/, "").split(".").map(function (n) {
          return parseInt(n, 10) || 0;
        });
      };
      var p1 = parse(v1);
      var p2 = parse(v2);
      for (var i = 0; i < Math.max(p1.length, p2.length); i++) {
        var num1 = p1[i] || 0;
        var num2 = p2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
      }
      return 0;
    },

    checkForUpdates: function (manual, cb) {
      var self = this;
      if (this.isChecking) return;
      this.isChecking = true;

      var updateBtn = document.getElementById("checkUpdatesBtn");
      var updateStatus = document.getElementById("updateStatusText");
      if (manual && updateBtn) {
        updateBtn.disabled = true;
        updateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';
      }
      if (manual && updateStatus) {
        updateStatus.innerHTML = '<span class="form-hint"><i class="fa-solid fa-spinner fa-spin"></i> Checking GitHub for updates...</span>';
      }

      var nodeRequire = (typeof window !== 'undefined' && window.cep && window.cep.node && window.cep.node.require)
        ? window.cep.node.require
        : (typeof require !== 'undefined' ? require : null);
      var https = nodeRequire ? nodeRequire('https') : null;

      if (!https) {
        self.isChecking = false;
        if (manual && updateBtn) {
          updateBtn.disabled = false;
          updateBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Check for Updates';
        }
        if (manual && updateStatus) {
          updateStatus.innerHTML = '<span class="form-hint" style="color:var(--warn-text);">Auto-updater requires Node.js runtime.</span>';
        }
        if (cb) cb(null);
        return;
      }

      var options = {
        hostname: "api.github.com",
        path: "/repos/" + self.repo + "/releases/latest",
        method: "GET",
        headers: {
          "User-Agent": "AniSmooth-AutoUpdater/1.0.0"
        }
      };

      var req = https.request(options, function (res) {
        var body = "";
        res.on("data", function (chunk) { body += chunk; });
        res.on("end", function () {
          self.isChecking = false;
          if (manual && updateBtn) {
            updateBtn.disabled = false;
            updateBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Check for Updates';
          }

          if (res.statusCode === 200) {
            try {
              var release = JSON.parse(body);
              self.latestRelease = release;
              var remoteVer = release.tag_name || release.name || "";
              var hasUpdate = self.compareSemver(remoteVer, self.currentVersion) > 0;

              self._renderUpdateUI(hasUpdate, release, manual);
              if (cb) cb({ hasUpdate: hasUpdate, release: release });
            } catch (e) {
              if (manual && updateStatus) updateStatus.innerHTML = '<span class="form-hint" style="color:var(--error-text);">Failed to parse release data.</span>';
              if (cb) cb(null);
            }
          } else if (res.statusCode === 404) {
            if (manual && updateStatus) updateStatus.innerHTML = '<span class="form-hint" style="color:var(--ok-text);"><i class="fa-solid fa-check"></i> Up to date (No releases yet).</span>';
            if (cb) cb({ hasUpdate: false, release: null });
          } else {
            if (manual && updateStatus) updateStatus.innerHTML = '<span class="form-hint" style="color:var(--warn-text);">GitHub check returned HTTP ' + res.statusCode + '.</span>';
            if (cb) cb(null);
          }
        });
      });

      req.on("error", function (err) {
        self.isChecking = false;
        if (manual && updateBtn) {
          updateBtn.disabled = false;
          updateBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Check for Updates';
        }
        if (manual && updateStatus) {
          updateStatus.innerHTML = '<span class="form-hint" style="color:var(--warn-text);">Could not connect to GitHub. Check internet connection.</span>';
        }
        if (cb) cb(null);
      });

      req.end();
    },

    _renderUpdateUI: function (hasUpdate, release, manual) {
      var banner = document.getElementById("updateNotificationBanner");
      var updateStatus = document.getElementById("updateStatusText");
      var updateActions = document.getElementById("updateActionBtns");

      var remoteVer = release ? (release.tag_name || release.name) : "";
      var dismissedVer = window.StorageManager ? window.StorageManager.getItem("anismooth_dismissed_update") : "";

      if (hasUpdate && remoteVer && remoteVer !== dismissedVer) {
        if (banner) {
          banner.style.display = "flex";
          var bannerText = banner.querySelector(".update-banner-text");
          if (bannerText) bannerText.innerHTML = '<b>Update Available:</b> ' + remoteVer + ' is now ready!';
        }
      } else if (banner && !hasUpdate) {
        banner.style.display = "none";
      }

      if (updateStatus) {
        if (hasUpdate) {
          updateStatus.innerHTML = '<span class="form-hint" style="color:var(--ok-text);font-weight:600;"><i class="fa-solid fa-cloud-arrow-down"></i> New version ' + remoteVer + ' available!</span>';
        } else {
          updateStatus.innerHTML = '<span class="form-hint" style="color:var(--ok-text);"><i class="fa-solid fa-circle-check"></i> You are running the latest version (' + this.currentVersion + ').</span>';
        }
      }

      if (updateActions) {
        if (hasUpdate) {
          updateActions.style.display = "flex";
        } else {
          updateActions.style.display = "none";
        }
      }

      if (manual && !hasUpdate && window.showToast) {
        window.showToast("AniSmooth is up to date (v" + this.currentVersion + ")", "ok");
      }
    },

    dismissBanner: function () {
      var banner = document.getElementById("updateNotificationBanner");
      if (banner) banner.style.display = "none";
      if (this.latestRelease && window.StorageManager) {
        var ver = this.latestRelease.tag_name || this.latestRelease.name;
        window.StorageManager.setItem("anismooth_dismissed_update", ver);
      }
    },

    downloadAndInstallUpdate: function () {
      var self = this;
      if (this.isUpdating) return;
      if (!this.latestRelease) return;

      var downloadUrl = "";
      if (this.latestRelease.assets && this.latestRelease.assets.length > 0) {
        for (var i = 0; i < this.latestRelease.assets.length; i++) {
          var asset = this.latestRelease.assets[i];
          if (asset.name.indexOf(".zip") !== -1 || asset.name.indexOf(".zxp") !== -1) {
            downloadUrl = asset.browser_download_url;
            break;
          }
        }
      }
      if (!downloadUrl) {
        downloadUrl = this.latestRelease.zipball_url;
      }

      if (!downloadUrl) {
        if (window.showToast) window.showToast("No downloadable package found in release.", "error");
        return;
      }

      this.isUpdating = true;
      var installBtn = document.getElementById("installUpdateBtn");
      var progressBar = document.getElementById("updateProgressBar");
      var progressFill = document.getElementById("updateProgressFill");
      var progressText = document.getElementById("updateProgressText");

      if (installBtn) {
        installBtn.disabled = true;
        installBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading update...';
      }
      if (progressBar) progressBar.style.display = "block";
      if (progressFill) progressFill.style.width = "0%";
      if (progressText) progressText.textContent = "Starting download...";

      var fs = window.FileSystem.fs;
      var path = window.FileSystem.path;
      var appdata = (window.FileSystem.getAppDataDir && window.FileSystem.getAppDataDir()) || "";
      var tempDir = path.join(appdata, "com.moongetsu.extensions", "AniSmooth", "temp_update");
      window.FileSystem.createFolder(tempDir);

      var zipDest = path.join(tempDir, "update.zip");

      self._downloadFile(downloadUrl, zipDest, function (pct) {
        if (progressFill) progressFill.style.width = pct + "%";
        if (progressText) progressText.textContent = "Downloading update: " + pct + "%";
      }, function (err) {
        if (err) {
          self.isUpdating = false;
          if (installBtn) {
            installBtn.disabled = false;
            installBtn.innerHTML = '<i class="fa-solid fa-download"></i> 1-Click Update Now';
          }
          if (progressText) progressText.textContent = "Update failed: " + err.message;
          if (window.showToast) window.showToast("Update download failed: " + err.message, "error");
          return;
        }

        if (progressText) progressText.textContent = "Extracting update files...";

        var extractDir = path.join(tempDir, "extracted");
        window.FileSystem.createFolder(extractDir);

        var extracted = window.FileSystem.extractZipArchive(zipDest, extractDir);
        if (!extracted) {
          self.isUpdating = false;
          if (installBtn) {
            installBtn.disabled = false;
            installBtn.innerHTML = '<i class="fa-solid fa-download"></i> 1-Click Update Now';
          }
          if (progressText) progressText.textContent = "Extraction failed.";
          return;
        }

        var extPath = "";
        try {
          var cs = new CSInterface();
          extPath = cs.getSystemPath(SystemPath.EXTENSION);
        } catch (e) {}

        if (extPath && fs.existsSync(extPath)) {
          try {
            var files = fs.readdirSync(extractDir);
            var srcFolder = extractDir;
            if (files.length === 1 && fs.statSync(path.join(extractDir, files[0])).isDirectory()) {
              srcFolder = path.join(extractDir, files[0]);
              var nestedAniSmooth = path.join(srcFolder, "AniSmooth");
              if (fs.existsSync(nestedAniSmooth) && fs.statSync(nestedAniSmooth).isDirectory()) {
                srcFolder = nestedAniSmooth;
              }
            }
            window.FileSystem.copyFolderRecursive(srcFolder, extPath);

            self.isUpdating = false;
            if (progressText) progressText.textContent = "Update installed successfully!";
            if (installBtn) installBtn.innerHTML = '<i class="fa-solid fa-check"></i> Updated';

            if (window.showToast) window.showToast("Update complete! Please reload extension.", "ok");
            setTimeout(function () {
              if (window.location && window.location.reload) {
                window.location.reload();
              }
            }, 1800);
          } catch (copyErr) {
            self.isUpdating = false;
            if (progressText) progressText.textContent = "Copy error: " + copyErr.message;
          }
        } else {
          self.isUpdating = false;
          if (progressText) progressText.textContent = "Updated files extracted to temp folder.";
        }
      });
    },

    _downloadFile: function (url, dest, onProgress, onDone) {
      var nodeRequire = (typeof window !== 'undefined' && window.cep && window.cep.node && window.cep.node.require)
        ? window.cep.node.require
        : (typeof require !== 'undefined' ? require : null);
      var https = nodeRequire ? nodeRequire('https') : null;
      var http = nodeRequire ? nodeRequire('http') : null;
      var fs = window.FileSystem.fs;

      var file = fs.createWriteStream(dest);

      var client = url.indexOf("https") === 0 ? https : http;

      var req = client.get(url, {
        headers: { "User-Agent": "AniSmooth-AutoUpdater/1.0.0" }
      }, function (response) {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          return AutoUpdater._downloadFile(response.headers.location, dest, onProgress, onDone);
        }

        if (response.statusCode !== 200) {
          file.close();
          return onDone(new Error("HTTP " + response.statusCode));
        }

        var total = parseInt(response.headers['content-length'], 10) || 0;
        var cur = 0;

        response.on("data", function (chunk) {
          cur += chunk.length;
          file.write(chunk);
          if (total > 0 && onProgress) {
            var pct = Math.round((cur / total) * 100);
            onProgress(pct);
          }
        });

        response.on("end", function () {
          file.end();
          onDone(null);
        });
      });

      req.on("error", function (err) {
        try { fs.unlinkSync(dest); } catch (e) {}
        onDone(err);
      });
    }
  };

  window.AutoUpdater = AutoUpdater;
})();
