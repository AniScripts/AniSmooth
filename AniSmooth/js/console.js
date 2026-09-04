window.consoleLog = [];
window.consoleMaxEntries = 500;
window.consoleFilter = { level: 'all', source: 'all', search: '', mode: 'all' };
window.consoleSort = { by: 'time', order: 'asc' };
window.consoleAutoScroll = true;

var _renderDebounceTimer = null;

function inferLogMode(source) {
  if (!source) return '';
  var s = String(source).toLowerCase();
  if (s.indexOf('interpolate') !== -1 || s.indexOf('rife') !== -1) return 'interpolate';
  if (s.indexOf('upscale') !== -1 || s.indexOf('realesr') !== -1 || s.indexOf('cugan') !== -1 || s.indexOf('spandrel') !== -1) return 'upscale';
  if (s.indexOf('dedupe') !== -1 || s.indexOf('deadframe') !== -1) return 'dedupe';
  if (s.indexOf('flowframe') !== -1) return 'flowframes';
  return '';
}

function dbg(level, source, message, mode) {
  var resolvedMode = mode || inferLogMode(source);
  var entry = {
    time: new Date(),
    level: level,
    source: source,
    message: String(message || ''),
    mode: resolvedMode
  };

  window.consoleLog.push(entry);

  if (window.consoleLog.length > window.consoleMaxEntries) {
    window.consoleLog.shift();
  }

  var browserLevel = level === 'success' ? 'info' : (level === 'warn' ? 'warn' : (level === 'error' ? 'error' : 'log'));
  try {
    var prefix = '[' + source + ']';
    console[browserLevel](prefix, message);
  } catch (e) {}

  if (window.ConsolePanel && window.ConsolePanel.isActive && window.ConsolePanel.isActive()) {
    if (!_renderDebounceTimer) {
      _renderDebounceTimer = setTimeout(function () {
        _renderDebounceTimer = null;
        if (window.ConsolePanel && window.ConsolePanel.renderLogContent) {
          window.ConsolePanel.renderLogContent();
        }
      }, 40);
    }
  }
}

function getLogCounts() {
  var counts = { all: window.consoleLog.length, error: 0, warn: 0, info: 0, success: 0, debug: 0 };
  for (var i = 0; i < window.consoleLog.length; i++) {
    var lvl = window.consoleLog[i].level;
    if (counts[lvl] !== undefined) counts[lvl]++;
  }
  return counts;
}

function getFilteredAndSortedLogs() {
  var logs = window.consoleLog.slice();
  var filter = window.consoleFilter;

  if (filter.level !== 'all') {
    logs = logs.filter(function(entry) {
      return entry.level === filter.level;
    });
  }

  if (filter.mode !== 'all') {
    logs = logs.filter(function(entry) {
      return entry.mode === filter.mode;
    });
  }

  if (filter.search) {
    var search = filter.search.toLowerCase();
    logs = logs.filter(function(entry) {
      return entry.message.toLowerCase().indexOf(search) !== -1 ||
             entry.source.toLowerCase().indexOf(search) !== -1;
    });
  }

  var sort = window.consoleSort;
  logs.sort(function(a, b) {
    var result;
    switch (sort.by) {
      case 'source':
        result = a.source.localeCompare(b.source);
        break;
      case 'level':
        var levels = { error: 0, warn: 1, info: 2, debug: 3, success: 4 };
        result = (levels[a.level] || 2) - (levels[b.level] || 2);
        break;
      default:
        result = a.time - b.time;
    }
    return sort.order === 'desc' ? -result : result;
  });

  return logs;
}

window.setLogFilter = function(type, value) {
  if (type === 'level') window.consoleFilter.level = value;
  if (type === 'mode') window.consoleFilter.mode = value;
  if (type === 'search') window.consoleFilter.search = value;
  if (window.ConsolePanel && window.ConsolePanel.renderLogContent) window.ConsolePanel.renderLogContent();
};

window.setLogSort = function(by) {
  if (window.consoleSort.by === by) {
    window.consoleSort.order = window.consoleSort.order === 'asc' ? 'desc' : 'asc';
  } else {
    window.consoleSort.by = by;
    window.consoleSort.order = 'desc';
  }
  if (window.ConsolePanel && window.ConsolePanel.renderLogContent) window.ConsolePanel.renderLogContent();
};

window.clearLog = function() {
  window.consoleLog = [];
  if (window.ConsolePanel && window.ConsolePanel.renderLogContent) window.ConsolePanel.renderLogContent();
  dbg('info', 'Console', 'Log cleared');
};

window.copyLogsToClipboard = function(cb) {
  var logs = getFilteredAndSortedLogs();
  var lines = [];
  for (var i = 0; i < logs.length; i++) {
    var entry = logs[i];
    var time = entry.time.toISOString().replace('T', ' ').substring(0, 19);
    var modeTag = entry.mode ? ' [' + entry.mode + ']' : '';
    lines.push('[' + time + '] ' + entry.level.toUpperCase() + ' [' + entry.source + ']' + modeTag + ' ' + entry.message);
  }
  var text = lines.join('\n');

  try {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    var success = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (cb) cb(success);
  } catch (e) {
    if (cb) cb(false);
  }
};

window.exportLog = function() {
  var logs = getFilteredAndSortedLogs();
  var filter = window.consoleFilter;
  var suffix = '';
  if (filter.mode !== 'all') {
    suffix = '-' + filter.mode;
  } else if (filter.level !== 'all') {
    suffix = '-' + filter.level;
  }

  var text = 'AniSmooth Console Log\n';
  if (filter.mode !== 'all') text += 'Category: ' + filter.mode + '\n';
  if (filter.level !== 'all') text += 'Level: ' + filter.level + '\n';
  text += 'Export: ' + new Date().toISOString() + '\n';
  text += 'Entries: ' + logs.length + '\n';
  text += Array(60).join('-') + '\n\n';

  logs.forEach(function(entry) {
    var time = entry.time.toISOString().replace('T', ' ').substring(0, 19);
    var modeTag = entry.mode ? ' [' + entry.mode + ']' : '';
    text += '[' + time + '] ' + entry.level.toUpperCase() + ' [' + entry.source + ']' + modeTag + ' ' + entry.message + '\n';
  });

  try {
    var outDir = (window.FileSystem && window.FileSystem.os)
      ? window.FileSystem.os.homedir()
      : "";
    if (!outDir && window.App && window.App.settings.outputPath) {
      outDir = window.App.settings.outputPath;
    }
    var ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    var defaultName = "anismooth" + suffix + "-log-" + ts + ".txt";

    var filePath = window.FileSystem.chooseSaveFileWithSystemExplorer(
      "Save Log Export", outDir, defaultName
    );

    if (!filePath) {
      dbg("info", "Console", "Export cancelled");
      return;
    }

    window.FileSystem.fs.writeFileSync(filePath, text, "utf8");
    dbg("success", "Console", "Log exported: " + filePath);

    try {
      var childProcess = window.FileSystem.childProcess;
      childProcess.execFile('explorer.exe', ['/select,' + filePath]);
    } catch (e) {}
  } catch (e) {
    dbg("error", "Console", "Export failed: " + (e.message || e));

    try {
      var blob = new Blob([text], { type: "text/plain" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = defaultName || "anismooth-log.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e2) {}
  }
};

function escapeHtmlLog(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}
window.escapeHtmlLog = escapeHtmlLog;
window.getLogCounts = getLogCounts;
