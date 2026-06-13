(function () {
  const StorageManager = {
    getItem(key, defaultValue) {
      try {
        const val = localStorage.getItem(key);
        return val !== null ? val : defaultValue;
      } catch (e) {
        return defaultValue;
      }
    },

    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.error("StorageManager setItem failed:", e);
      }
    },

    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.error("StorageManager removeItem failed:", e);
      }
    },

    // Queue for batch processing
    loadProcessingQueue() {
      try {
        const raw = this.getItem("anismooth_processing_queue", "[]");
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        return [];
      }
    },

    saveProcessingQueue(queue) {
      this.setItem("anismooth_processing_queue", JSON.stringify(queue || []));
    },

    // Processing History
    loadSessionHistory() {
      try {
        const raw = this.getItem("anismooth_history", "[]");
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        return [];
      }
    },

    saveSessionHistory(history) {
      this.setItem("anismooth_history", JSON.stringify(history || []));
    }
  };

  window.StorageManager = StorageManager;
})();
