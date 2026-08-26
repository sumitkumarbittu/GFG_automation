(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  class EditorFocusMode {
    constructor(editor) { this.editor = editor; }
    start() {
      if (!this.editor?.isConnected || this.active) return;
      this.active = true; this.styles = []; this.hidden = [];
      const initial = this.editor.getBoundingClientRect(), remember = element => { if (!this.styles.some(row => row.element === element)) this.styles.push({ element, style: element.getAttribute('style') }); };
      let child = this.editor, parent = child.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement) {
        remember(parent); remember(child);
        Object.assign(parent.style, { width: '100%', maxWidth: 'none', minWidth: '0', flex: '1 1 auto' });
        Object.assign(child.style, { width: '100%', maxWidth: 'none', minWidth: '0', flex: '1 1 auto' });
        for (const sibling of parent.children) {
          if (sibling === child || /^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) continue;
          const rect = sibling.getBoundingClientRect(), style = getComputedStyle(sibling);
          if (!rect.width || !rect.height || style.position === 'fixed' || style.position === 'sticky') continue;
          const overlapsEditorBand = rect.top < initial.bottom - 8 && rect.bottom > initial.top + 8;
          const isSidePane = overlapsEditorBand && (rect.right <= initial.left + 24 || rect.left >= initial.right - 24 || rect.width > initial.width * .35);
          if (isSidePane) { this.hidden.push({ element: sibling, display: sibling.style.display }); sibling.style.display = 'none'; }
        }
        child = parent; parent = parent.parentElement;
      }
      remember(this.editor);
      const bottomControls = Math.max(0, innerHeight - initial.bottom), height = Math.max(320, innerHeight - initial.top - bottomControls);
      Object.assign(this.editor.style, { width: '100%', maxWidth: 'none', minWidth: '0', height: `${height}px`, maxHeight: `${height}px` });
      window.dispatchEvent(new Event('resize'));
    }
    stop() {
      if (!this.active) return;
      for (const row of [...this.hidden].reverse()) row.element.style.display = row.display;
      for (const row of [...this.styles].reverse()) { if (row.style == null) row.element.removeAttribute('style'); else row.element.setAttribute('style', row.style); }
      this.hidden = []; this.styles = []; this.active = false; window.dispatchEvent(new Event('resize'));
    }
  }
  class ScreenWakeLock {
    constructor(onChange = () => {}) { this.onChange = onChange; this.enabled = false; this.visibility = () => { if (this.enabled && document.visibilityState === 'visible') this.acquire(); }; }
    async acquire() {
      this.enabled = true; document.addEventListener('visibilitychange', this.visibility);
      if (!navigator.wakeLock?.request) { this.onChange('unavailable'); return false; }
      try { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => this.onChange(this.enabled ? 'released' : 'off')); this.onChange('active'); return true; }
      catch { this.onChange('unavailable'); return false; }
    }
    async release() { this.enabled = false; document.removeEventListener('visibilitychange', this.visibility); try { await this.lock?.release(); } catch {} this.lock = null; this.onChange('off'); }
  }
  return { EditorFocusMode, ScreenWakeLock };
});
