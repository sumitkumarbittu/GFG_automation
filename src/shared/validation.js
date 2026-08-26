(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  const DEFAULTS = Object.freeze({
    traversalMode: 'catalog', urlList: '',
    lastCompleted: 0, endPosition: 1, minutesPerQuestion: 5, skipRestricted: true,
    minCps: 40, maxCps: 150, speedProfile: 'uniform', minResampleMs: 250, maxResampleMs: 1500, resampleMs: 500, replaySeed: '',
    minChunkSize: 1, maxChunkSize: 24, pauseProbability: 0.04, minPauseMs: 80, maxPauseMs: 900,
    pointerEnabled: false, minPointerIntervalMs: 1000, maxPointerIntervalMs: 1000, pointerIntervalMs: 1000, pointerAccuracy: 85, pointerScope: 'viewport',
    inputMode: 'synthetic', nativeMoveDurationMs: 420,
    editorEnabled: true, editorConfirmed: false, pageLanguage: 'cpp', fallbackLanguage: 'cpp', pauseWhenHidden: true,
    autoRetry: true, maxRetries: 5, autoSkip: true, focusMode: true, keepAwake: true
  });
  const PROFILES = new Set(['uniform', 'triangular', 'bursty', 'seeded']);
  const LANGUAGES = new Set(['cpp', 'java', 'python', 'javascript', 'typescript']);
  function finite(value, name) { const n = Number(value); if (!Number.isFinite(n)) throw new RangeError(`${name} must be finite`); return n; }
  function validateConfig(input = {}) {
    const c = { ...DEFAULTS, ...input };
    if (Object.prototype.hasOwnProperty.call(input, 'resampleMs') && !Object.prototype.hasOwnProperty.call(input, 'minResampleMs')) c.minResampleMs = c.maxResampleMs = input.resampleMs;
    if (Object.prototype.hasOwnProperty.call(input, 'pointerIntervalMs') && !Object.prototype.hasOwnProperty.call(input, 'minPointerIntervalMs')) c.minPointerIntervalMs = c.maxPointerIntervalMs = input.pointerIntervalMs;
    if (!new Set(['catalog', 'urls']).has(c.traversalMode)) throw new RangeError('Unknown traversal mode');
    c.urlList = String(c.urlList || '').trim();
    c.lastCompleted = finite(c.lastCompleted, 'Last completed position'); c.endPosition = finite(c.endPosition, 'End position');
    if (c.traversalMode === 'catalog' && (!Number.isInteger(c.lastCompleted) || !Number.isInteger(c.endPosition) || c.lastCompleted < 0 || c.endPosition <= c.lastCompleted)) throw new RangeError('End position must be greater than last completed position');
    if (c.traversalMode === 'urls' && !c.urlList) throw new RangeError('Add at least one GeeksforGeeks problem URL');
    c.minutesPerQuestion = finite(c.minutesPerQuestion, 'Minutes per question');
    if (c.minutesPerQuestion <= 0 || c.minutesPerQuestion > 1440) throw new RangeError('Minutes per question must be in (0, 1440]');
    c.minCps = finite(c.minCps, 'Minimum CPS'); c.maxCps = finite(c.maxCps, 'Maximum CPS');
    if (c.minCps < 1 || c.maxCps > 1000 || c.minCps > c.maxCps) throw new RangeError('CPS must satisfy 1 <= minimum <= maximum <= 1000');
    c.minResampleMs = finite(c.minResampleMs ?? c.resampleMs, 'Minimum speed-change interval'); c.maxResampleMs = finite(c.maxResampleMs ?? c.resampleMs, 'Maximum speed-change interval');
    if (c.minResampleMs < 100 || c.maxResampleMs > 60000 || c.minResampleMs > c.maxResampleMs) throw new RangeError('Speed-change intervals must satisfy 100 <= minimum <= maximum <= 60000 ms');
    c.minChunkSize = finite(c.minChunkSize, 'Minimum chunk size'); c.maxChunkSize = finite(c.maxChunkSize, 'Maximum chunk size');
    if (!Number.isInteger(c.minChunkSize) || !Number.isInteger(c.maxChunkSize) || c.minChunkSize < 1 || c.maxChunkSize > 256 || c.minChunkSize > c.maxChunkSize) throw new RangeError('Chunk sizes must satisfy 1 <= minimum <= maximum <= 256');
    c.pauseProbability = finite(c.pauseProbability, 'Pause probability'); c.minPauseMs = finite(c.minPauseMs, 'Minimum pause'); c.maxPauseMs = finite(c.maxPauseMs, 'Maximum pause');
    if (c.pauseProbability < 0 || c.pauseProbability > 1 || c.minPauseMs < 0 || c.maxPauseMs > 60000 || c.minPauseMs > c.maxPauseMs) throw new RangeError('Invalid stochastic pause settings');
    c.minPointerIntervalMs = finite(c.minPointerIntervalMs ?? c.pointerIntervalMs, 'Minimum pointer interval'); c.maxPointerIntervalMs = finite(c.maxPointerIntervalMs ?? c.pointerIntervalMs, 'Maximum pointer interval');
    c.pointerIntervalMs = finite(c.pointerIntervalMs, 'Pointer interval'); if (c.pointerIntervalMs < 250 || c.pointerIntervalMs > 30000) throw new RangeError('Pointer interval must be 250 to 30000 ms');
    if (c.minPointerIntervalMs < 250 || c.maxPointerIntervalMs > 60000 || c.minPointerIntervalMs > c.maxPointerIntervalMs) throw new RangeError('Pointer interval values must satisfy 250 <= minimum <= maximum <= 60000 ms');
    c.pointerAccuracy = finite(c.pointerAccuracy, 'Pointer accuracy');
    if (c.pointerAccuracy < 0 || c.pointerAccuracy > 100) throw new RangeError('Pointer accuracy must be 0 to 100');
    if (!PROFILES.has(c.speedProfile)) throw new RangeError('Unknown speed profile');
    if (!new Set(['synthetic', 'native']).has(c.inputMode)) throw new RangeError('Unknown input mode');
    c.nativeMoveDurationMs = finite(c.nativeMoveDurationMs, 'Native pointer movement duration');
    if (c.nativeMoveDurationMs < 50 || c.nativeMoveDurationMs > 950) throw new RangeError('Native pointer movement duration must be 50 to 950 ms');
    if (!new Set(['editor', 'viewport']).has(c.pointerScope)) throw new RangeError('Unknown pointer scope');
    if (!LANGUAGES.has(c.fallbackLanguage)) throw new RangeError('Unsupported fallback language');
    if (!new Set(['auto', 'cpp', 'java', 'python', 'javascript']).has(c.pageLanguage)) throw new RangeError('Unsupported page language');
    c.maxRetries = finite(c.maxRetries, 'Maximum retries'); if (!Number.isInteger(c.maxRetries) || c.maxRetries < 0 || c.maxRetries > 100) throw new RangeError('Maximum retries must be an integer from 0 to 100');
    for (const key of ['skipRestricted', 'pointerEnabled', 'editorEnabled', 'editorConfirmed', 'pauseWhenHidden', 'autoRetry', 'autoSkip', 'focusMode', 'keepAwake']) c[key] = Boolean(c[key]);
    return c;
  }
  return { DEFAULTS, PROFILES, LANGUAGES, validateConfig };
});
