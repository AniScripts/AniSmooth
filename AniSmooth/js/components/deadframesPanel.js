(function () {
  var DeadframesPanel = {
    init: function (app) {
      this.app = app;
      this.view = document.getElementById("deadframesView");
      this.flowThresholdInput = document.getElementById("deadframeFlowThreshold");
      this.motionAreaInput = document.getElementById("deadframeMotionAreaFraction");
      this.cadenceInput = document.getElementById("deadframeCadence");
      this.detectScaleInput = document.getElementById("deadframeDetectScale");
      this.autoCheck = document.getElementById("deadframeAuto");
      this.keepTalkingCheck = document.getElementById("deadframeKeepTalking");
      this.keepCameraCheck = document.getElementById("deadframeKeepCamera");
      this.parallaxCheck = document.getElementById("deadframeParallax");
      this.smallMovementsInput = document.getElementById("deadframeSmallMovements");
      this.removeBtn = document.getElementById("removeDeadframesBtn");
      this._sourceInfo = null;
      this.bindEvents();
    },

    bindEvents: function () {
      var self = this;
      if (this.removeBtn) {
        this.removeBtn.addEventListener("click", function () { self.addToQueue(); });
      }

      var labels = this.view.querySelectorAll(".collapse-label");
      for (var i = 0; i < labels.length; i++) {
        (function (label) {
          var group = label.parentElement;
          var keyName = label.getAttribute("data-df-group");
          if (!keyName) return;

          if (window.StorageManager.getItem("anismooth_df_collapse_" + keyName) === "1") {
            group.classList.add("collapsed");
          }

          label.addEventListener("click", function () {
            var collapsed = !group.classList.contains("collapsed");
            if (collapsed) {
              group.classList.add("collapsed");
            } else {
              group.classList.remove("collapsed");
            }
            window.StorageManager.setItem("anismooth_df_collapse_" + keyName, collapsed ? "1" : "0");
          });
        })(labels[i]);
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
        window.showToast("Select a footage layer in the timeline first.", "error");
        return;
      }

      var auto = this.autoCheck ? !!this.autoCheck.checked : false;
      var keepTalking = this.keepTalkingCheck ? !!this.keepTalkingCheck.checked : false;
      var keepCamera = this.keepCameraCheck ? !!this.keepCameraCheck.checked : false;
      var parallax = this.parallaxCheck ? !!this.parallaxCheck.checked : false;
      var smallMovementsVal = this.smallMovementsInput ? this.smallMovementsInput.value.trim() : "";
      var smallMovements = smallMovementsVal !== "" ? parseFloat(smallMovementsVal) : null;

      var options = {
        flowThreshold: this.flowThresholdInput ? parseFloat(this.flowThresholdInput.value) || 0.5 : 0.5,
        motionAreaFraction: this.motionAreaInput ? parseFloat(this.motionAreaInput.value) || 0.15 : 0.15,
        cadence: this.cadenceInput ? parseInt(this.cadenceInput.value, 10) || 3 : 3,
        detectScale: this.detectScaleInput ? parseFloat(this.detectScaleInput.value) || 1.0 : 1.0,
        auto: auto || keepTalking || keepCamera,
        keepTalking: keepTalking,
        keepCamera: keepCamera,
        parallax: parallax,
        smallMovements: smallMovements
      };

      window.QueueManager.add({
        mode: "dedupe",
        task: "Dedupe",
        name: s.layerName || s.name || "Footage",
        layerIndex: s.layerIndex || 0,
        options: options,
        width: s.width || 0,
        height: s.height || 0
      });
      this.app.switchTab("queue");
    }
  };

  window.DeadframesPanel = DeadframesPanel;
})();
