(function () {
  var _fs, _path;
  var _storePath = "";
  var _store = {};
  var _dirty = false;

  function _ensureStore() {
    if (_fs && _path) return true;
    if (window.FileSystem && window.FileSystem.fs && window.FileSystem.path) {
      _fs = window.FileSystem.fs;
      _path = window.FileSystem.path;
      try {
        var appdata = process.env.APPDATA || "";
        if (!appdata) {
          var homedir = (window.FileSystem.os ? window.FileSystem.os.homedir() : "") || "";
          appdata = homedir ? _path.join(homedir, "AppData", "Roaming") : "";
        }
        if (appdata) {
          _storePath = _path.join(appdata, "com.moongetsu.extensions", "AniSmooth", "settings.json");
          if (_fs.existsSync(_storePath)) {
            try {
              _store = JSON.parse(_fs.readFileSync(_storePath, "utf8")) || {};
            } catch (e) {
              _store = {};
            }
          } else {
            // First run: import any existing localStorage data into the file store
            for (var key in localStorage) {
              if (localStorage.hasOwnProperty(key) && key.indexOf("anismooth_") === 0) {
                _store[key] = localStorage.getItem(key);
              }
            }
            if (Object.keys(_store).length > 0) _dirty = true;
          }
        }
      } catch (e) {
        _store = {};
      }
    }
    return !!_fs;
  }

  function _flush() {
    if (!_dirty || !_storePath || !_fs) return;
    _dirty = false;
    try {
      var dir = _path.dirname(_storePath);
      if (!_fs.existsSync(dir)) _fs.mkdirSync(dir, { recursive: true });
      _fs.writeFileSync(_storePath, JSON.stringify(_store, null, 2), "utf8");
    } catch (e) {
      // file write failed, keep using localStorage
    }
  }

  var StorageManager = {
    getItem: function (key, defaultValue) {
      _ensureStore();
      var fromStore = _store.hasOwnProperty(key) ? _store[key] : undefined;
      if (fromStore !== undefined) return fromStore;
      try {
        var ls = localStorage.getItem(key);
        if (ls !== null) {
          _store[key] = ls;
          _dirty = true;
          return ls;
        }
      } catch (e) {}
      return defaultValue;
    },

    setItem: function (key, value) {
      _store[key] = value;
      _dirty = true;
      _flush();
      try {
        localStorage.setItem(key, value);
      } catch (e) {}
    },

    removeItem: function (key) {
      delete _store[key];
      _dirty = true;
      _flush();
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    },

    loadProcessingQueue: function () {
      try {
        var raw = this.getItem("anismooth_processing_queue", "[]");
        var data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        return [];
      }
    },

    saveProcessingQueue: function (queue) {
      this.setItem("anismooth_processing_queue", JSON.stringify(queue || []));
    },

    loadSessionHistory: function () {
      try {
        var raw = this.getItem("anismooth_history", "[]");
        var data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        return [];
      }
    },

    saveSessionHistory: function (history) {
      this.setItem("anismooth_history", JSON.stringify(history || []));
    }
  };

  window.StorageManager = StorageManager;

  // Attempt init on next tick so fileSystem.js has loaded
  setTimeout(function () { _ensureStore(); }, 0);

  // Flush to disk when panel closes
  try { window.addEventListener('beforeunload', function () { _ensureStore(); _flush(); }); } catch (e) {}
})();
