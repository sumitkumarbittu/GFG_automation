(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  const STATES = Object.freeze({
    IDLE: 'IDLE', STARTING: 'STARTING', RESOLVING: 'RESOLVING', NAVIGATING: 'NAVIGATING',
    WAITING_FOR_EDITOR: 'WAITING_FOR_EDITOR', RUNNING: 'RUNNING', PAUSED: 'PAUSED',
    CLEANING: 'CLEANING', RETRYING: 'RETRYING', COMPLETED: 'COMPLETED', STOPPED: 'STOPPED', ERROR: 'ERROR'
  });
  const TERMINAL_STATES = new Set([STATES.IDLE, STATES.COMPLETED, STATES.STOPPED, STATES.ERROR]);
  const ALLOWED = Object.freeze({
    IDLE: ['STARTING'], STARTING: ['RESOLVING', 'STOPPED', 'ERROR'],
    RESOLVING: ['NAVIGATING', 'COMPLETED', 'STOPPED', 'ERROR'],
    NAVIGATING: ['WAITING_FOR_EDITOR', 'RETRYING', 'PAUSED', 'STOPPED', 'ERROR'],
    WAITING_FOR_EDITOR: ['RUNNING', 'RETRYING', 'PAUSED', 'STOPPED', 'ERROR'],
    RUNNING: ['PAUSED', 'CLEANING', 'RETRYING', 'STOPPED', 'ERROR'],
    PAUSED: ['RUNNING', 'RETRYING', 'CLEANING', 'STOPPED', 'ERROR'],
    CLEANING: ['RESOLVING', 'NAVIGATING', 'PAUSED', 'STOPPED', 'ERROR'],
    RETRYING: ['NAVIGATING', 'WAITING_FOR_EDITOR', 'PAUSED', 'STOPPED', 'ERROR'],
    COMPLETED: ['STARTING', 'IDLE'], STOPPED: ['STARTING', 'IDLE'], ERROR: ['RETRYING', 'STARTING', 'STOPPED', 'IDLE']
  });

  function transition(run, next, patch = {}) {
    if (!ALLOWED[run.state]?.includes(next)) throw new Error(`Invalid state transition ${run.state} -> ${next}`);
    return { ...run, ...patch, state: next, updatedAt: Date.now(), lastAction: patch.lastAction || `${run.state} -> ${next}` };
  }
  function positions(lastCompleted, endInclusive) {
    if (!Number.isInteger(lastCompleted) || !Number.isInteger(endInclusive) || lastCompleted < 0 || endInclusive < lastCompleted) {
      throw new RangeError('Positions must be integers with 0 <= last completed <= end');
    }
    return Array.from({ length: endInclusive - lastCompleted }, (_, i) => lastCompleted + i + 1);
  }
  function filterCatalog(catalog, wantedPositions, skipRestricted) {
    return wantedPositions.map(position => ({ position, problem: catalog[position - 1] || null }))
      .filter(({ problem }) => problem && (!skipRestricted || (problem.available !== false && problem.premium !== true)));
  }
  function hashText(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  function makeRunId(now = Date.now(), random = Math.random()) {
    return `gfg-lab-${now.toString(36)}-${Math.floor(random * 0xffffffff).toString(36)}`;
  }
  function problemSlug(url) { return String(url || '').match(/\/problems\/([^/?#]+)/i)?.[1] || ''; }
  function journalMatchesProblem(journal, problem) { return Boolean(journal && problem && (String(journal.problemId) === String(problem.id) || (problemSlug(journal.problemUrl) && problemSlug(journal.problemUrl) === problemSlug(problem.url)))); }
  function journalAppearsClean(source, journal) { const pos = journal?.insertionPosition, before = journal?.contextBefore || '', after = journal?.contextAfter || ''; return Number.isInteger(pos) && source.slice(Math.max(0, pos - before.length), pos) === before && source.slice(pos, pos + after.length) === after; }
  return { STATES, TERMINAL_STATES, ALLOWED, transition, positions, filterCatalog, hashText, makeRunId, problemSlug, journalMatchesProblem, journalAppearsClean };
});
