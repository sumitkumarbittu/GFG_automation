(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  const DEFAULTS = Object.freeze({
    lastCompleted: 0, endPosition: 1, minutesPerQuestion: 5, skipRestricted: true,
    minCps: 40, maxCps: 150, speedProfile: 'uniform', resampleMs: 500, replaySeed: '',
    pointerEnabled: false, pointerIntervalMs: 2000, pointerAccuracy: 85,
    editorEnabled: true, editorConfirmed: false, pageLanguage: 'cpp', fallbackLanguage: 'cpp', pauseWhenHidden: true
  });
  const PROFILES = new Set(['uniform', 'triangular', 'bursty', 'seeded']);
  const LANGUAGES = new Set(['cpp', 'java', 'python', 'javascript', 'typescript']);
  function finite(value, name) { const n = Number(value); if (!Number.isFinite(n)) throw new RangeError(`${name} must be finite`); return n; }
  function validateConfig(input = {}) {
    const c = { ...DEFAULTS, ...input };
    c.lastCompleted = finite(c.lastCompleted, 'Last completed position');
    c.endPosition = finite(c.endPosition, 'End position');
    if (!Number.isInteger(c.lastCompleted) || !Number.isInteger(c.endPosition) || c.lastCompleted < 0 || c.endPosition <= c.lastCompleted) throw new RangeError('End position must be greater than last completed position');
    c.minutesPerQuestion = finite(c.minutesPerQuestion, 'Minutes per question');
    if (c.minutesPerQuestion <= 0 || c.minutesPerQuestion > 1440) throw new RangeError('Minutes per question must be in (0, 1440]');
    c.minCps = finite(c.minCps, 'Minimum CPS'); c.maxCps = finite(c.maxCps, 'Maximum CPS');
    if (c.minCps < 1 || c.maxCps > 1000 || c.minCps > c.maxCps) throw new RangeError('CPS must satisfy 1 <= minimum <= maximum <= 1000');
    c.resampleMs = finite(c.resampleMs, 'Resampling interval');
    if (c.resampleMs < 100 || c.resampleMs > 60000) throw new RangeError('Resampling interval must be 100 to 60000 ms');
    c.pointerIntervalMs = finite(c.pointerIntervalMs, 'Pointer interval');
    if (c.pointerIntervalMs < 250 || c.pointerIntervalMs > 30000) throw new RangeError('Pointer interval must be 250 to 30000 ms');
    c.pointerAccuracy = finite(c.pointerAccuracy, 'Pointer accuracy');
    if (c.pointerAccuracy < 0 || c.pointerAccuracy > 100) throw new RangeError('Pointer accuracy must be 0 to 100');
    if (!PROFILES.has(c.speedProfile)) throw new RangeError('Unknown speed profile');
    if (!LANGUAGES.has(c.fallbackLanguage)) throw new RangeError('Unsupported fallback language');
    if (!new Set(['auto', 'cpp', 'java', 'python', 'javascript']).has(c.pageLanguage)) throw new RangeError('Unsupported page language');
    for (const key of ['skipRestricted', 'pointerEnabled', 'editorEnabled', 'editorConfirmed', 'pauseWhenHidden']) c[key] = Boolean(c[key]);
    return c;
  }
  return { DEFAULTS, PROFILES, LANGUAGES, validateConfig };
});
