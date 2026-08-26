(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  const HOST_NAME = 'com.gfg.traversal_lab';
  class NativeHostClient {
    constructor({ chromeApi = chrome, timeoutMs = 5000 } = {}) {
      this.chrome = chromeApi; this.timeoutMs = timeoutMs; this.seq = 0; this.pending = new Map(); this.info = null; this.lastError = null;
    }
    connect() {
      if (this.port) return this.port;
      try { this.port = this.chrome.runtime.connectNative(HOST_NAME); }
      catch (error) { this.lastError = error.message; throw new Error(`Native companion unavailable: ${error.message}`); }
      this.port.onMessage.addListener(message => this.receive(message));
      this.port.onDisconnect.addListener(() => this.disconnect(this.chrome.runtime.lastError?.message || 'Native companion disconnected'));
      return this.port;
    }
    receive(message) {
      const row = this.pending.get(message?.id); if (!row) return;
      clearTimeout(row.timer); this.pending.delete(message.id);
      if (message.ok) row.resolve(message.result); else row.reject(new Error(message.error || 'Native command failed'));
    }
    disconnect(reason) {
      this.lastError = reason; this.port = null; this.info = null;
      for (const row of this.pending.values()) { clearTimeout(row.timer); row.reject(new Error(reason)); }
      this.pending.clear();
    }
    command(command) {
      const allowed = new Set(['hello', 'type', 'move', 'stop']);
      if (!allowed.has(command?.action)) return Promise.reject(new Error('Unsupported native command'));
      const port = this.connect(), id = `native-${Date.now()}-${++this.seq}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Native companion timeout')); }, this.timeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        try { port.postMessage({ id, ...command }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
      });
    }
    async probe() {
      try {
        const info = await this.command({ action: 'hello', prompt: true });
        if (!info?.accessibility) throw new Error(info?.platform === 'macos' ? 'Grant Accessibility permission to the GFG Traversal Lab native companion' : 'Native input permission is unavailable');
        this.info = info; this.lastError = null; return info;
      } catch (error) { this.lastError = error.message; throw new Error(`OS input mode unavailable: ${error.message}`); }
    }
    async status() {
      try { return { connected: true, info: await this.probe(), error: null }; }
      catch (error) { return { connected: false, info: null, error: error.message }; }
    }
  }
  return { HOST_NAME, NativeHostClient };
});
