(function () {
  var SysmonPanel = {
    init: function (app) {
      this.app = app;
      this.view = document.getElementById("sysmonView");
      this.refreshBtn = document.getElementById("sysmonRefreshBtn");
      this.bindEvents();
    },

    bindEvents: function () {
      var self = this;
      if (this.refreshBtn) {
        this.refreshBtn.addEventListener("click", function () {
          self.refreshMetrics();
        });
      }
    },

    active: false,
    _intervalTimer: null,

    startPolling: function () {
      var self = this;
      this.active = true;
      this.refreshMetrics();
      if (this._intervalTimer) clearInterval(this._intervalTimer);
      this._intervalTimer = setInterval(function () {
        if (self.active) {
          self.refreshMetrics();
        }
      }, 3000);
    },

    stopPolling: function () {
      this.active = false;
      if (this._intervalTimer) {
        clearInterval(this._intervalTimer);
        this._intervalTimer = null;
      }
    },

    refreshMetrics: function () {
      var self = this;
      var el = document.getElementById("sysmonDetails");
      if (!el) return;

      var pythonCmd = this.app.settings.pythonPath || "python";

      var extPath = "";
      try {
        var cs = new CSInterface();
        extPath = cs.getSystemPath(SystemPath.EXTENSION);
      } catch (e) {}

      var scriptPath = (window.FileSystem.path && extPath)
        ? window.FileSystem.path.join(extPath, "python", "main.py")
        : "main.py";

      try {
        var proc = window.FileSystem.childProcess.spawn(pythonCmd, [
          scriptPath, "--mode", "sys-metrics"
        ]);

        var stdout = "";
        proc.stdout.on("data", function (data) {
          stdout += data.toString();
        });

        proc.on("close", function (code) {
          if (code === 0) {
            var lines = stdout.split("\n");
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line) continue;
              try {
                var entry = JSON.parse(line);
                if (entry.type === "sys_metrics") {
                  var raw = JSON.parse(entry.msg);
                  self.renderMetrics(raw);
                }
              } catch (_) {}
            }
          } else {
            self.renderError("Python exited with code " + code);
          }
        });

        proc.on("error", function (err) {
          self.renderError(err.message);
        });
      } catch (e) {
        self.renderError(e.message);
      }
    },

    renderMetrics: function (data) {
      var el = document.getElementById("sysmonDetails");
      if (!el) return;

      var rows = [
        { label: "CPU Usage", value: data.cpu_percent.toFixed(1) + "%", valPct: data.cpu_percent },
        { label: "RAM Usage", value: data.ram_used_gb.toFixed(1) + " GB / " + data.ram_total_gb.toFixed(1) + " GB (" + data.ram_percent.toFixed(1) + "%)", valPct: data.ram_percent },
        { label: "GPU Model", value: data.gpu_name },
        { label: "GPU Load", value: data.gpu_util.toFixed(1) + "%", valPct: data.gpu_util },
        { label: "GPU Temp", value: data.gpu_temp.toFixed(1) + " °C" },
        { label: "GPU VRAM", value: (data.gpu_mem_used_mb / 1024).toFixed(1) + " GB / " + (data.gpu_mem_total_mb / 1024).toFixed(1) + " GB (" + data.gpu_mem_percent.toFixed(1) + "%)", valPct: data.gpu_mem_percent }
      ];

      var html = "";
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        html += '<div class="env-row" style="margin-bottom: 8px; align-items: center; display: flex;">';
        html += '  <span class="env-label" style="font-weight:600; min-width: 100px;">' + r.label + '</span>';
        html += '  <span class="env-value" style="margin-left: 12px; flex: 1;">' + r.value + '</span>';
        if (r.valPct !== undefined) {
          html += '  <div class="gpu-vram-bar-wrap" style="width: 120px; margin-left: 12px; height: 6px;">';
          html += '    <div class="gpu-vram-bar" style="height: 6px;">';
          html += '      <div class="gpu-vram-fill" style="width: ' + r.valPct + '%; height: 6px;"></div>';
          html += '    </div>';
          html += '  </div>';
        }
        html += '</div>';
      }
      el.innerHTML = html;
    },

    renderError: function (msg) {
      var el = document.getElementById("sysmonDetails");
      if (el) {
        el.innerHTML = '<div class="env-row"><i class="fa-solid fa-circle-exclamation env-err"></i> <span>Failed to fetch metrics: ' + msg + '</span></div>';
      }
    }
  };

  window.SysmonPanel = SysmonPanel;
})();
