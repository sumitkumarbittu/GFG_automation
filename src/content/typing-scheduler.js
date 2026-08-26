(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  function seedToUint(seed) { let h = 1779033703; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); return h >>> 0; }
  function seededRandom(seed) { let a = seedToUint(seed); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function sampleCps(profile, min, max, random = Math.random) {
    if (min === max) return min;
    let u;
    if (profile === 'triangular') u = (random() + random()) / 2;
    else if (profile === 'bursty') u = random() < 0.18 ? 0.75 + random() * 0.25 : random() * 0.72;
    else u = random();
    return min + u * (max - min);
  }
  class TypingScheduler {
    constructor({ text, write, minCps, maxCps, profile, resampleMs, seed, pauseWhenHidden = true, onSample = () => {}, onSecond = () => {}, onDone = () => {}, onError = () => {} }) {
      Object.assign(this, { text, write, minCps, maxCps, profile, resampleMs, pauseWhenHidden, onSample, onSecond, onDone, onError });
      this.random = profile === 'seeded' ? seededRandom(seed) : Math.random;
      this.index = 0; this.tokens = 0; this.last = 0; this.lastSample = 0; this.target = minCps; this.pending = Promise.resolve(); this.running = false;
      this.secondStart = 0; this.secondChars = 0; this.boundFrame = t => this.frame(t);
    }
    start() { if (this.running) return; this.running = true; this.last = performance.now(); this.secondStart = this.last; this.resample(this.last); this.raf = requestAnimationFrame(this.boundFrame); }
    pause() { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); }
    resume() { if (!this.running && this.index < this.text.length) this.start(); }
    async stop() { this.pause(); await this.pending; }
    resample(now) { this.target = sampleCps(this.profile, this.minCps, this.maxCps, this.random); this.lastSample = now; this.onSample({ at: Date.now(), cps: this.target }); }
    frame(now) {
      if (!this.running) return;
      const hidden = this.pauseWhenHidden && typeof document !== 'undefined' && document.hidden;
      const elapsed = Math.min(250, Math.max(0, now - this.last)); this.last = now;
      if (!hidden) this.tokens = Math.min(this.maxCps * 0.5, this.tokens + elapsed * this.target / 1000);
      if (now - this.lastSample >= this.resampleMs) this.resample(now);
      const count = Math.min(Math.floor(this.tokens), this.text.length - this.index, 64);
      if (count > 0) {
        const chunk = this.text.slice(this.index, this.index + count); this.index += count; this.tokens -= count; this.secondChars += count;
        this.pending = this.pending.then(() => this.write(chunk)).catch(error => { this.error = error; this.pause(); this.onError(error); });
      }
      if (now - this.secondStart >= 1000) { this.onSecond({ at: Date.now(), characters: this.secondChars, elapsedMs: now - this.secondStart }); this.secondChars = 0; this.secondStart = now; }
      if (this.index >= this.text.length) { this.running = false; if (this.secondChars) { this.onSecond({ at: Date.now(), characters: this.secondChars, elapsedMs: now - this.secondStart }); this.secondChars = 0; } this.pending.then(this.onDone); return; }
      this.raf = requestAnimationFrame(this.boundFrame);
    }
  }
  return { seedToUint, seededRandom, sampleCps, TypingScheduler };
});
