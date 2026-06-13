(function () {
  var _step = 'welcome';
  var _toolsFolder = '';
  var _pythonCmd = '';
  var _pythonOk = false;
  var _pythonChecked = false;
  var _gpuInfo = null;
  var _gpuChecked = false;
  var _pytorchOk = false;
  var _pytorchChecked = false;
  var _installRunning = false;
  var _installProc = null;
  var _installLines = [];
  var _installSubstep = '';
  var _installedCount = 0;
  var _totalSteps = 0;

  function _resolveDefaultFolder() {
    var appdata = "";
    try { appdata = process.env.APPDATA || ""; } catch (e) {}
    if (!appdata && window.FileSystem && window.FileSystem.os && window.FileSystem.path) {
      appdata = window.FileSystem.path.join(window.FileSystem.os.homedir(), "AppData", "Roaming");
    }
    var base = appdata ? window.FileSystem.path.join(appdata, "com.moongetsu.extensions", "AniSmooth") : "";
    return base ? window.FileSystem.path.join(base, "backend") : "C:\\AniSmoothTools";
  }

  function showToolsSetup() {
    var gate = document.getElementById('tools-setup-gate');
    if (!gate) {
      gate = document.createElement('div');
      gate.id = 'tools-setup-gate';
      gate.className = 'setup-gate';
      document.body.appendChild(gate);
    }
    gate.style.display = 'flex';
    _step = 'welcome';
    _pythonChecked = false;
    _gpuChecked = false;
    _pytorchChecked = false;
    _installRunning = false;
    _installLines = [];
    _toolsFolder = (window.App && window.App.anismoothToolsFolder) || _resolveDefaultFolder();
    renderSetupStep();
  }

  function hideToolsSetup() {
    var gate = document.getElementById('tools-setup-gate');
    if (gate) gate.style.display = 'none';
  }

  function renderSetupStep() {
    var gate = document.getElementById('tools-setup-gate');
    if (!gate) return;
    var steps = ['welcome', 'check', 'autoinstall', 'complete'];
    var stepIdx = steps.indexOf(_step);
    var pct = (stepIdx / 3) * 100;
    var html = renderStepIndicator(pct);
    switch (_step) {
      case 'welcome': html += renderWelcomeStep(); break;
      case 'check': html += renderCheckStep(); break;
      case 'autoinstall': html += renderAutoInstallStep(); break;
      case 'complete': html += renderCompleteStep(); break;
    }
    gate.innerHTML = html;
    if (_step === 'autoinstall' && !_installRunning) {
      setTimeout(function () { startAutoInstall(); }, 400);
    }
  }

  function renderStepIndicator(progress) {
    var stepClasses = ['', '', ''];
    var idx = ['welcome', 'check', 'autoinstall', 'complete'].indexOf(_step);
    for (var i = 0; i < 3; i++) {
      if (i < idx) stepClasses[i] = 'done';
      else if (i === idx) stepClasses[i] = 'active';
    }
    var stepsHtml = '';
    for (var i = 0; i < 3; i++) {
      stepsHtml += '<div class="setup-step ' + stepClasses[i] + '">' +
        (stepClasses[i] === 'done' ? '<i class="fa-solid fa-check"></i>' : '<span>' + (i + 1) + '</span>') +
        '</div>';
    }
    return '<div class="setup-container">' +
      '<div class="setup-step-bar">' +
        '<div class="setup-step-progress" style="width:' + progress + '%"></div>' +
        '<div class="setup-steps">' + stepsHtml + '</div>' +
      '</div>' +
      '<div class="setup-step-labels"><span>Welcome</span><span>Check</span><span>Install</span></div>';
  }

  // ── WELCOME ──────────────────────────────────────────
  function renderWelcomeStep() {
    return '<div class="setup-card">' +
      '<div class="setup-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
      '<h1>AniSmooth Setup</h1>' +
      '<p class="setup-desc">This wizard detects your hardware and installs everything needed to run local AI models for frame interpolation and upscaling.</p>' +
      '<div class="setup-info-box">' +
        '<p><strong>What will be checked:</strong></p>' +
        '<ul>' +
          '<li><i class="fa-brands fa-python"></i> Python 3 &mdash; runtime engine</li>' +
          '<li><i class="fa-solid fa-microchip"></i> GPU &amp; CUDA &mdash; hardware acceleration</li>' +
          '<li><i class="fa-solid fa-film"></i> FFmpeg &mdash; video processing</li>' +
          '<li><i class="fa-solid fa-cubes"></i> PyTorch &amp; OpenCV &mdash; AI inference</li>' +
        '</ul>' +
        '<p style="margin-top:6px;">Everything installs to: <code>' + _toolsFolder + '</code></p>' +
      '</div>' +
      '<div class="setup-nav">' +
        '<button class="btn btn-ghost" onclick="skipToolsSetup()">Skip</button>' +
        '<button class="btn btn-primary" onclick="goToSetupStep(\'check\')"><i class="fa-solid fa-magnifying-glass"></i> Scan System</button>' +
      '</div>' +
    '</div></div>';
  }

  // ── CHECK ────────────────────────────────────────────
  function renderCheckStep() {
    var ffmpegFound = false, ffprobeFound = false;
    if (window.FileSystem && window.FileSystem.fs) {
      ffmpegFound = window.FileSystem.fs.existsSync(window.FileSystem.path.join(_toolsFolder, "ffmpeg.exe"));
      ffprobeFound = window.FileSystem.fs.existsSync(window.FileSystem.path.join(_toolsFolder, "ffprobe.exe"));
    }
    var rows = '';
    rows += renderToolRow({ found: _pythonOk, checking: !_pythonChecked, extra: _pythonCmd }, 'Python 3', _pythonOk ? _pythonCmd : 'Not found', 'fa-brands fa-python');
    if (_gpuChecked) {
      if (_gpuInfo && _gpuInfo.nvidia_gpu_detected) {
        var vram = _gpuInfo.nvidia_vram_mb ? ' (' + formatVram(_gpuInfo.nvidia_vram_mb) + ')' : '';
        var label = _gpuInfo.nvidia_name + vram;
        rows += renderToolRow({ found: _gpuInfo.cuda_available, extra: _gpuInfo.pytorch_variant },
          'GPU & CUDA', _gpuInfo.cuda_available ? label + ' — CUDA OK' : label + ' — CPU PyTorch', 'fa-solid fa-microchip');
      } else {
        rows += renderToolRow({ found: false }, 'GPU', 'No NVIDIA GPU detected', 'fa-solid fa-microchip');
      }
    } else {
      rows += renderToolRow({ checking: true }, 'GPU & CUDA', 'Detecting hardware...', 'fa-solid fa-microchip');
    }
    rows += renderToolRow({ found: ffmpegFound }, 'FFmpeg', 'Video encoder', 'fa-solid fa-film');
    rows += renderToolRow({ found: ffprobeFound }, 'FFprobe', 'Metadata reader', 'fa-solid fa-magnifying-glass');
    if (_pytorchChecked) {
      rows += renderToolRow({ found: _pytorchOk, extra: _pytorchExtra }, 'PyTorch', _pytorchOk ? _pytorchExtra : 'Not installed', 'fa-solid fa-cubes');
    } else {
      rows += renderToolRow({ checking: true }, 'PyTorch + CV2', 'Checking packages...', 'fa-solid fa-cubes');
    }

    var canInstall = _pythonOk;
    var gpuMismatch = _gpuInfo && _gpuInfo.nvidia_gpu_detected && !_gpuInfo.cuda_available;
    var allOk = _pythonOk && ffmpegFound && ffprobeFound && _pytorchOk && !gpuMismatch;

    var actions = '<div class="setup-nav">' +
      '<button class="btn btn-ghost" onclick="goToSetupStep(\'welcome\')">Back</button>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="btn btn-secondary" onclick="scanToolsAndRefresh()"><i class="fa-solid fa-arrows-rotate"></i> Re-scan</button>';
    if (allOk) {
      actions += '<button class="btn btn-primary" onclick="finishToolsSetup()"><i class="fa-solid fa-check"></i> All Good</button>';
    } else if (gpuMismatch) {
      actions += '<button class="btn btn-primary" onclick="installGpuFromSetup()"><i class="fa-solid fa-download"></i> Install CUDA PyTorch</button>';
    } else if (canInstall) {
      actions += '<button class="btn btn-primary" onclick="goToSetupStep(\'autoinstall\')"><i class="fa-solid fa-wrench"></i> Install Missing</button>';
    } else {
      actions += '<button class="btn btn-primary" onclick="downloadAndInstallPortablePython()"><i class="fa-solid fa-download"></i> Install Python First</button>';
    }
    actions += '</div></div>';

    var html = '<div class="setup-card">' +
      '<h2>System Check</h2>' +
      '<p class="setup-desc">Scanning your system for required tools and hardware.</p>' +
      '<div class="ts-tool-list">' + rows + '</div>' +
      actions +
    '</div></div>';

    if (!_pythonChecked) { setTimeout(function () { checkPythonAsync(); }, 80); }
    if (!_gpuChecked && _pythonOk) { setTimeout(function () { checkGpuAsync(); }, 400); }
    if (!_pytorchChecked && _pythonOk) { setTimeout(function () { checkPytorchAsync(); }, 600); }
    return html;
  }

  function renderToolRow(status, name, desc, iconClass) {
    var icon, statusClass;
    if (status.found) { statusClass = 'found'; }
    else if (status.checking) { statusClass = 'checking'; }
    else { statusClass = 'missing'; }
    return '<div class="ts-tool-row ' + statusClass + '">' +
      '<div class="ts-tool-icon"><i class="' + iconClass + '"></i></div>' +
      '<div class="ts-tool-info">' +
        '<div class="ts-tool-name">' + name + '</div>' +
        '<div class="ts-tool-desc">' + desc + '</div>' +
        (status.extra ? '<div class="ts-tool-extra">' + escapeHtml(status.extra) + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  // ── ASYNC CHECKS ─────────────────────────────────────
  function checkPythonAsync() {
    var commands = ['python', 'python3'];
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
                if (fs.existsSync(fullPath)) commands.push(fullPath);
              }
            }
          }
        }
        var rootDirs = fs.readdirSync("C:\\");
        for (var k = 0; k < rootDirs.length; k++) {
          var rdir = rootDirs[k];
          if (rdir.toLowerCase().indexOf("python3") === 0) {
            var rpath = path.join("C:\\", rdir, "python.exe");
            if (fs.existsSync(rpath)) commands.push(rpath);
          }
        }
        if (localappdata) {
          var storePath = path.join(localappdata, "Microsoft", "WindowsApps", "python.exe");
          if (fs.existsSync(storePath)) commands.push(storePath);
        }
      }
    } catch (e) {}
    var uniqueCommands = [];
    for (var m = 0; m < commands.length; m++) {
      if (uniqueCommands.indexOf(commands[m]) === -1) uniqueCommands.push(commands[m]);
    }
    commands = uniqueCommands;
    function tryCmd(idx) {
      if (idx >= commands.length) { _pythonOk = false; _pythonCmd = ''; _pythonChecked = true; renderSetupStep(); return; }
      try {
        var proc = window.FileSystem.childProcess.spawn(commands[idx], ['--version']);
        proc.on('close', function (code) {
          if (code === 0) { _pythonOk = true; _pythonCmd = commands[idx]; _pythonChecked = true; renderSetupStep(); }
          else { tryCmd(idx + 1); }
        });
        proc.on('error', function () { tryCmd(idx + 1); });
      } catch (e) { tryCmd(idx + 1); }
    }
    tryCmd(0);
  }

  function checkGpuAsync() {
    var extPath = "";
    try { var cs = new CSInterface(); extPath = cs.getSystemPath(SystemPath.EXTENSION); } catch (e) {}
    var scriptPath = (window.FileSystem.path && extPath) ? window.FileSystem.path.join(extPath, 'python', 'main.py') : 'main.py';
    try {
      var proc = window.FileSystem.childProcess.spawn(_pythonCmd || 'python', [scriptPath, '--mode', 'gpu-info']);
      var stdout = '';
      proc.stdout.on('data', function (d) { stdout += d.toString(); });
      proc.on('close', function () {
        var lines = stdout.split('\n');
        for (var i = 0; i < lines.length; i++) {
          try {
            var j = JSON.parse(lines[i]);
            if (j.type === 'gpu_info') {
              _gpuInfo = JSON.parse(j.msg);
              break;
            }
          } catch (_) {}
        }
        _gpuChecked = true;
        renderSetupStep();
      });
      proc.on('error', function () { _gpuChecked = true; renderSetupStep(); });
    } catch (e) { _gpuChecked = true; renderSetupStep(); }
  }

  var _pytorchExtra = '';
  function checkPytorchAsync() {
    try {
      var proc = window.FileSystem.childProcess.spawn(_pythonCmd || 'python', ['-c', 'import torch; print(torch.__version__); import cv2; print("cv2-ok")']);
      var stdout = '';
      proc.stdout.on('data', function (d) { stdout += d.toString(); });
      proc.on('close', function (code) {
        if (code === 0) {
          _pytorchOk = true;
          var lines = stdout.trim().split('\n');
          _pytorchExtra = lines[0] || '';
          if (lines.length > 1) _pytorchExtra += ' + OpenCV';
        }
        _pytorchChecked = true;
        renderSetupStep();
      });
      proc.on('error', function () { _pytorchChecked = true; renderSetupStep(); });
    } catch (e) { _pytorchChecked = true; renderSetupStep(); }
  }

  // ── INSTALL ───────────────────────────────────────────
  function renderAutoInstallStep() {
    var needs = [];
    if (!_ffmpegFound()) needs.push('FFmpeg');
    if (!_pytorchOk) {
      if (_gpuInfo && _gpuInfo.nvidia_gpu_detected) {
        needs.push('PyTorch CUDA (auto-detected for ' + (_gpuInfo.nvidia_name || 'GPU') + ')');
      } else {
        needs.push('PyTorch CPU');
      }
    }
    needs.push('OpenCV + NumPy + Pillow');
    _totalSteps = needs.length;
    _installedCount = 0;

    return '<div class="setup-card">' +
      '<h2>Installing</h2>' +
      '<p class="setup-desc" id="ts-install-substep">Preparing...</p>' +
      '<div class="ts-install-progress-wrap">' +
        '<div class="setup-progress-track">' +
          '<div id="ts-install-progress-fill" class="setup-progress-fill"></div>' +
        '</div>' +
        '<div id="ts-install-progress-label" class="ts-install-progress-label">0 / ' + _totalSteps + ' components</div>' +
      '</div>' +
      '<div id="ts-install-log" class="ts-install-log">Starting installation...</div>' +
      '<div class="setup-nav">' +
        '<button class="btn btn-secondary" onclick="cancelAutoInstall()" id="ts-install-cancel-btn"><i class="fa-solid fa-xmark"></i> Cancel</button>' +
        '<button class="btn btn-primary" onclick="goToSetupStep(\'check\')" id="ts-install-done-btn" style="display:none;"><i class="fa-solid fa-check"></i> Done</button>' +
      '</div>' +
    '</div></div>';
  }

  function _ffmpegFound() {
    if (!window.FileSystem || !window.FileSystem.fs) return false;
    return window.FileSystem.fs.existsSync(window.FileSystem.path.join(_toolsFolder, "ffmpeg.exe"));
  }

  function addInstallLog(msg) {
    _installLines.push(msg);
    if (_installLines.length > 200) _installLines.shift();
    var logEl = document.getElementById('ts-install-log');
    if (logEl) {
      logEl.innerHTML = _installLines.map(function (l) {
        var c = 'ts-log-line';
        if (l.indexOf('[OK]') === 0) c += ' ts-log-ok';
        else if (l.indexOf('[ERR]') === 0) c += ' ts-log-err';
        else if (l.indexOf('[WARN]') === 0) c += ' ts-log-warn';
        else if (l.indexOf('---') === 0) c += ' ts-log-section';
        return '<div class="' + c + '">' + escapeHtml(l) + '</div>';
      }).join('');
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  function updateInstallProgress(msg) {
    _installSubstep = msg;
    var el = document.getElementById('ts-install-substep');
    if (el) el.textContent = msg;
  }

  function incrementInstallProgress() {
    _installedCount++;
    var fill = document.getElementById('ts-install-progress-fill');
    var label = document.getElementById('ts-install-progress-label');
    if (fill) fill.style.width = Math.round((_installedCount / _totalSteps) * 100) + '%';
    if (label) label.textContent = _installedCount + ' / ' + _totalSteps + ' components';
  }

  // ── PORTABLE PYTHON ──────────────────────────────────
  function downloadAndInstallPortablePython() {
    _step = 'autoinstall';
    _installRunning = true;
    _installLines = [];
    renderSetupStep();
    updateInstallProgress('Downloading Python 3.10...');
    addInstallLog('--- Portable Python ---');
    var https = require('https');
    var fs = require('fs');
    var path = require('path');
    var zipUrl = 'https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip';
    var zipPath = path.join(_toolsFolder, 'python_temp.zip');
    var pythonDestFolder = path.join(_toolsFolder, 'python');
    window.FileSystem.createFolder(_toolsFolder);
    window.FileSystem.createFolder(pythonDestFolder);
    var file = fs.createWriteStream(zipPath);
    var request = https.get(zipUrl, function (response) {
      if (response.statusCode !== 200) { addInstallLog('[ERR] Download failed: HTTP ' + response.statusCode); finishAutoInstall(false); return; }
      var len = parseInt(response.headers['content-length'], 10) || 1;
      var downloaded = 0;
      response.on('data', function (chunk) {
        downloaded += chunk.length;
        var pct = Math.round((downloaded / len) * 100);
        var fill = document.getElementById('ts-install-progress-fill');
        if (fill) fill.style.width = pct + '%';
      });
      response.pipe(file);
      file.on('finish', function () {
        file.close(function () {
          addInstallLog('Extracting portable Python...');
          try {
            var psCmd = 'Expand-Archive -Path "' + zipPath + '" -DestinationPath "' + pythonDestFolder + '" -Force';
            window.FileSystem.runPowerShellDialog(psCmd);
            var exePath = path.join(pythonDestFolder, 'python.exe');
            if (fs.existsSync(exePath)) {
              addInstallLog('[OK] Portable Python installed');
              _pythonOk = true; _pythonCmd = exePath; _pythonChecked = true;
              try { fs.unlinkSync(zipPath); } catch (e) {}
              _installRunning = false;
              startAutoInstall();
            } else {
              addInstallLog('[ERR] python.exe not found after extraction');
              finishAutoInstall(false);
            }
          } catch (err) { addInstallLog('[ERR] Extraction failed: ' + err.message); finishAutoInstall(false); }
        });
      });
    });
    request.on('error', function (err) { addInstallLog('[ERR] Download error: ' + err.message); finishAutoInstall(false); });
  }

  // ── AUTO INSTALL ─────────────────────────────────────
  function startAutoInstall() {
    if (_installRunning) return;
    _installRunning = true;
    _installLines = [];
    var cancelBtn = document.getElementById('ts-install-cancel-btn');
    var doneBtn = document.getElementById('ts-install-done-btn');
    if (cancelBtn) cancelBtn.style.display = '';
    if (doneBtn) doneBtn.style.display = 'none';

    updateInstallProgress('Preparing installer...');
    addInstallLog('--- AniSmooth Environment Setup ---');
    try {
      window.FileSystem.createFolder(_toolsFolder);
      var cs = new CSInterface();
      var extPath = cs.getSystemPath(SystemPath.EXTENSION);
      var sourceSetup = window.FileSystem.path.join(extPath, 'python', 'setup.py');
      var destSetup = window.FileSystem.path.join(_toolsFolder, 'setup.py');
      var content = window.FileSystem.fs.readFileSync(sourceSetup, 'utf8');
      window.FileSystem.fs.writeFileSync(destSetup, content, 'utf8');
      addInstallLog('[OK] Setup script written to AppData');
    } catch (e) { addInstallLog('[ERR] Failed to write setup script: ' + e.message); finishAutoInstall(false); return; }

    var pythonCmd = _pythonCmd || 'python';
    addInstallLog('Running: ' + pythonCmd + ' setup.py');
    try {
      _installProc = window.FileSystem.childProcess.spawn(pythonCmd, ['setup.py'], { cwd: _toolsFolder, windowsHide: true });
      var proc = _installProc;
      var buf = '';
      proc.stdout.on('data', function (d) {
        buf += d.toString();
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) handleSetupLine(lines[i]);
      });
      proc.stderr.on('data', function (d) { addInstallLog('[WARN] ' + d.toString().trim()); });
      proc.on('close', function (code) {
        addInstallLog(code === 0 ? '[OK] Environment setup complete' : '[ERR] Setup exited with code ' + code);
        var fill = document.getElementById('ts-install-progress-fill');
        if (fill) fill.style.width = '100%';
        incrementInstallProgress();
        finishAutoInstall(code === 0);
      });
      proc.on('error', function (e) { addInstallLog('[ERR] Process error: ' + e.message); finishAutoInstall(false); });
    } catch (e) { addInstallLog('[ERR] Failed to spawn: ' + e.message); finishAutoInstall(false); }
  }

  function handleSetupLine(line) {
    line = line.trim();
    if (!line) return;
    try {
      var data = JSON.parse(line);
      var msg = data.msg || '';
      if (data.type === 'section') { addInstallLog('--- ' + msg + ' ---'); updateInstallProgress(msg); }
      else if (data.type === 'progress') {
        var fill = document.getElementById('ts-install-progress-fill');
        if (fill && data.pct !== undefined) fill.style.width = data.pct + '%';
      }
      else if (data.type === 'success') { addInstallLog('[OK] ' + msg); incrementInstallProgress(); }
      else if (data.type === 'error') { addInstallLog('[ERR] ' + msg); }
      else if (data.type === 'warn') { addInstallLog('[WARN] ' + msg); }
      else if (data.type === 'info') { addInstallLog(msg); }
      else if (data.type === 'summary') { addInstallLog('--- Setup Complete ---'); }
      else { addInstallLog(msg); }
    } catch (e) { addInstallLog(line); }
  }

  function finishAutoInstall(success) {
    _installProc = null;
    _installRunning = false;
    _pytorchChecked = false;
    var cancelBtn = document.getElementById('ts-install-cancel-btn');
    var doneBtn = document.getElementById('ts-install-done-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (doneBtn) {
      doneBtn.style.display = '';
      doneBtn.onclick = function () {
        if (success) { _step = 'complete'; renderSetupStep(); }
        else {
          _pythonChecked = false; _gpuChecked = false; _pytorchChecked = false;
          goToSetupStep('check');
        }
      };
      doneBtn.innerHTML = '<i class="fa-solid fa-' + (success ? 'check' : 'arrow-left') + '"></i> ' + (success ? 'Continue' : 'Re-check');
    }
    var fill = document.getElementById('ts-install-progress-fill');
    if (fill) fill.style.width = success ? '100%' : '0%';
  }

  function cancelAutoInstall() {
    addInstallLog('[WARN] Cancelled by user');
    if (_installProc) { _installProc.kill(); _installProc = null; }
    _installRunning = false;
    finishAutoInstall(false);
  }

  // ── COMPLETE ─────────────────────────────────────────
  function renderCompleteStep() {
    var allOk = _pythonOk;
    var gpuOk = _gpuInfo && _gpuInfo.cuda_available;
    return '<div class="setup-card">' +
      '<div class="setup-icon success"><i class="fa-solid fa-circle-check"></i></div>' +
      '<h2>Setup Complete</h2>' +
      '<div class="ts-summary">' +
        '<div class="ts-summary-row ' + (_pythonOk ? 'ts-ok' : 'ts-err') + '">' +
          '<i class="fa-solid fa-' + (_pythonOk ? 'check' : 'xmark') + '"></i> Python 3' +
        '</div>' +
        '<div class="ts-summary-row ' + (gpuOk ? 'ts-ok' : (_gpuInfo && _gpuInfo.nvidia_gpu_detected ? 'ts-warn' : 'ts-err')) + '">' +
          '<i class="fa-solid fa-' + (gpuOk ? 'check' : (_gpuInfo && _gpuInfo.nvidia_gpu_detected ? 'exclamation' : 'xmark')) + '"></i>' +
          ' GPU ' + (_gpuInfo ? (_gpuInfo.nvidia_name || 'None') : 'Unknown') +
          (gpuOk ? ' (CUDA)' : (_gpuInfo && _gpuInfo.nvidia_gpu_detected ? ' (CPU PyTorch)' : ' (CPU)')) +
        '</div>' +
        '<div class="ts-summary-row ' + (_pytorchOk ? 'ts-ok' : 'ts-warn') + '">' +
          '<i class="fa-solid fa-' + (_pytorchOk ? 'check' : 'exclamation') + '"></i>' +
          ' PyTorch ' + (_pytorchOk ? (_pytorchExtra || 'installed') : 'may need re-check') +
        '</div>' +
      '</div>' +
      '<button class="btn btn-primary" style="width:100%;" onclick="finishToolsSetup()"><i class="fa-solid fa-rocket"></i> Launch AniSmooth</button>' +
      '</div></div>';
  }

  // ── HELPERS ──────────────────────────────────────────
  function escapeHtml(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function formatVram(mb) {
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb + ' MB';
  }

  function skipToolsSetup() { window.StorageManager.setItem('anismooth_setup_skipped', '1'); hideToolsSetup(); }

  function finishToolsSetup() {
    if (_pythonOk && _pythonCmd) {
      window.StorageManager.setItem('anismooth_python_path', _pythonCmd);
      if (window.App && window.App.settings) {
        window.App.settings.pythonPath = _pythonCmd;
        var pi = document.getElementById("pythonPathInput");
        if (pi) pi.value = _pythonCmd;
      }
    }
    window.StorageManager.setItem('anismooth_setup_complete', '1');
    window.App.refreshGpuInfo();
    hideToolsSetup();
  }

  function scanToolsAndRefresh() { _pythonChecked = false; _gpuChecked = false; _pytorchChecked = false; renderSetupStep(); }

  function goToSetupStep(step) {
    if (step === 'check') { _pythonChecked = false; _gpuChecked = false; _pytorchChecked = false; }
    _step = step;
    renderSetupStep();
  }

  function checkAndShowIfNeeded() {
    var complete = window.StorageManager.getItem('anismooth_setup_complete', '0');
    var skipped = window.StorageManager.getItem('anismooth_setup_skipped', '0');
    if (complete !== '1' && skipped !== '1') { showToolsSetup(); return true; }
    return false;
  }

  window.ToolsSetup = { showToolsSetup: showToolsSetup, checkAndShowIfNeeded: checkAndShowIfNeeded };
  window.goToSetupStep = goToSetupStep;
  window.scanToolsAndRefresh = scanToolsAndRefresh;
  window.skipToolsSetup = skipToolsSetup;
  window.finishToolsSetup = finishToolsSetup;
  window.cancelAutoInstall = cancelAutoInstall;
  window.downloadAndInstallPortablePython = downloadAndInstallPortablePython;
  window.installGpuFromSetup = function () {
    hideToolsSetup();
    setTimeout(function () {
      if (window.App && window.App.installCudaPytorch) {
        window.App.installCudaPytorch();
      }
    }, 300);
  };
})();
