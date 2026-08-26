(function (root, factory) {
  const api = factory(root.TraversalLab || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (lab) {
  const RUN_KEY = 'runStateV1', TELEMETRY_KEY = 'telemetryV1', DWELL_ALARM = 'gfg-lab-dwell', NAV_ALARM = 'gfg-lab-navigation';
  const JOURNAL_KEY = 'recoveryJournalV1', QUARANTINE_KEY = 'recoveryJournalQuarantineV1';
  class RunController {
    constructor({ chromeApi = chrome, resolver = new lab.CatalogResolver() } = {}) { this.chrome = chromeApi; this.resolver = resolver; this.run = { state: lab.STATES.IDLE }; }
    async init() {
      this.run = (await this.chrome.storage.local.get(RUN_KEY))[RUN_KEY] || { state: lab.STATES.IDLE, counts: { completed: 0, skipped: 0, failed: 0 } };
      if ([lab.STATES.IDLE, lab.STATES.COMPLETED, lab.STATES.STOPPED, lab.STATES.ERROR, lab.STATES.PAUSED].includes(this.run.state)) return;
      if (!this.run.queue?.length) { this.run = { ...this.run, state: lab.STATES.ERROR, recoverableError: 'Catalog resolution was interrupted. Start the run again.', updatedAt: Date.now(), lastAction: 'Catalog resolution interrupted' }; await this.save(); return; }
      const tab = this.run.tabId ? await this.chrome.tabs.get(this.run.tabId).catch(() => null) : null;
      if (!tab) { this.run = { ...this.run, state: lab.STATES.PAUSED, recoverableError: 'Closed automation tab', updatedAt: Date.now(), lastAction: 'Closed automation tab' }; await this.save(); return; }
      const live = await this.chrome.tabs.sendMessage(tab.id, { type: 'PING_ACTIVE' }).catch(() => null);
      if (live?.active && live.runId === this.run.runId && String(live.problemId) === String(this.current()?.problem?.id)) {
        this.run = { ...this.run, recoverableError: null, updatedAt: Date.now(), lastAction: 'Reconnected after service-worker suspension' };
        await this.save();
        if (this.run.state === lab.STATES.RUNNING && this.run.dwellDeadline) await this.chrome.alarms.create(DWELL_ALARM, { when: Math.max(Date.now() + 250, this.run.dwellDeadline) });
        return;
      }
      this.run = { ...this.run, state: lab.STATES.RETRYING, recoverableError: 'Page session was lost; recovering the current problem before continuing.', updatedAt: Date.now(), lastAction: 'Recovering page session' };
      await this.save();
      const item = this.current();
      try {
        if (item && tab.url?.includes(`/problems/${item.problem.slug}`)) await this.activateCurrentTab(tab.id, true);
        else await this.navigateCurrent(true);
      } catch {
        this.run = { ...this.run, state: lab.STATES.PAUSED, recoverableError: 'Extension was reloaded. Refresh the GFG tab, then use Remove generated block or Resume.', updatedAt: Date.now(), lastAction: 'Waiting for refreshed page scripts' };
        await this.save();
      }
    }
    async save() { await this.chrome.storage.local.set({ [RUN_KEY]: this.run }); }
    status() {
      const remaining = Math.max(0, (this.run.queue?.length || 0) - (this.run.queueIndex || 0));
      return { ...this.run, remaining, remainingDwellMs: this.run.dwellDeadline ? Math.max(0, this.run.dwellDeadline - Date.now()) : (this.run.remainingDwellMs || 0) };
    }
    async setState(next, patch = {}) { this.run = lab.transition(this.run, next, patch); await this.save(); await this.broadcast(); }
    async broadcast() { try { await this.chrome.runtime.sendMessage({ type: 'STATUS', status: this.status() }); } catch {} }
    async start(rawConfig) {
      const config = lab.validateConfig(rawConfig);
      if (config.editorEnabled && !config.editorConfirmed) throw new Error('Explicit editor modification confirmation is required');
      if (![lab.STATES.IDLE, lab.STATES.COMPLETED, lab.STATES.STOPPED, lab.STATES.ERROR].includes(this.run.state)) throw new Error('A run is already active');
      this.run = { state: lab.STATES.IDLE, runId: lab.makeRunId(), config, counts: { completed: 0, skipped: 0, failed: 0 }, queueIndex: 0, startedAt: Date.now(), lastAction: 'Start requested' };
      await this.setState(lab.STATES.STARTING); await this.setState(lab.STATES.RESOLVING, { lastAction: 'Resolving ordered catalog' });
      try {
        let all, source;
        if (config.traversalMode === 'urls') {
          const problems = lab.parseProblemUrls(config.urlList); all = problems.map((problem, index) => ({ position: index + 1, problem })); source = 'user-url-list';
        } else {
          const catalog = await this.resolver.resolve(config.endPosition);
          if (catalog.length < config.endPosition) throw new Error(`Catalog contains only ${catalog.length} positions; requested ${config.endPosition}`);
          all = lab.positions(config.lastCompleted, config.endPosition).map(position => ({ position, problem: catalog[position - 1] })); source = 'locked-explore-snapshot';
        }
        const skipped = config.skipRestricted ? all.filter(x => !x.problem || x.problem.premium || x.problem.available === false).length : 0;
        const queue = config.skipRestricted ? all.filter(x => x.problem && !x.problem.premium && x.problem.available !== false) : all;
        const queueFingerprint = lab.hashText(queue.map(x => `${x.position}:${x.problem.slug}`).join('\n'));
        this.run = { ...this.run, queue, queueSource: source, queueFingerprint, retryCount: 0, counts: { ...this.run.counts, skipped }, totalRequested: all.length };
        if (!queue.length) return this.setState(lab.STATES.COMPLETED, { lastAction: 'No eligible problems in range' });
        await this.save(); await this.navigateCurrent();
      } catch (error) { await this.fail(error.message, false); throw error; }
    }
    current() { return this.run.queue?.[this.run.queueIndex] || null; }
    async ensureTab(url) {
      let tab = this.run.tabId ? await this.chrome.tabs.get(this.run.tabId).catch(() => null) : null;
      if (!tab) { tab = await this.chrome.tabs.create({ url, active: true }); this.run.tabId = tab.id; }
      else await this.chrome.tabs.update(tab.id, { url, active: true });
      return tab;
    }
    async navigateCurrent(recovery = false) {
      const item = this.current(); if (!item) return this.setState(lab.STATES.COMPLETED, { dwellDeadline: null, lastAction: 'Traversal completed' });
      if (this.run.state !== lab.STATES.NAVIGATING) await this.setState(lab.STATES.NAVIGATING, { current: item, recoverableError: recovery ? this.run.recoverableError : null, lastAction: `Navigating to position ${item.position}` });
      await this.ensureTab(item.problem.url);
      await this.chrome.alarms.create(NAV_ALARM, { when: Date.now() + 45000 }); await this.save();
    }
    async pageReady(tabId, page) {
      if (tabId !== this.run.tabId || lab.TERMINAL_STATES.has(this.run.state) || this.run.state === lab.STATES.PAUSED) return;
      if (page.failure && page.failure !== 'Unsupported page') return this.fail(page.failure, true);
      const item = this.current(); if (!item || !page.url.includes(`/problems/${item.problem.slug}`)) return;
      const live = await this.chrome.tabs.sendMessage(tabId, { type: 'PING_ACTIVE' }).catch(() => null);
      if (live?.active && live.runId === this.run.runId) return;
      await this.activateCurrentTab(tabId, this.run.state !== lab.STATES.NAVIGATING);
    }
    async activateCurrentTab(tabId, recovery = false) {
      const item = this.current(); if (!item) return;
      await this.chrome.alarms.clear(NAV_ALARM);
      const deadline = this.run.dwellDeadline && this.run.dwellDeadline > Date.now() ? this.run.dwellDeadline : Date.now() + this.run.config.minutesPerQuestion * 60000;
      if (this.run.state !== lab.STATES.WAITING_FOR_EDITOR) {
        this.run = { ...this.run, state: lab.STATES.WAITING_FOR_EDITOR, dwellDeadline: deadline, updatedAt: Date.now(), lastAction: recovery ? 'Recovering editor session' : 'Waiting for a supported editor' };
        await this.save(); await this.broadcast();
      }
      await this.chrome.tabs.sendMessage(tabId, { type: 'START_PROBLEM', runId: this.run.runId, problem: item.problem, position: item.position, config: this.run.config, dwellDeadline: deadline });
    }
    async contentRunning(details) {
      if (this.run.state !== lab.STATES.WAITING_FOR_EDITOR) return;
      await this.setState(lab.STATES.RUNNING, { language: details.language, editorType: details.editorType, recoverableError: null, lastAction: 'Synthetic editor simulation running' });
      await this.chrome.alarms.create(DWELL_ALARM, { when: this.run.dwellDeadline });
    }
    async contentPhase(phase) { if (this.run.state !== lab.STATES.WAITING_FOR_EDITOR) return; this.run = { ...this.run, lastAction: String(phase || 'Preparing editor'), updatedAt: Date.now() }; await this.save(); await this.broadcast(); }
    async pause(reason = 'Paused by user') {
      if (![lab.STATES.RUNNING, lab.STATES.WAITING_FOR_EDITOR, lab.STATES.NAVIGATING, lab.STATES.RETRYING, lab.STATES.CLEANING].includes(this.run.state)) return;
      await this.chrome.alarms.clear(DWELL_ALARM); await this.chrome.alarms.clear(NAV_ALARM);
      this.run.remainingDwellMs = this.run.dwellDeadline ? Math.max(0, this.run.dwellDeadline - Date.now()) : 0;
      try { await this.chrome.tabs.sendMessage(this.run.tabId, { type: 'PAUSE' }); } catch {}
      await this.setState(lab.STATES.PAUSED, { recoverableError: reason, lastAction: reason });
    }
    async resume() {
      if (this.run.state !== lab.STATES.PAUSED) throw new Error('Run is not paused');
      const deadline = Date.now() + Math.max(1000, this.run.remainingDwellMs || this.run.config.minutesPerQuestion * 60000);
      this.run.dwellDeadline = deadline;
      const live = await this.chrome.tabs.sendMessage(this.run.tabId, { type: 'PING_ACTIVE' }).catch(() => null);
      if (!live?.active || live.runId !== this.run.runId) { await this.setState(lab.STATES.RETRYING, { recoverableError: null, lastAction: 'Recovering page session before resume' }); return this.activateCurrentTab(this.run.tabId, true); }
      await this.setState(lab.STATES.RUNNING, { recoverableError: null, lastAction: 'Run resumed' });
      await this.chrome.tabs.sendMessage(this.run.tabId, { type: 'RESUME', dwellDeadline: deadline }); await this.chrome.alarms.create(DWELL_ALARM, { when: deadline });
    }
    async requestCleanup(action = 'advance', force = false) {
      if (![lab.STATES.RUNNING, lab.STATES.PAUSED, lab.STATES.WAITING_FOR_EDITOR, lab.STATES.RETRYING].includes(this.run.state)) return;
      await this.chrome.alarms.clear(DWELL_ALARM); await this.setState(lab.STATES.CLEANING, { pendingCleanupAction: action, lastAction: force ? 'Forced cleanup requested' : 'Verifying generated range cleanup' });
      const item = this.current();
      try { await this.chrome.tabs.sendMessage(this.run.tabId, { type: 'CLEANUP', force, runId: this.run.runId, problem: item?.problem, position: item?.position, config: this.run.config }); }
      catch { await this.fail('Closed automation tab', true); }
    }
    async cleanupDone(result) {
      if (this.run.state !== lab.STATES.CLEANING) return;
      if (!result.ok) return this.pause(result.reason || 'Cleanup failed');
      if (result.telemetry) await this.appendTelemetry(result.telemetry);
      const action = this.run.pendingCleanupAction;
      if (action === 'remove') return this.setState(lab.STATES.PAUSED, { recoverableError: null, lastAction: 'Generated block removed and verified' });
      if (action === 'retry') { await this.setState(lab.STATES.NAVIGATING, { dwellDeadline: null, lastAction: 'Retrying current problem' }); return this.navigateCurrent(); }
      this.run.counts[action === 'skip' ? 'skipped' : 'completed']++;
      this.run.queueIndex++; this.run.retryCount = 0; this.run.dwellDeadline = null; await this.setState(lab.STATES.RESOLVING, { lastAction: action === 'skip' ? 'Problem skipped after cleanup' : 'Problem completed after cleanup' }); await this.navigateCurrent();
    }
    async retry() { return this.requestCleanup('retry'); }
    async repairRecovery() {
      if (this.run.state !== lab.STATES.PAUSED || !/recovery-journal mismatch/i.test(this.run.recoverableError || '')) throw new Error('Recovery repair is only available for a journal mismatch');
      const journal = (await this.chrome.storage.local.get(JOURNAL_KEY))[JOURNAL_KEY], current = this.current()?.problem;
      if (journal && lab.journalMatchesProblem(journal, current)) throw new Error('The journal belongs to the current problem. Use Remove generated block so cleanup remains verifiable.');
      if (journal) { const stored = await this.chrome.storage.local.get(QUARANTINE_KEY), rows = stored[QUARANTINE_KEY] || []; rows.push({ ...journal, quarantineReason: 'Explicit mismatch repair', quarantinedAt: Date.now() }); await this.chrome.storage.local.set({ [QUARANTINE_KEY]: rows.slice(-20) }); await this.chrome.storage.local.remove(JOURNAL_KEY); }
      this.run.config = { ...this.run.config, pageLanguage: this.run.config?.pageLanguage || this.run.config?.fallbackLanguage || 'cpp' };
      await this.setState(lab.STATES.RETRYING, { recoverableError: null, dwellDeadline: null, lastAction: 'Stale recovery journal quarantined' }); await this.navigateCurrent(true);
    }
    async stop() { await this.chrome.alarms.clear(DWELL_ALARM); await this.chrome.alarms.clear(NAV_ALARM); try { await this.chrome.tabs.sendMessage(this.run.tabId, { type: 'STOP' }); } catch {} await this.setState(lab.STATES.STOPPED, { dwellDeadline: null, lastAction: 'Run stopped; editor content preserved' }); }
    async fail(reason, recoverable = true) {
      this.run.counts = this.run.counts || { completed: 0, skipped: 0, failed: 0 }; this.run.counts.failed++;
      const hard = /CAPTCHA|verification|Authentication|Closed automation tab|recovery-journal mismatch/i.test(reason);
      if (recoverable && !hard && this.run.config?.autoRetry && ![lab.STATES.IDLE, lab.STATES.ERROR, lab.STATES.CLEANING].includes(this.run.state)) {
        const retryCount = (this.run.retryCount || 0) + 1, exhausted = retryCount > this.run.config.maxRetries;
        this.run.retryCount = retryCount; await this.save();
        if (!exhausted || this.run.config.autoSkip) {
          const action = exhausted ? 'skip' : 'retry';
          await this.requestCleanup(action, false);
          this.run.lastAction = exhausted ? `Retries exhausted; automatically skipping (${reason})` : `Automatic retry ${retryCount}/${this.run.config.maxRetries} (${reason})`;
          await this.save(); await this.broadcast(); return;
        }
      }
      if (recoverable && this.run.state === lab.STATES.PAUSED) { this.run = { ...this.run, recoverableError: reason, updatedAt: Date.now(), lastAction: reason }; await this.save(); await this.broadcast(); }
      else if (recoverable && ![lab.STATES.IDLE, lab.STATES.ERROR].includes(this.run.state)) await this.pause(reason);
      else { this.run = { ...this.run, state: lab.STATES.ERROR, recoverableError: reason, updatedAt: Date.now(), lastAction: reason }; await this.save(); await this.broadcast(); }
    }
    async appendTelemetry(record) { const data = await this.chrome.storage.local.get(TELEMETRY_KEY), rows = data[TELEMETRY_KEY] || []; rows.push(record); await this.chrome.storage.local.set({ [TELEMETRY_KEY]: rows }); }
    async telemetry() { return (await this.chrome.storage.local.get(TELEMETRY_KEY))[TELEMETRY_KEY] || []; }
  }
  return { RUN_KEY, TELEMETRY_KEY, DWELL_ALARM, NAV_ALARM, JOURNAL_KEY, QUARANTINE_KEY, RunController };
});
