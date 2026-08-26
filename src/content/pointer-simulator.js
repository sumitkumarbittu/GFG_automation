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
    constructor({ editorElement, intervalMs, accuracy, onMove = () => {} }) { Object.assign(this, { editorElement, intervalMs, accuracy, onMove }); }
    start() { if (this.timer) return; this.dot = document.createElement('div'); this.dot.id = 'gfg-traversal-lab-pointer'; Object.assign(this.dot.style, { position: 'fixed', zIndex: '2147483647', width: '12px', height: '12px', borderRadius: '50%', background: '#7c3aed', border: '2px solid #fff', boxShadow: '0 2px 10px #0008', pointerEvents: 'none', transition: `transform ${Math.min(600, this.intervalMs * .6)}ms ease-out` }); document.documentElement.appendChild(this.dot); this.move(); this.timer = setInterval(() => this.move(), this.intervalMs); }
    move() { if (!this.editorElement?.isConnected) return this.stop(); const rect = this.editorElement.getBoundingClientRect(), selection = document.getSelection(); let caretRect = this.editorElement.querySelector('.cursor,.ace_cursor,.CodeMirror-cursor')?.getBoundingClientRect() || null; if (!caretRect && selection?.rangeCount) caretRect = selection.getRangeAt(0).getBoundingClientRect(); const p = pointerTarget(rect, caretRect, this.accuracy); this.dot.style.transform = `translate(${p.x - 6}px, ${p.y - 6}px)`; const target = document.elementFromPoint(p.x, p.y) || this.editorElement; for (const type of ['mousemove', 'pointermove']) target.dispatchEvent(new (type === 'pointermove' ? PointerEvent : MouseEvent)(type, { bubbles: true, clientX: p.x, clientY: p.y })); this.onMove({ at: Date.now(), x: p.nx, y: p.ny }); }
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.dot?.remove(); this.dot = null; }
  }
  return { pointerTarget, PointerSimulator };
});
