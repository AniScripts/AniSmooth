(function () {
  var ToolkitPanel = {
    _subtabs: {},
    _tools: [
      { id: "quicktools", label: "Quick Tools", icon: "fa-toolbox", html: "tabs/toolkit/quicktools.html" },
      { id: "projecthelper", label: "Project Helper", icon: "fa-folder-tree", html: "tabs/toolkit/projecthelper.html" },
      { id: "colorflow", label: "ColorFlow", icon: "fa-palette", html: "tabs/toolkit/colorflow.html" },
      { id: "search", label: "Search", icon: "fa-magnifying-glass", html: "tabs/toolkit/search.html" }
    ],

    init: function (app) {
      this.app = app;
      this.view = document.getElementById("toolkitView");
      this.subNav = document.getElementById("toolkitSubNav");
      this.subContent = document.getElementById("toolkitSubContent");
      this._initToolToggles();
      this._loadToolHTMLs();
    },

    _initToolToggles: function () {
      var self = this;
      var anyEnabled = false;
      for (var i = 0; i < this._tools.length; i++) {
        var tool = this._tools[i];
        var key = "anismooth_toolkit_" + tool.id;
        var enabled = window.StorageManager.getItem(key, "0") === "1";
        if (enabled) anyEnabled = true;
      }
      if (!anyEnabled) {
        window.StorageManager.setItem("anismooth_toolkit_quicktools", "1");
      }
    },

    _getEnabledTools: function () {
      var enabled = [];
      for (var i = 0; i < this._tools.length; i++) {
        var tool = this._tools[i];
        var key = "anismooth_toolkit_" + tool.id;
        if (window.StorageManager.getItem(key, "0") === "1") enabled.push(tool);
      }
      return enabled;
    },

    _loadToolHTMLs: function () {
      var self = this;
      var enabled = this._getEnabledTools();
      var subContent = this.subContent;
      subContent.innerHTML = "";

      for (var i = 0; i < enabled.length; i++) {
        (function (tool) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", tool.html, true);
          xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 400) {
              subContent.innerHTML += xhr.responseText;
              self._subtabs[tool.id] = true;
              if (i === enabled.length - 1) {
                self._buildNav(enabled);
                self._bindActions();
                self._initColorFlow();
              }
            }
          };
          xhr.onerror = function () {
            subContent.innerHTML += '<div class="info-card"><span class="meta-strip meta-strip-sm"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load: ' + tool.label + '</span></div>';
          };
          xhr.send();
        })(enabled[i]);
      }
    },

    _buildNav: function (enabled) {
      var self = this;
      var nav = this.subNav;
      nav.innerHTML = "";

      for (var i = 0; i < enabled.length; i++) {
        (function (tool, idx) {
          var btn = document.createElement("button");
          btn.className = "sub-tab" + (idx === 0 ? " active" : "");
          btn.title = tool.label;
          btn.innerHTML = '<i class="fa-solid ' + tool.icon + '"></i>';
          btn.addEventListener("click", function () {
            self._switchSubTool(tool.id);
          });
          nav.appendChild(btn);
        })(enabled[i], i);
      }

      this._showSubTool(enabled[0].id);
    },

    _switchSubTool: function (toolId) {
      var nav = this.subNav;
      var btns = nav.querySelectorAll(".sub-tab");
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove("active");

      var tools = this._getEnabledTools();
      for (var j = 0; j < tools.length; j++) {
        if (tools[j].id === toolId) {
          btns[j].classList.add("active");
          break;
        }
      }

      this._showSubTool(toolId);
    },

    _showSubTool: function (toolId) {
      var panels = this.subContent.querySelectorAll(".toolkit-subtab");
      for (var i = 0; i < panels.length; i++) {
        panels[i].style.display = "none";
      }
      var target = document.getElementById("tk-" + toolId);
      if (target) target.style.display = "";

      if (toolId === "colorflow") this._initColorFlow();
    },

    refreshFromSettings: function () {
      if (this.subNav) this._loadToolHTMLs();
    },

    _bindActions: function () {
      var self = this;
      var subContent = this.subContent;

      subContent.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-tk-action]");
        if (!btn) return;
        var action = btn.getAttribute("data-tk-action");
        var arg = btn.getAttribute("data-tk-arg");
        self._handleAction(action, arg);
      });

      var innerNavs = subContent.querySelectorAll(".tk-inner-nav");
      for (var i = 0; i < innerNavs.length; i++) {
        innerNavs[i].addEventListener("click", function (e) {
          var tab = e.target.closest(".tk-inner-tab");
          if (!tab) return;
          self._switchInnerTab(tab);
        });
      }
    },

    _switchInnerTab: function (tab) {
      var nav = tab.parentElement;
      var tabs = nav.querySelectorAll(".tk-inner-tab");
      var panelContainer = nav.nextElementSibling;
      while (panelContainer && !panelContainer.classList.contains("tk-qt-panel") && !panelContainer.classList.contains("tk-cf-panel")) {
        panelContainer = panelContainer.nextElementSibling;
      }

      var dataAttr = "";
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove("active");
        var attr = tabs[i].getAttribute("data-tk-qt") || tabs[i].getAttribute("data-tk-cf");
        if (attr) dataAttr = Object.keys(tabs[i].dataset).find(function (k) { return k === "tkQt" || k === "tkCf"; });
      }
      tab.classList.add("active");

      var tabValue = tab.getAttribute("data-tk-qt") || tab.getAttribute("data-tk-cf");
      var dataKey = tab.hasAttribute("data-tk-qt") ? "data-tk-qt" : "data-tk-cf";
      var parent = tab.closest(".toolkit-subtab");
      var panels = parent.querySelectorAll(".tk-qt-panel, .tk-cf-panel");
      for (var j = 0; j < panels.length; j++) {
        panels[j].classList.remove("active");
        if (panels[j].getAttribute(dataKey) === tabValue) panels[j].classList.add("active");
      }
    },

    _handleAction: function (action, arg) {
      var script = null;
      var evalFn = null;

      switch (action) {
        case "align":
          script = "MoongetsuToolkit.alignLayers(" + arg + ")";
          break;
        case "fitToComp":
          script = "MoongetsuToolkit.fitToComp()";
          break;
        case "centerAnchor":
          script = "MoongetsuToolkit.centerAnchorPoint()";
          break;
        case "flip":
          script = "MoongetsuToolkit.flip('" + arg + "')";
          break;
        case "rotate":
          var angleEl = document.getElementById("tk-rot-angle");
          var angle = angleEl ? parseInt(angleEl.value, 10) : 90;
          script = "MoongetsuToolkit.rotate(" + (parseInt(arg, 10) * angle) + ")";
          break;
        case "precompose":
          script = "MoongetsuToolkit.precomposeSelected()";
          break;
        case "createNull":
          script = "MoongetsuToolkit.createNull()";
          break;
        case "createAdj":
          script = "MoongetsuToolkit.createAdj()";
          break;
        case "createSolid":
          script = "MoongetsuToolkit.createSolid()";
          break;
        case "selectNoPrecomp":
          script = "MoongetsuToolkit.selectNoPrecomps()";
          break;
        case "fixPrecompDuration":
          script = "MoongetsuToolkit.addFrameToSelectedLayers()";
          break;
        case "createFolders":
          evalFn = function () {
            var main = document.getElementById("tk-folder-main").value.trim();
            var subs = document.getElementById("tk-folder-subs").value.trim();
            if (!main) { window.showToast("Enter a main folder name.", "error"); return; }
            var subsArr = subs ? subs.split(",").map(function (s) { return s.trim(); }) : [];
            var extScript = "MoongetsuToolkit.createCustomFolders('" + main.replace(/'/g, "\\'") + "', [" + subsArr.map(function (s) { return "'" + s.replace(/'/g, "\\'") + "'"; }).join(",") + "])";
            window.__adobe_cep__.evalScript(extScript, function (res) {
              try { var r = JSON.parse(res); if (r && r.ok) window.showToast("Folders created.", "success"); else window.showToast("Failed to create folders.", "error"); } catch (e) {}
            });
          };
          break;
        case "resetProps":
          evalFn = function () {
            var checks = document.querySelectorAll("[data-tk-reset]");
            var opts = { transform: true, effects: true, masks: false, expressions: false };
            for (var c = 0; c < checks.length; c++) opts[checks[c].getAttribute("data-tk-reset")] = checks[c].checked;
            script = "MoongetsuToolkit.resetSelected(" + opts.transform + "," + opts.effects + "," + opts.masks + "," + opts.expressions + ")";
          };
          break;
        case "easyEase":
          script = "MoongetsuToolkit.applyEasyEase('" + arg + "')";
          break;
        case "easeCurve":
          script = "MoongetsuToolkit.applyEaseCurve('" + arg + "')";
          break;
        case "addEffect":
          var effectMap = {
            tint: "ADBE Tint",
            fill: "ADBE Fill",
            blur: "ADBE Fast Blur",
            sharpen: "ADBE Sharpen",
            mirror: "ADBE Mirror",
            curves: "ADBE CurvesCustom",
            lumetri: "ADBE LumentriColor",
            huesat: "ADBE HUE SATURATION",
            blinds: "ADBE Venetian Blinds"
          };
          if (arg === "fill") {
            script = "MoongetsuToolkit.addFillEffect()";
          } else if (arg === "blur") {
            script = "MoongetsuToolkit.addBlurEffect()";
          } else if (arg === "sharpen") {
            script = "MoongetsuToolkit.addSharpenEffect()";
          } else if (arg === "mirror") {
            script = "MoongetsuToolkit.addMirrorEffect()";
          } else {
            script = "MoongetsuToolkit.addEffect('" + (effectMap[arg] || arg) + "')";
          }
          break;
        case "createCamera":
          script = "MoongetsuToolkit.addCamera()";
          break;
        case "saveFrame":
          script = "MoongetsuToolkit.saveFrame()";
          break;
        case "injectExpr":
          evalFn = function () {
            var sel = document.getElementById("tk-expr-select");
            var expr = sel ? sel.value : "wiggle";
            script = "MoongetsuToolkit.applyExpression('" + expr + "')";
          };
          break;
        case "freezeFrame":
          script = "MoongetsuToolkit.freezeFrame()";
          break;
        case "trimOut":
          script = "MoongetsuToolkit.trimOut()";
          break;
        case "moveLayer":
          script = "MoongetsuToolkit.moveLayers(" + (arg === "up" ? -1 : 1) + ")";
          break;
        case "shiftLayer":
          evalFn = function () {
            var frames = parseInt(document.getElementById("tk-shift-frames").value, 10) || 5;
            script = "MoongetsuToolkit.shiftLayers(" + (parseInt(arg, 10) * frames) + ")";
          };
          break;
        case "purgeRAM":
          script = "MoongetsuToolkit.purgeRAM()";
          break;
        case "refreshProjName":
          this._refreshProjectName();
          return;
        case "runHelper":
          evalFn = function () {
            var name = document.getElementById("tk-proj-name").value.trim();
            var adj = document.getElementById("tk-helper-adj").checked;
            var nul = document.getElementById("tk-helper-null").checked;
            var sol = document.getElementById("tk-helper-solid").checked;
            var comp = document.getElementById("tk-helper-comp").checked;
            var org = document.getElementById("tk-helper-organize").checked;
            var red = document.getElementById("tk-helper-reduce").checked;
            script = "MoongetsuToolkit.runProjectHelper('" + name.replace(/'/g, "\\'") + "'," + adj + "," + nul + "," + sol + "," + comp + "," + org + "," + red + ")";
          };
          break;
        case "packagePayhip":
          evalFn = function () {
            var name = document.getElementById("tk-proj-name").value.trim();
            if (!name) { window.showToast("Enter a project name first.", "error"); return; }
            script = "MoongetsuToolkit.packageProjectForPayhip('" + name.replace(/'/g, "\\'") + "')";
          };
          break;
        case "scanProject":
          evalFn = function () {
            this._scanProject();
          }.bind(this);
          return;
        case "copyReport":
          evalFn = function () {
            var ta = document.getElementById("tk-scan-report");
            if (ta) {
              ta.select();
              document.execCommand("copy");
              window.showToast("Report copied to clipboard.", "success");
            }
          };
          break;
        case "browseImage":
          evalFn = function () {
            var path = window.FileSystem.chooseFileWithSystemExplorer("Select Image", "", [".png", ".jpg", ".jpeg", ".webp"]);
            if (path) document.getElementById("tk-search-image").value = path;
          };
          return;
        case "searchFrame":
          window.showToast("Frame search backend coming soon.", "info");
          return;
        case "cfApplyColor":
          evalFn = function () {
            var hex = document.getElementById("tk-cf-hex-input").value.trim();
            if (!hex) return;
            script = "MoongetsuToolkit.applyColorToSelectedLayers('" + hex + "')";
          };
          break;
        case "cfSaveColor":
          this._cfSaveColor();
          return;
        case "cfClearPalette":
          this._cfClearPalette();
          return;
        case "cfGenerateSolids":
          this._cfGenerateSolids();
          return;
        case "cfImport":
          this._cfImport();
          return;
        case "cfSavePalette":
          this._cfSavePalette();
          return;
        case "cfLoadPreset":
          this._cfLoadPreset();
          return;
        case "cfAutoLabel":
          script = "MoongetsuToolkit.autoLabelComp()";
          break;
        case "cfRandomize":
          this._cfRandomizeColors();
          return;
        default:
          return;
      }

      if (evalFn) { evalFn(); }
      if (script && window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
        window.__adobe_cep__.evalScript(script, function (res) {
          try { var r = JSON.parse(res); if (r && r.ok) window.showToast("Done.", "success"); else if (r && r.error) window.showToast(r.error, "error"); } catch (e) {}
        });
      } else if (script) {
        dbg("debug", "Toolkit", "No AE bridge, script would be: " + script);
      }
    },

    _refreshProjectName: function () {
      if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) return;
      var self = this;
      window.__adobe_cep__.evalScript("MoongetsuToolkit.getSuggestedProjectName()", function (res) {
        try {
          var name = JSON.parse(res);
          if (name && typeof name === "string") {
            var el = document.getElementById("tk-proj-name");
            if (el) el.value = name;
          }
        } catch (e) {}
      });
    },

    _scanProject: function () {
      if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) return;
      window.__adobe_cep__.evalScript("MoongetsuToolkit.scanProjectDependencies()", function (res) {
        try {
          var data = JSON.parse(res);
          var report = "";
          if (data && data.plugins && data.plugins.length) {
            report += "THIRD-PARTY PLUGINS:\n";
            for (var i = 0; i < data.plugins.length; i++) report += "  - " + data.plugins[i] + "\n";
            report += "\n";
          }
          if (data && data.fonts && data.fonts.length) {
            report += "FONTS:\n";
            for (var j = 0; j < data.fonts.length; j++) report += "  - " + data.fonts[j] + "\n";
            report += "\n";
          }
          if (data && data.expressions && data.expressions.length) {
            report += "EXPRESSIONS:\n";
            for (var k = 0; k < data.expressions.length; k++) report += "  " + data.expressions[k] + "\n";
          }
          if (!report) report = "No third-party dependencies found.";

          var box = document.getElementById("tk-scan-result-box");
          var ta = document.getElementById("tk-scan-report");
          if (box && ta) { box.style.display = ""; ta.value = report; }
        } catch (e) {
          window.showToast("Failed to parse scan results.", "error");
        }
      });
    },

    _initColorFlow: function () {
      var picker = document.getElementById("tk-cf-color-picker");
      var hexInput = document.getElementById("tk-cf-hex-input");
      if (!picker || !hexInput || picker._cfBound) return;
      picker._cfBound = true;

      picker.addEventListener("input", function () {
        hexInput.value = picker.value.toUpperCase();
      });
      hexInput.addEventListener("change", function () {
        var val = hexInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) picker.value = val;
      });

      this._cfRefreshSwatches();
      this._cfBuildHarmonies();
      this._cfBuildLabels();
    },

    _cfActivePalette: [],

    _cfSaveColor: function () {
      var hex = document.getElementById("tk-cf-hex-input").value.trim().toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(hex)) { window.showToast("Invalid hex color.", "error"); return; }
      if (this._cfActivePalette.indexOf(hex) >= 0) return;
      this._cfActivePalette.push(hex);
      this._cfRefreshSwatches();
    },

    _cfClearPalette: function () {
      this._cfActivePalette = [];
      this._cfRefreshSwatches();
    },

    _cfRefreshSwatches: function () {
      var container = document.getElementById("tk-cf-swatches");
      if (!container) return;
      var self = this;
      var html = "";
      for (var i = 0; i < this._cfActivePalette.length; i++) {
        var hex = this._cfActivePalette[i];
        html += '<span class="tk-cf-swatch" style="background:' + hex + ';" title="' + hex + '&#10;Click: apply&#10;Shift+Click: remove" data-idx="' + i + '" data-hex="' + hex + '"></span>';
      }
      if (!html) html = '<span class="form-hint" style="grid-column:1/-1;text-align:center;">No colors saved. Pick a color and click "Save to Palette".</span>';
      container.innerHTML = html;

      var swatches = container.querySelectorAll(".tk-cf-swatch");
      for (var s = 0; s < swatches.length; s++) {
        swatches[s].addEventListener("click", function (e) {
          var hex = this.getAttribute("data-hex");
          if (e.shiftKey) {
            var idx = parseInt(this.getAttribute("data-idx"), 10);
            self._cfActivePalette.splice(idx, 1);
            self._cfRefreshSwatches();
          } else {
            var picker = document.getElementById("tk-cf-color-picker");
            var hexInput = document.getElementById("tk-cf-hex-input");
            if (picker) picker.value = hex;
            if (hexInput) hexInput.value = hex;
            if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
              window.__adobe_cep__.evalScript("MoongetsuToolkit.applyColorToSelectedLayers('" + hex + "')");
            }
          }
        });
      }
    },

    _cfImport: function () {
      var input = document.getElementById("tk-cf-import");
      if (!input) return;
      var val = input.value.trim();
      if (!val) return;

      var hexes = [];
      var coolorsMatch = val.match(/coolors\.co\/([a-fA-F0-9-]+)/);
      if (coolorsMatch) {
        hexes = coolorsMatch[1].split("-").map(function (h) { return "#" + h.toUpperCase(); });
      } else {
        var m = val.match(/#?[0-9a-fA-F]{6}/g);
        if (m) hexes = m.map(function (h) { return h[0] === "#" ? h.toUpperCase() : "#" + h.toUpperCase(); });
      }

      for (var i = 0; i < hexes.length; i++) {
        if (this._cfActivePalette.indexOf(hexes[i]) < 0) this._cfActivePalette.push(hexes[i]);
      }
      this._cfRefreshSwatches();
      window.showToast("Imported " + hexes.length + " color(s).", "success");
    },

    _cfSavePalette: function () {
      var name = document.getElementById("tk-cf-save-name").value.trim();
      if (!name) { window.showToast("Enter a palette name.", "error"); return; }
      if (this._cfActivePalette.length === 0) { window.showToast("Palette is empty.", "error"); return; }

      try {
        var saved = JSON.parse(window.StorageManager.getItem("anismooth_cf_palettes", "[]"));
        saved.push({ name: name, hexes: this._cfActivePalette.slice(), category: "Saved" });
        window.StorageManager.setItem("anismooth_cf_palettes", JSON.stringify(saved));
        window.showToast("Palette saved.", "success");
        this._cfRebuildPresets();
      } catch (e) {
        window.showToast("Failed to save palette.", "error");
      }
    },

    _cfLoadPreset: function () {
      var sel = document.getElementById("tk-cf-presets");
      if (!sel) return;
      var val = sel.value;
      if (!val) return;

      var presets = {
        vaporwave: ["#FF6B6B", "#FECA57", "#48DBFB", "#FF9FF3", "#54A0FF"],
        sunset: ["#FF6B35", "#F7C59F", "#EFEFD0", "#004E89", "#1A659E"],
        cherry: ["#F72585", "#B5179E", "#7209B7", "#560BAD", "#480CA8"],
        ocean: ["#03045E", "#0077B6", "#00B4D8", "#90E0EF", "#CAF0F8"],
        forest: ["#2D6A4F", "#40916C", "#52B788", "#95D5B2", "#D8F3DC"],
        grayscale: ["#1A1A1A", "#404040", "#808080", "#BFBFBF", "#E6E6E6"]
      };

      if (presets[val]) {
        for (var i = 0; i < presets[val].length; i++) {
          if (this._cfActivePalette.indexOf(presets[val][i]) < 0) this._cfActivePalette.push(presets[val][i]);
        }
        this._cfRefreshSwatches();
        window.showToast("Preset loaded.", "success");
        return;
      }

      try {
        var saved = JSON.parse(window.StorageManager.getItem("anismooth_cf_palettes", "[]"));
        for (var j = 0; j < saved.length; j++) {
          if (saved[j].name === val) {
            for (var k = 0; k < saved[j].hexes.length; k++) {
              if (this._cfActivePalette.indexOf(saved[j].hexes[k]) < 0) this._cfActivePalette.push(saved[j].hexes[k]);
            }
            this._cfRefreshSwatches();
            window.showToast("Palette loaded.", "success");
            return;
          }
        }
      } catch (e) {}
    },

    _cfRebuildPresets: function () {
      var sel = document.getElementById("tk-cf-presets");
      if (!sel) return;
      try {
        var saved = JSON.parse(window.StorageManager.getItem("anismooth_cf_palettes", "[]"));
        var existingOptgroup = sel.querySelector("optgroup[label='Saved']");
        if (existingOptgroup) existingOptgroup.remove();
        if (saved.length > 0) {
          var og = document.createElement("optgroup");
          og.label = "Saved";
          for (var i = 0; i < saved.length; i++) {
            var opt = document.createElement("option");
            opt.value = saved[i].name;
            opt.textContent = saved[i].name + " (" + saved[i].hexes.length + ")";
            og.appendChild(opt);
          }
          sel.appendChild(og);
        }
      } catch (e) {}
    },

    _cfGenerateSolids: function () {
      if (this._cfActivePalette.length === 0) { window.showToast("Palette is empty.", "error"); return; }
      if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) return;
      var hexList = "[" + this._cfActivePalette.map(function (h) { return "'" + h + "'"; }).join(",") + "]";
      window.__adobe_cep__.evalScript("MoongetsuToolkit.createSolidPalette(" + hexList + ")", function (res) {
        try { var r = JSON.parse(res); if (r && r.ok) window.showToast("Solids created.", "success"); } catch (e) {}
      });
    },

    _cfRandomizeColors: function () {
      if (this._cfActivePalette.length === 0) { window.showToast("Palette is empty. Add colors first.", "error"); return; }
      if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) return;
      var hexList = "[" + this._cfActivePalette.map(function (h) { return "'" + h + "'"; }).join(",") + "]";
      window.__adobe_cep__.evalScript("MoongetsuToolkit.randomizeColorsOnSelection(" + hexList + ")", function (res) {
        try { var r = JSON.parse(res); if (r && r.ok) window.showToast("Colors randomized.", "success"); } catch (e) {}
      });
    },

    _cfBuildHarmonies: function () {
      var container = document.getElementById("tk-cf-harmonies");
      if (!container) return;

      var hbase = document.getElementById("tk-cf-hbase");
      if (!hbase) return;

      var self = this;
      function hueFromHex(hex) {
        var r = parseInt(hex.slice(1,3), 16) / 255;
        var g = parseInt(hex.slice(3,5), 16) / 255;
        var b = parseInt(hex.slice(5,7), 16) / 255;
        var mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
        if (d === 0) return 0;
        var h = 0;
        if (mx === r) h = ((g-b)/d) % 6;
        else if (mx === g) h = (b-r)/d + 2;
        else h = (r-g)/d + 4;
        return Math.round(h * 60);
      }
      function hslToHex(h, s, l) {
        h = ((h % 360) + 360) % 360;
        var c = (1 - Math.abs(2*l - 1)) * s;
        var x = c * (1 - Math.abs((h/60)%2 - 1));
        var m = l - c/2;
        var r, g, b;
        if (h < 60) { r=c; g=x; b=0; }
        else if (h < 120) { r=x; g=c; b=0; }
        else if (h < 180) { r=0; g=c; b=x; }
        else if (h < 240) { r=0; g=x; b=c; }
        else if (h < 300) { r=x; g=0; b=c; }
        else { r=c; g=0; b=x; }
        var rh = Math.round((r+m)*255).toString(16).padStart(2,"0");
        var gh = Math.round((g+m)*255).toString(16).padStart(2,"0");
        var bh = Math.round((b+m)*255).toString(16).padStart(2,"0");
        return "#" + rh + gh + bh;
      }

      function renderHarmony(label, hues) {
        var row = '<div class="tk-harmony-row"><span style="font-size:9px;color:var(--text-2);min-width:80px;">' + label + '</span><div class="tk-harmony-swatches">';
        for (var i = 0; i < hues.length; i++) {
          var hex = hslToHex(hues[i], 0.7, 0.6);
          row += '<span class="tk-cf-swatch tk-cf-hswatch" style="background:' + hex + ';" data-hex="' + hex + '"></span>';
        }
        row += '</div></div>';
        return row;
      }

      function updateHarmonies() {
        var hex = hbase.value;
        var hue = hueFromHex(hex);
        var html = "";
        html += renderHarmony("Complementary", [hue, (hue+180)%360]);
        html += renderHarmony("Analogous", [(hue-30+360)%360, hue, (hue+30)%360]);
        html += renderHarmony("Triadic", [hue, (hue+120)%360, (hue+240)%360]);
        html += renderHarmony("Split Comp", [(hue+150)%360, hue, (hue+210)%360]);
        html += renderHarmony("Monochromatic", [hue, hue, hue, hue, hue].map(function (h, i) { return hslToHex(h, 0.5, 0.2 + i*0.2).toUpperCase(); }).reduce(function (a, c) { if (a.indexOf(c) < 0) a.push(c); return a; }, []).map(function (c) { return '<span class="tk-cf-swatch tk-cf-hswatch" style="background:' + c + ';" data-hex="' + c + '"></span>'; }).join(""));
        container.innerHTML = html;

        var hswatches = container.querySelectorAll(".tk-cf-hswatch");
        for (var s = 0; s < hswatches.length; s++) {
          hswatches[s].addEventListener("click", function (e) {
            var hex = this.getAttribute("data-hex");
            if (e.shiftKey) {
              if (self._cfActivePalette.indexOf(hex) < 0) self._cfActivePalette.push(hex);
              self._cfRefreshSwatches();
            } else {
              hbase.value = hex;
              document.getElementById("tk-cf-hbase-hex").textContent = hex;
              updateHarmonies();
            }
          });
        }
      }

      hbase.addEventListener("input", function () {
        document.getElementById("tk-cf-hbase-hex").textContent = hbase.value.toUpperCase();
      });
      hbase.addEventListener("change", function () {
        document.getElementById("tk-cf-hbase-hex").textContent = hbase.value.toUpperCase();
        updateHarmonies();
      });
      updateHarmonies();
    },

    _cfBuildLabels: function () {
      var container = document.getElementById("tk-cf-labels");
      if (!container || container._cfLabelsBuilt) return;
      container._cfLabelsBuilt = true;

      var labels = [
        { idx: 0, name: "None", hex: "#DBDBDB" },
        { idx: 1, name: "Red", hex: "#F54242" },
        { idx: 2, name: "Yellow", hex: "#F5E942" },
        { idx: 3, name: "Aqua", hex: "#42F5EF" },
        { idx: 4, name: "Pink", hex: "#F5429B" },
        { idx: 5, name: "Lavender", hex: "#A842F5" },
        { idx: 6, name: "Peach", hex: "#F5A742" },
        { idx: 7, name: "Sea Foam", hex: "#42F58D" },
        { idx: 8, name: "Blue", hex: "#4242F5" },
        { idx: 9, name: "Green", hex: "#42D642" },
        { idx: 10, name: "Purple", hex: "#A542D6" },
        { idx: 11, name: "Orange", hex: "#D68C42" },
        { idx: 12, name: "Brown", hex: "#8C5A2B" },
        { idx: 13, name: "Fuchsia", hex: "#D642C6" },
        { idx: 14, name: "Cyan", hex: "#42B3D6" },
        { idx: 15, name: "Sand", hex: "#D6CC42" },
        { idx: 16, name: "White", hex: "#FFFFFF" }
      ];

      var html = "";
      for (var i = 0; i < labels.length; i++) {
        var l = labels[i];
        html += '<div class="tk-label-row">';
        html += '<span class="tk-label-swatch" style="background:' + l.hex + ';" data-tk-label-idx="' + l.idx + '" title="Click: apply label"></span>';
        html += '<span class="tk-label-name">' + l.name + '</span>';
        html += '<span class="tk-label-action" data-tk-label-action="select" data-tk-label-idx="' + l.idx + '" title="Select layers"><i class="fa-solid fa-magnifying-glass"></i></span>';
        html += '<span class="tk-label-action" data-tk-label-action="toggle" data-tk-label-idx="' + l.idx + '" title="Toggle visibility"><i class="fa-solid fa-eye"></i></span>';
        html += '<span class="tk-label-action" data-tk-label-action="solo" data-tk-label-idx="' + l.idx + '" title="Solo group"><i class="fa-solid fa-star"></i></span>';
        html += '</div>';
      }
      container.innerHTML = html;

      var self = this;
      container.addEventListener("click", function (e) {
        var swatch = e.target.closest(".tk-label-swatch");
        var action = e.target.closest(".tk-label-action");
        if (!swatch && !action) return;

        if (swatch) {
          var idx = swatch.getAttribute("data-tk-label-idx");
          if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
            window.__adobe_cep__.evalScript("MoongetsuToolkit.setSelectionLabelColor(" + idx + ")");
          }
          return;
        }

        var act = action.getAttribute("data-tk-label-action");
        var idx2 = action.getAttribute("data-tk-label-idx");
        if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) return;

        if (act === "select") {
          window.__adobe_cep__.evalScript("MoongetsuToolkit.selectLayersByLabelColor(" + idx2 + ")");
        } else if (act === "toggle") {
          action.classList.toggle("active");
          window.__adobe_cep__.evalScript("MoongetsuToolkit.toggleLabelColorVisibility(" + idx2 + "," + action.classList.contains("active") + ")");
        } else if (act === "solo") {
          var allSolo = container.querySelectorAll('[data-tk-label-action="solo"]');
          var isActive = action.classList.contains("active");
          for (var a = 0; a < allSolo.length; a++) allSolo[a].classList.remove("active");
          if (!isActive) action.classList.add("active");
          window.__adobe_cep__.evalScript("MoongetsuToolkit.soloLabelColorLayers(" + idx2 + "," + (!isActive) + ")");
        }
      });
    }
  };

  window.ToolkitPanel = ToolkitPanel;
})();
