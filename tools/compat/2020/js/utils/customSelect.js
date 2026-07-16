(function () {
  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
  }

  var CustomSelect = {
    init: function () {
      var self = this;
      document.addEventListener("click", function (e) {
        var openDropdowns = document.querySelectorAll(".custom-select.open");
        for (var i = 0; i < openDropdowns.length; i++) {
          var dropdown = openDropdowns[i];
          if (!dropdown.contains(e.target)) {
            dropdown.classList.remove("open");
          }
        }

        var trigger = self.closest(e.target, ".select-trigger");
        if (trigger) {
          var dropdown = self.closest(trigger, ".custom-select");
          if (dropdown) {
            dropdown.classList.toggle("open");
          }
          return;
        }

        var option = self.closest(e.target, ".select-option");
        if (option) {
          var dropdown = self.closest(option, ".custom-select");
          if (dropdown && option.style.display !== "none") {
            var val = option.getAttribute("data-value");
            dropdown.value = val;
            dropdown.classList.remove("open");
          }
        }
      });

      var dropdowns = document.querySelectorAll(".custom-select");
      for (var j = 0; j < dropdowns.length; j++) {
        this.bindElement(dropdowns[j]);
      }
    },

    closest: function (el, selector) {
      var matches = el.matches || el.webkitMatchesSelector || el.mozMatchesSelector || el.msMatchesSelector;
      while (el) {
        if (matches && matches.call(el, selector)) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    },

    getOptionLabel: function (option) {
      return option.getAttribute("data-label") || (option.textContent || "").trim();
    },

    getOptionHTML: function (option) {
      if (option.hasAttribute("data-label")) {
        return esc(option.getAttribute("data-label"));
      }
      return esc((option.textContent || "").trim());
    },

    bindElement: function (el) {
      if (el._customSelectBound) return;
      el._customSelectBound = true;

      var options = el.querySelectorAll(".select-option");
      var initialOption = null;
      for (var oi = 0; oi < options.length; oi++) {
        if (options[oi].classList.contains("active") && options[oi].style.display !== "none") {
          initialOption = options[oi];
          break;
        }
      }
      if (!initialOption) {
        for (var vi = 0; vi < options.length; vi++) {
          if (options[vi].style.display !== "none") {
            initialOption = options[vi];
            break;
          }
        }
      }

      var initialVal = initialOption ? initialOption.getAttribute("data-value") : (options.length > 0 ? options[0].getAttribute("data-value") : "");
      el.setAttribute("data-value", initialVal || "");

      var textSpan = el.querySelector(".select-value");
      if (textSpan && initialOption) {
        textSpan.innerHTML = this.getOptionHTML(initialOption);
      }

      var self = this;

      el._getValue = function () {
        return this.getAttribute("data-value") || "";
      };

      el._setValue = function (newVal) {
        this.setAttribute("data-value", newVal);

        var allOptions = this.querySelectorAll(".select-option");
        var displayHTML = "";
        var found = false;

        for (var i = 0; i < allOptions.length; i++) {
          var opt = allOptions[i];
          opt.classList.remove("active");
        }

        for (var i = 0; i < allOptions.length; i++) {
          var opt = allOptions[i];
          if (opt.getAttribute("data-value") === newVal && opt.style.display !== "none") {
            opt.classList.add("active");
            displayHTML = self.getOptionHTML(opt);
            found = true;
            break;
          }
        }

        if (!found) {
          for (var fi = 0; fi < allOptions.length; fi++) {
            var fopt = allOptions[fi];
            if (fopt.style.display !== "none") {
              newVal = fopt.getAttribute("data-value");
              this.setAttribute("data-value", newVal);
              fopt.classList.add("active");
              displayHTML = self.getOptionHTML(fopt);
              found = true;
              break;
            }
          }
        }

        var span = this.querySelector(".select-value");
        if (span) {
          span.innerHTML = found ? displayHTML : newVal;
        }

        try {
          var event = document.createEvent("Event");
          event.initEvent("change", true, true);
          this.dispatchEvent(event);
        } catch (e) {}
      };

      el.value = el._getValue();
      Object.defineProperty(el, "value", {
        get: function () { return this._getValue(); },
        set: function (v) { this._setValue(v); },
        configurable: true
      });
    }
  };

  window.CustomSelect = CustomSelect;
  document.addEventListener("DOMContentLoaded", function () {
    CustomSelect.init();
  });
})();
