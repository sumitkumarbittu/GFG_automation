(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  function pointerTarget(rect, caretRect, accuracy, random = Math.random) {
    const weight = accuracy / 100, cx = caretRect?.left ?? rect.left + rect.width / 2, cy = caretRect?.top ?? rect.top + rect.height / 2;
    const wideX = rect.left + random() * rect.width, wideY = rect.top + random() * rect.height;
    const radius = (1 - weight) * Math.min(rect.width, rect.height) * 0.35 + 4;
    const nearX = cx + (random() * 2 - 1) * radius, nearY = cy + (random() * 2 - 1) * radius;
    const padX = rect.width >= 12 ? 6 : 0, padY = rect.height >= 12 ? 6 : 0;
    const x = Math.max(rect.left + padX, Math.min((rect.right ?? rect.left + rect.width) - padX, nearX * weight + wideX * (1 - weight)));
    const y = Math.max(rect.top + padY, Math.min((rect.bottom ?? rect.top + rect.height) - padY, nearY * weight + wideY * (1 - weight)));
    return { x, y, nx: rect.width ? (x - rect.left) / rect.width : 0, ny: rect.height ? (y - rect.top) / rect.height : 0 };
  }
  class PointerSimulator {
    constructor({ editorElement, intervalMs = 2000, minIntervalMs = intervalMs, maxIntervalMs = intervalMs, accuracy, scope = 'editor', random = Math.random, onMove = () => {} }) { Object.assign(this, { editorElement, minIntervalMs, maxIntervalMs, accuracy, scope, random, onMove }); }
    start() { if (this.timer) return; this.dot = document.createElement('div'); this.dot.id = 'gfg-traversal-lab-pointer'; Object.assign(this.dot.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', width: '12px', height: '12px', borderRadius: '50%', background: '#7c3aed', border: '2px solid #fff', boxShadow: '0 2px 10px #0008', pointerEvents: 'none' }); document.documentElement.appendChild(this.dot); this.schedule(0); }
    schedule(delay) { this.timer = setTimeout(() => { this.timer = null; this.move(); if (this.dot) this.schedule(this.minIntervalMs + this.random() * (this.maxIntervalMs - this.minIntervalMs)); }, delay); }
    move() { if (!this.editorElement?.isConnected) return this.stop(); const editorRect = this.editorElement.getBoundingClientRect(), rect = this.scope === 'viewport' ? { left: 0, top: 0, width: innerWidth, height: innerHeight, right: innerWidth, bottom: innerHeight } : editorRect, selection = document.getSelection(); let caretRect = this.editorElement.querySelector('.cursor,.ace_cursor,.CodeMirror-cursor')?.getBoundingClientRect() || null; if (!caretRect && selection?.rangeCount) caretRect = selection.getRangeAt(0).getBoundingClientRect(); const p = pointerTarget(rect, caretRect, this.accuracy, this.random); const duration = Math.max(90, Math.min(900, this.minIntervalMs * (.25 + this.random() * .55))); this.dot.style.transition = `transform ${duration}ms cubic-bezier(${(.15 + this.random() * .25).toFixed(2)},${(.55 + this.random() * .35).toFixed(2)},${(.45 + this.random() * .25).toFixed(2)},1)`; this.dot.style.transform = `translate(${p.x - 6}px, ${p.y - 6}px)`; const target = document.elementFromPoint(p.x, p.y) || this.editorElement; for (const type of ['mousemove', 'pointermove']) target.dispatchEvent(new (type === 'pointermove' ? PointerEvent : MouseEvent)(type, { bubbles: true, clientX: p.x, clientY: p.y })); this.onMove({ at: Date.now(), x: p.nx, y: p.ny, scope: this.scope, intervalMs: this.minIntervalMs + this.random() * (this.maxIntervalMs - this.minIntervalMs) }); }
    stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.dot?.remove(); this.dot = null; }
  }
  return { pointerTarget, PointerSimulator };
});
