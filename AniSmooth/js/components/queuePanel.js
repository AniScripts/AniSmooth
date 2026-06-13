(function () {
  var QueuePanel = {
    init: function (app) {
      this.app = app;
      this.view = document.getElementById("queueView");

      var self = this;
      this.cancelBtn = document.getElementById("queueCancelBtn");
      this.clearBtn = document.getElementById("queueClearBtn");

      if (this.cancelBtn) {
        this.cancelBtn.addEventListener("click", function () {
          window.QueueManager.cancelAll();
        });
      }
      if (this.clearBtn) {
        this.clearBtn.addEventListener("click", function () {
          window.QueueManager.clearDone();
        });
      }

      window.QueueManager.onUpdate(function () {
        self.render();
      });
    },

    render: function () {
      var container = document.getElementById("queueEntries");
      if (!container) return;

      var queue = window.QueueManager.getAll();
      var running = window.QueueManager.isRunning();

      var cancelBtn = document.getElementById("queueCancelBtn");
      var clearBtn = document.getElementById("queueClearBtn");
      if (cancelBtn) cancelBtn.style.display = running ? "" : "none";
      if (clearBtn) {
        var hasDone = false;
        for (var i = 0; i < queue.length; i++) {
          if (queue[i].status === "done" || queue[i].status === "error" || queue[i].status === "cancelled") {
            hasDone = true; break;
          }
        }
        clearBtn.style.display = hasDone ? "" : "none";
      }

      if (queue.length === 0) {
        container.innerHTML =
          '<div class="queue-empty">' +
            '<i class="fa-solid fa-list-check"></i>' +
            '<p>Queue is empty</p>' +
            '<span>Add jobs from the Interpolation or Upscale tabs</span>' +
          '</div>';
        return;
      }

      var hasActive = running;
      var html = '';
      html += '<div class="queue-summary">' +
        queue.length + ' item' + (queue.length !== 1 ? 's' : '') +
        (hasActive ? ' · Processing' : ' · Idle') +
      '</div>';

      for (var i = 0; i < queue.length; i++) {
        var item = queue[i];
        var icon, rowCls;
        if (item.status === "processing") { icon = "fa-spinner fa-spin"; rowCls = "q-row-processing"; }
        else if (item.status === "done") { icon = "fa-circle-check"; rowCls = "q-row-done"; }
        else if (item.status === "error") { icon = "fa-circle-xmark"; rowCls = "q-row-error"; }
        else if (item.status === "cancelled") { icon = "fa-circle-stop"; rowCls = "q-row-cancelled"; }
        else { icon = "fa-circle"; rowCls = ""; }

        var taskIcon = item.mode === "upscale" ? "fa-maximize" : (item.mode === "dedupe" ? "fa-scissors" : "fa-forward");
        var taskLabel = item.mode === "upscale" ? "Upscale" : (item.mode === "dedupe" ? "Dedupe" : "Interpolation");
        var scaleLabel = item.mode === "upscale" ? (item.scale + "×") : (item.mode === "dedupe" ? ("t=" + (item.threshold || 0.05)) : (item.factor + "×"));

        var progressHtml = "";
        if (item.status === "processing" && typeof item.progress === "number") {
          progressHtml =
            '<div class="q-progress-wrap">' +
              '<div class="q-progress-track">' +
                '<div class="q-progress-fill" style="width:' + item.progress + '%"></div>' +
              '</div>' +
              '<span class="q-progress-pct">' + item.progress + '%</span>' +
            '</div>';
        }

        html +=
          '<div class="q-row ' + rowCls + '">' +
            '<i class="fa-solid ' + icon + ' q-status"></i>' +
            '<div class="q-info">' +
            '<div class="q-name">' + escapeHtml(item.name) + '</div>' +
            '<div class="q-meta">' +
              '<i class="fa-solid ' + taskIcon + '"></i> ' + taskLabel + ' · ' + scaleLabel + ' · ' + item.model.replace("rife4.25", "RIFE 4.25") +
              (item.preRenderPath ? ' · <i class="fa-solid fa-film"></i> pre-render saved' : '') +
            '</div>' +
              (item.status === "error" ? '<div class="q-err">' + escapeHtml(item.error || "Unknown error") + '</div>' : '') +
              progressHtml +
            '</div>' +
            (item.status === "queued"
              ? '<button class="q-remove" data-id="' + item.id + '"><i class="fa-solid fa-xmark"></i></button>'
              : '') +
          '</div>';
      }
      container.innerHTML = html;

      var self = this;
      var removes = container.querySelectorAll(".q-remove");
      for (var j = 0; j < removes.length; j++) {
        removes[j].addEventListener("click", function (e) {
          e.stopPropagation();
          var id = this.getAttribute("data-id");
          if (id) window.QueueManager.remove(id);
        });
      }
    }
  };

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(text || ""));
    return div.innerHTML;
  }

  window.QueuePanel = QueuePanel;
})();
