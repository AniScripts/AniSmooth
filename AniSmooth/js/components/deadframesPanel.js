(function () {
  var DeadframesPanel = {
    init: function (app) {
      this.app = app;
      this.view = document.getElementById("deadframesView");
      this.thresholdInput = document.getElementById("deadframeThreshold");
      this.removeBtn = document.getElementById("removeDeadframesBtn");
      this._sourceInfo = null;
      this.bindEvents();
    },

    bindEvents: function () {
      var self = this;
      if (this.removeBtn) {
        this.removeBtn.addEventListener("click", function () { self.addToQueue(); });
      }
    },

    refreshLayerInfo: function () {
      var self = this;
      if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) return;
      if (this._fetching) return;
      this._fetching = true;
      window.__adobe_cep__.evalScript("getSelectedLayerInfo()", function (result) {
        self._fetching = false;
        try { self._sourceInfo = JSON.parse(result || "{}"); } catch (e) { self._sourceInfo = null; }
      });
    },

    addToQueue: function () {
      var s = this._sourceInfo;
      if (!s || !s.ok) {
        alert("Select a footage layer in the timeline first.");
        return;
      }
      var threshold = this.thresholdInput ? parseFloat(this.thresholdInput.value) : 0.05;
      window.QueueManager.add({
        mode: "dedupe",
        task: "Dedupe",
        name: s.layerName || s.name || "Footage",
        threshold: threshold,
        options: {},
        width: s.width || 0,
        height: s.height || 0
      });
    }
  };

  window.DeadframesPanel = DeadframesPanel;
})();
