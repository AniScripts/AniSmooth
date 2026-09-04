(function () {
  var ConsolePanel = {
    init: function(app) {
      this.app = app;
      this.active = false;
      this.bindEvents();
    },

    isActive: function() {
      return this.active;
    },

    bindEvents: function() {
      var self = this;

      var searchInput = document.getElementById('consoleSearch');
      if (searchInput) {
        searchInput.addEventListener('input', function() {
          window.setLogFilter('search', this.value);
        });
      }

      var cats = document.querySelectorAll('.console-cat');
      cats.forEach(function(cat) {
        cat.addEventListener('click', function() {
          cats.forEach(function(c) { c.classList.remove('active'); });
          this.classList.add('active');
          window.setLogFilter('mode', this.getAttribute('data-mode'));
        });
      });

      var levelBtns = document.querySelectorAll('.console-level-btn');
      levelBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          levelBtns.forEach(function(b) { b.classList.remove('active'); });
          this.classList.add('active');
          window.setLogFilter('level', this.getAttribute('data-level'));
        });
      });

      var scrollLockBtn = document.getElementById('consoleScrollLockBtn');
      if (scrollLockBtn) {
        scrollLockBtn.addEventListener('click', function() {
          window.consoleAutoScroll = !window.consoleAutoScroll;
          if (window.consoleAutoScroll) {
            this.classList.add('active');
          } else {
            this.classList.remove('active');
          }
        });
      }

      var copyBtn = document.getElementById('consoleCopyBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          var btn = this;
          window.copyLogsToClipboard(function(success) {
            var origHtml = btn.innerHTML;
            if (success) {
              btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
            } else {
              btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Failed';
            }
            setTimeout(function() {
              btn.innerHTML = origHtml;
            }, 1500);
          });
        });
      }

      var clearBtn = document.getElementById('consoleClearBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          window.clearLog();
        });
      }

      var exportBtn = document.getElementById('consoleExportBtn');
      if (exportBtn) {
        exportBtn.addEventListener('click', function() {
          window.exportLog();
        });
      }
    },

    updateCounters: function() {
      if (!window.getLogCounts) return;
      var counts = window.getLogCounts();
      var elAll = document.getElementById('countLevelAll');
      var elErr = document.getElementById('countLevelError');
      var elWarn = document.getElementById('countLevelWarn');
      var elInfo = document.getElementById('countLevelInfo');
      var elOk = document.getElementById('countLevelSuccess');

      if (elAll) elAll.textContent = String(counts.all || 0);
      if (elErr) elErr.textContent = String(counts.error || 0);
      if (elWarn) elWarn.textContent = String(counts.warn || 0);
      if (elInfo) elInfo.textContent = String(counts.info || 0);
      if (elOk) elOk.textContent = String(counts.success || 0);
    },

    getLevelIcon: function(level) {
      switch (level) {
        case 'error': return 'fa-solid fa-circle-xmark';
        case 'warn':  return 'fa-solid fa-triangle-exclamation';
        case 'success': return 'fa-solid fa-circle-check';
        case 'debug': return 'fa-solid fa-code';
        case 'info':
        default: return 'fa-solid fa-circle-info';
      }
    },

    renderLogContent: function() {
      var container = document.getElementById('consoleEntries');
      if (!container) return;

      this.updateCounters();

      var logs = getFilteredAndSortedLogs();

      if (logs.length === 0) {
        container.innerHTML =
          '<div class="console-empty">' +
          '  <i class="fa-solid fa-terminal"></i>' +
          '  <span>No log entries match filter</span>' +
          '</div>';
        return;
      }

      var wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 30;

      var html = '';
      for (var i = 0; i < logs.length; i++) {
        var entry = logs[i];
        var timeStr = entry.time.toISOString().replace('T', ' ').substring(11, 19);
        var iconClass = ConsolePanel.getLevelIcon(entry.level);
        var modeBadge = entry.mode ? '<span class="console-entry-mode">' + window.escapeHtmlLog(entry.mode) + '</span>' : '';

        html +=
          '<div class="console-entry console-' + entry.level + '">' +
          '  <div class="console-entry-header">' +
          '    <span class="console-entry-icon"><i class="' + iconClass + '"></i></span>' +
          '    <span class="console-entry-source">' + window.escapeHtmlLog(entry.source) + '</span>' +
          modeBadge +
          '    <span class="console-entry-time">' + timeStr + '</span>' +
          '  </div>' +
          '  <div class="console-entry-message">' + window.escapeHtmlLog(entry.message) + '</div>' +
          '</div>';
      }

      container.innerHTML = html;
      if (window.consoleAutoScroll && (wasAtBottom || container.dataset.firstRender !== "done")) {
        container.scrollTop = container.scrollHeight;
        container.dataset.firstRender = "done";
      }
    }
  };

  window.ConsolePanel = ConsolePanel;
})();
