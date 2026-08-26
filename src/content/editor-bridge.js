(function (root, factory) {
  const api = factory(root.TraversalLab || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (lab) {
  const LANGUAGE_MAP = { 'c++': 'cpp', cpp: 'cpp', c: 'cpp', java: 'java', python: 'python', python3: 'python', javascript: 'javascript', js: 'javascript', typescript: 'typescript', ts: 'typescript' };
  function normalizeLanguage(value) { const key = String(value || '').trim().toLowerCase(); if (LANGUAGE_MAP[key]) return LANGUAGE_MAP[key]; if (/c\+\+|gnu\+\+/.test(key)) return 'cpp'; if (/python/.test(key)) return 'python'; if (/javascript|node\s*v/.test(key)) return 'javascript'; if (/typescript/.test(key)) return 'typescript'; if (/^java\b/.test(key)) return 'java'; if (/^c\s*\(/.test(key)) return 'cpp'; return ''; }
  class MainWorldBridge {
    constructor(timeoutMs = 3000) { this.timeoutMs = timeoutMs; this.seq = 0; }
    call(method, args = {}) {
      return new Promise((resolve, reject) => {
        const id = `lab-${Date.now()}-${++this.seq}`;
        const timer = setTimeout(() => { document.removeEventListener('gfg-traversal-lab-response', receive); reject(new Error('Editor bridge timeout')); }, this.timeoutMs);
        const receive = event => { if (event.detail?.id !== id) return; clearTimeout(timer); document.removeEventListener('gfg-traversal-lab-response', receive); event.detail.ok ? resolve(event.detail.value) : reject(new Error(event.detail.error)); };
        document.addEventListener('gfg-traversal-lab-response', receive);
        document.dispatchEvent(new CustomEvent('gfg-traversal-lab-request', { detail: { id, method, args } }));
      });
    }
  }
  class TextBufferAdapter {
    constructor(source, language = 'cpp') { this.value = source; this.language = language; this.session = null; this.caret = 0; }
    async detect() { return { type: 'text-buffer', source: this.value, language: this.language, rect: { left: 0, top: 0, width: 800, height: 500 } }; }
    async begin(sessionId, position) { this.session = { id: sessionId, start: position, text: '' }; }
    async insert(text) { const at = this.session.start + this.session.text.length; this.value = this.value.slice(0, at) + text + this.value.slice(at); this.session.text += text; this.caret = at + text.length; return { start: this.session.start, end: this.caret, text: this.session.text }; }
    externalEdit(position, text) { this.value = this.value.slice(0, position) + text + this.value.slice(position); if (position < this.session.start) this.session.start += text.length; }
    async inspect() { return { source: this.value, start: this.session.start, end: this.session.start + this.session.text.length, current: this.value.slice(this.session.start, this.session.start + this.session.text.length) }; }
    async remove(force = false) { const current = await this.inspect(); if (!force && current.current !== this.session.text) throw new Error('External modification inside generated range'); this.value = this.value.slice(0, current.start) + this.value.slice(current.end); this.caret = current.start; this.session = null; }
  }
  class EditorBridge {
    constructor(transport = new MainWorldBridge()) { this.transport = transport; this.sessionId = null; this.generated = ''; }
    async detect(fallbackLanguage) { const found = await this.transport.call('detect'); found.language = normalizeLanguage(found.language) || fallbackLanguage; return found; }
    setPageLanguage(language) { return this.transport.call('setLanguage', { language }); }
    async begin(position, sessionId) { this.sessionId = sessionId; this.generated = ''; return this.transport.call('begin', { position, sessionId }); }
    async adopt(position, text, sessionId) { this.sessionId = sessionId; this.generated = text; return this.transport.call('adopt', { position, text, sessionId }); }
    async insert(text) { const result = await this.transport.call('insert', { sessionId: this.sessionId, text }); this.generated += text; return result; }
    prepareNative(text) { return this.transport.call('prepareNative', { sessionId: this.sessionId, text }); }
    async commitNative(text) { const result = await this.transport.call('commitNative', { sessionId: this.sessionId, text }); this.generated = result.text; return result; }
    cancelNative() { return this.transport.call('cancelNative', { sessionId: this.sessionId }); }
    inspect() { return this.transport.call('inspect', { sessionId: this.sessionId }); }
    remove(force = false) { return this.transport.call('remove', { sessionId: this.sessionId, force }); }
    removeRange(start, end) { return this.transport.call('removeRange', { start, end }); }
    caret() { return this.transport.call('caret', { sessionId: this.sessionId }); }
    release() { return this.transport.call('release', { sessionId: this.sessionId }); }
  }
  return { LANGUAGE_MAP, normalizeLanguage, MainWorldBridge, TextBufferAdapter, EditorBridge };
});
