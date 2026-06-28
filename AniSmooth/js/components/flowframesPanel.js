(function () {
  var FlowframesPanel = {
    init: function (app) {
      this.app = app;
      this.view = document.getElementById('flowframesView');
      this.aiSelect = document.getElementById('flowframesAi');
      this.modelSelect = document.getElementById('flowframesModel');
      this.encoderSelect = document.getElementById('flowframesEncoder');
      this.factorContainer = document.getElementById('flowframesFactor');
      this.factorCustom = document.getElementById('ffFactorCustom');
      this.sceneToggle = document.getElementById('ffSceneChange');
      this.startBtn = document.getElementById('startFlowframesBtn');
      this.cancelBtn = document.getElementById('cancelFlowframesBtn');
      this._sourceInfo = null;
      this._running = false;
      this.bindEvents();
      this.checkAvailability();
    },

    getFactor: function () {
      if (this.factorCustom && this.factorCustom.value) {
        var v = parseInt(this.factorCustom.value, 10);
        if (v >= 2 && v <= 16) return v;
      }
      if (this.factorContainer) {
        var a = this.factorContainer.querySelector('.factor-btn.active');
        if (a) return parseInt(a.getAttribute('data-value'), 10);
      }
      return 2;
    },

    bindEvents: function () {
      var s = this;
      if (this.startBtn) this.startBtn.addEventListener('click', function () { s.process(); });
      if (this.cancelBtn) this.cancelBtn.addEventListener('click', function () { s.cancel(); });
      if (this.factorContainer) {
        this.factorContainer.addEventListener('click', function (e) {
          var el = e.target;
          while (el && el !== s.factorContainer) {
            if (el.classList && el.classList.contains('factor-btn')) break;
            el = el.parentElement;
          }
          if (!el || el === s.factorContainer) return;
          var btns = s.factorContainer.querySelectorAll('.factor-btn');
          for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
          el.classList.add('active');
          if (s.factorCustom) s.factorCustom.value = '';
        });
      }
      if (this.factorCustom) {
        this.factorCustom.addEventListener('input', function () {
          var btns = s.factorContainer.querySelectorAll('.factor-btn');
          for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
        });
      }
    },

    checkAvailability: function () {
      var hint = document.getElementById('ffStatusHint');
      if (!hint) return;
      if (window.FlowframesHandler && window.FlowframesHandler.isAvailable()) {
        hint.style.display = 'none';
      } else {
        hint.style.display = '';
        hint.innerHTML = '<span class="meta-strip meta-strip-dim"><i class="fa-solid fa-triangle-exclamation"></i> Flowframes.exe not found — set its path in Settings → Python → Flowframes.</span>';
      }
    },

    refreshLayerInfo: function () {
      var s = this;
      if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) {
        if (s._sourceInfo !== null) { s._sourceInfo = null; s.renderLayerInfo(); }
        return;
      }
      if (this._fetching) return;
      this._fetching = true;
      window.__adobe_cep__.evalScript('getSelectedLayerInfo()', function (r) {
        s._fetching = false;
        var raw = r || '{}';
        if (raw === s._lastRaw) return;
        s._lastRaw = raw;
        try { s._sourceInfo = JSON.parse(raw); } catch (e) { s._sourceInfo = null; }
        s.renderLayerInfo();
      });
    },

    renderLayerInfo: function () {
      var el = document.getElementById('ffLayerInfo');
      if (!el) return;
      var s = this._sourceInfo;
      if (!s || !s.ok) {
        el.innerHTML = '<span class="meta-strip meta-strip-dim"><i class="fa-solid fa-layer-group"></i> Select a footage layer</span>';
        return;
      }
      var w = s.width || 0, h = s.height || 0, fps = s.frameRate || s.compFrameRate || 0, dur = s.layerDuration || s.compDuration || s.duration || 0, frames = Math.round((dur || 0) * fps), parts = [];
      if (w > 0 && h > 0) parts.push('<span>' + w + '<b>×</b>' + h + '</span>');
      if (fps > 0) parts.push('<span>' + fps.toFixed(2) + ' fps</span>');
      if (frames > 0) parts.push('<span>' + frames + ' frames</span>');
      el.innerHTML = '<span class="meta-strip"><i class="fa-solid fa-film"></i> <b>' + esc(s.layerName || s.name || '') + '</b>' + (parts.length ? ' · ' + parts.join(' · ') : '') + '</span>';
    },

    _setProgress: function (label, pct) {
      var f = document.getElementById('flowframesProgressFill');
      var l = document.getElementById('flowframesProgressLabel');
      var p = document.getElementById('flowframesProgressPercent');
      if (l && label !== null) l.textContent = label;
      if (typeof pct === 'number') {
        if (f) f.style.width = pct + '%';
        if (p) p.textContent = pct + '%';
      }
    },

    _setRunning: function (running) {
      this._running = running;
      if (this.startBtn) this.startBtn.style.display = running ? 'none' : '';
      if (this.cancelBtn) this.cancelBtn.style.display = running ? '' : 'none';
    },

    process: function () {
      var s = this._sourceInfo;
      if (!s || !s.ok) {
        window.showToast('Select a footage layer first.', 'error');
        return;
      }
      if (!window.FlowframesHandler || !window.FlowframesHandler.isAvailable()) {
        window.showToast('Flowframes.exe not found. Set its path in Settings.', 'error');
        return;
      }
      if (window.FlowframesHandler.isBusy() || this._running) {
        window.showToast('Flowframes is already running.', 'error');
        return;
      }

      var self = this;
      var fs = window.FileSystem.fs;
      var path = window.FileSystem.path;
      var settings = (this.app && this.app.settings) || {};
      var outDir = settings.outputPath || window.FileSystem.os.homedir();
      var modeDir = path.join(outDir, 'Flowframes');
      window.FileSystem.createFolder(modeDir);

      var renderDir = outDir;
      var escapedDir = String(renderDir).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      var escapedName = String(s.layerName || s.name || 'Footage').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      var layerIdx = s.layerIndex || 0;

      this._setRunning(true);
      this._setProgress('Pre-rendering clip...', 0);

      window.__adobe_cep__.evalScript('renderSelectedLayer("' + escapedDir + '", "' + escapedName + '", ' + layerIdx + ')', function (result) {
        var res = {};
        try { res = JSON.parse(result || '{}'); } catch (e) {}
        if (!res.ok || !res.filePath) {
          self._setRunning(false);
          self._setProgress('Ready', 0);
          window.showToast(res.message || 'Pre-render failed', 'error');
          return;
        }

        var inputPath = res.filePath;
        var factor = self.getFactor();
        var prefix = (settings.outputPrefix || 'AniSmooth') + '_';
        var ts = settings.outputTimestamp !== false ? '_' + new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19) : '';
        var baseName = prefix + (res.name || escapedName) + '_flowframes_' + factor + 'x' + ts;
        var outputPath = path.join(modeDir, baseName + '.mp4');
        var jobOutDir = path.join(modeDir, '.ff_' + Date.now());
        window.FileSystem.createFolder(jobOutDir);

        var cleanupInput = function () {
          if (res.isTemp) { try { fs.unlinkSync(inputPath); } catch (e) {} }
        };
        var cleanupJobDir = function () {
          try {
            var rest = fs.readdirSync(jobOutDir);
            for (var i = 0; i < rest.length; i++) { try { fs.unlinkSync(path.join(jobOutDir, rest[i])); } catch (e) {} }
            fs.rmdirSync(jobOutDir);
          } catch (e) {}
        };

        self._setProgress('Running Flowframes...', 0);

        window.FlowframesHandler.run(inputPath, jobOutDir, {
          factor: factor,
          ai: self.aiSelect ? self.aiSelect.value : 'RifeNcnn',
          model: self.modelSelect ? self.modelSelect.value : 'RIFE 4.26',
          encoder: self.encoderSelect ? self.encoderSelect.value : 'X264',
          sceneChange: self.sceneToggle ? self.sceneToggle.checked : true
        }, {
          onProgress: function (p) { self._setProgress('Running Flowframes...', Math.max(0, Math.min(100, Math.round(p)))); },
          onLog: function (l) { dbg('debug', 'Flowframes', l); },
          onComplete: function (producedPath) {
            var finalPath = outputPath;
            if (producedPath && producedPath !== outputPath) {
              try {
                fs.renameSync(producedPath, outputPath);
              } catch (e) {
                try { fs.copyFileSync(producedPath, outputPath); fs.unlinkSync(producedPath); }
                catch (e2) { finalPath = producedPath; }
              }
            }
            cleanupInput();
            cleanupJobDir();
            self._setProgress('Done', 100);
            self._setRunning(false);
            dbg('success', 'Flowframes', 'Output: ' + finalPath);
            if (settings.outputAutoImport !== false) window.App.importFileToAfterEffects(finalPath);
            window.showToast('Flowframes interpolation complete.', 'success');
          },
          onError: function (err) {
            cleanupInput();
            cleanupJobDir();
            self._setProgress('Ready', 0);
            self._setRunning(false);
            window.showToast('Flowframes failed: ' + err, 'error');
          }
        });
      });
    },

    cancel: function () {
      if (window.FlowframesHandler) window.FlowframesHandler.cancel();
      this._setRunning(false);
      this._setProgress('Cancelled', 0);
    }
  };

  function esc(t) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(t || ''));
    return d.innerHTML;
  }

  window.FlowframesPanel = FlowframesPanel;
})();
