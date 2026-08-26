(function () {
  const lab = globalThis.TraversalLab;
  const JOURNAL_KEY = 'recoveryJournalV1';
  const QUARANTINE_KEY = 'recoveryJournalQuarantineV1';
  let active = null;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = message => chrome.runtime.sendMessage(message).catch(() => null);
  function pageFailure() {
    const text = `${document.title}\n${document.body?.innerText?.slice(0, 10000) || ''}`;
    if (/captcha|verify you are human|cloudflare/i.test(text)) return 'CAPTCHA or verification page';
    if (/too many requests|rate limit|error 429/i.test(text)) return 'Rate limiting';
    if (/\/login|sign in to continue|login to continue/i.test(location.href + text)) return 'Authentication requirement';
    if (!/\/problems\//i.test(location.pathname)) return 'Unsupported page';
    if (/premium problem|subscribe to unlock (?:this|the) problem|upgrade to access (?:this|the) problem|problem is locked/i.test(text)) return 'Premium problem';
    if (/page not found|problem (?:is )?(?:not available|deleted)/i.test(text)) return 'Unavailable problem';
    return '';
  }
  async function detectEditor(bridge, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs; let last;
    while (Date.now() < deadline) { try { return await bridge.detect(active.config.fallbackLanguage); } catch (error) { last = error; await delay(500); } }
    throw new Error(last?.message === 'Unsupported editor' ? 'Unsupported editor' : 'Editor loading timeout');
  }
  function editorElement(type) { return document.querySelector(type === 'monaco' ? '.monaco-editor' : type === 'ace' ? '.ace_editor' : type === 'codemirror' ? '.CodeMirror' : 'textarea'); }
  async function persistJournal() {
    if (!active?.journal) return;
    active.journal.generatedContent = active.generated;
    active.journal.lastUpdateTimestamp = Date.now();
    await chrome.storage.local.set({ [JOURNAL_KEY]: active.journal });
  }
  async function quarantineJournal(journal, reason) {
    const stored = await chrome.storage.local.get(QUARANTINE_KEY), rows = stored[QUARANTINE_KEY] || [];
    rows.push({ ...journal, quarantineReason: reason, quarantinedAt: Date.now() });
    await chrome.storage.local.set({ [QUARANTINE_KEY]: rows.slice(-20) }); await chrome.storage.local.remove(JOURNAL_KEY);
  }
  async function recoverPrevious(bridge, detected, runId, problem) {
    const journal = (await chrome.storage.local.get(JOURNAL_KEY))[JOURNAL_KEY];
    if (!journal) {
      const legacy = lab.findLegacyMarkerRange(detected.source); if (!legacy) return detected;
      await bridge.removeRange(legacy.start, legacy.end); return bridge.detect(active.config.fallbackLanguage);
    }
    if (!lab.journalMatchesProblem(journal, problem)) { await quarantineJournal(journal, 'Journal belongs to a different problem'); return detected; }
    const range = lab.resolveGeneratedRange(detected.source, journal);
    if (!range && lab.journalAppearsClean(detected.source, journal)) { await quarantineJournal(journal, 'Generated content was already absent'); return detected; }
    if (!range) throw new Error('Recovery-journal mismatch on the current problem');
    await bridge.removeRange(range.start, range.end);
    const after = await bridge.detect(active.config.fallbackLanguage);
    if (after.source.slice(range.start, range.start + journal.generatedContent.length) === journal.generatedContent) throw new Error('Recovery-journal cleanup failed');
    await chrome.storage.local.remove(JOURNAL_KEY);
    return after;
  }
  function baseTelemetry(message, language) {
    return { label: 'synthetic', runId: message.runId, problemId: message.problem.id, problemUrl: message.problem.url, language, startTimestamp: new Date().toISOString(), finishTimestamp: null, configuredMinCps: message.config.minCps, configuredMaxCps: message.config.maxCps, speedProfile: message.config.speedProfile, resamplingInterval: message.config.resampleMs, replaySeed: message.config.replaySeed || null, charactersPerElapsedSecond: [], targetCpsSamples: [], totalCharacters: 0, pointerMovementInterval: message.config.pointerIntervalMs, pointerAccuracy: message.config.pointerAccuracy, normalizedPointerCoordinates: [], pauseResumeEvents: [], cleanupResult: null, failureReason: null };
  }
  async function startProblem(message) {
    if (active) await stopLocal(false);
    const failure = pageFailure(); if (failure) return send({ type: 'CONTENT_ERROR', reason: failure });
    active = { ...message, bridge: new lab.EditorBridge(), generated: '', paused: false, stopped: false };
    try {
      if (!message.config.editorEnabled) {
        active.telemetry = baseTelemetry(message, 'none');
        await send({ type: 'CONTENT_RUNNING', details: { language: 'none', editorType: 'disabled' } }); return;
      }
      let detected = await detectEditor(active.bridge); detected = await recoverPrevious(active.bridge, detected, message.runId, message.problem);
      if (message.config.pageLanguage && message.config.pageLanguage !== 'auto') { await active.bridge.setPageLanguage(message.config.pageLanguage); await delay(800); detected = await detectEditor(active.bridge); }
      const language = lab.normalizeLanguage(detected.language) || message.config.fallbackLanguage;
      if (!lab.LANGUAGES.has(language)) throw new Error('Unsupported language');
      const plan = lab.planInsertion(detected.source, language), raw = lab.generateProgram(language, detected.source, message.position), prepared = lab.insertGenerated(detected.source, plan, raw);
      const context = lab.contextFor(detected.source, plan.index);
      active.language = language; active.detected = detected; active.plan = plan; active.fullGenerated = prepared.generated; active.telemetry = baseTelemetry(message, language);
      active.journal = { runId: message.runId, problemId: message.problem.id, problemUrl: message.problem.url, language, generatedContent: '', insertionPosition: plan.index, contextBefore: context.before, contextAfter: context.after, maximumUnsavedTailAllowance: 512, lastUpdateTimestamp: Date.now() };
      await active.bridge.begin(plan.index, `${message.runId}:${message.problem.id}`); await persistJournal();
      active.journalTimer = setInterval(persistJournal, 2000);
      active.scheduler = new lab.TypingScheduler({ text: prepared.generated, write: async chunk => { const result = await active.bridge.insert(chunk); active.generated = result.text; active.telemetry.totalCharacters = active.generated.length; }, minCps: message.config.minCps, maxCps: message.config.maxCps, profile: message.config.speedProfile, resampleMs: message.config.resampleMs, seed: message.config.replaySeed || `${message.runId}:${message.problem.id}`, pauseWhenHidden: message.config.pauseWhenHidden, onSample: sample => { active.telemetry.targetCpsSamples.push(sample); send({ type: 'TARGET_CPS', cps: sample.cps }); }, onSecond: row => active.telemetry.charactersPerElapsedSecond.push(row), onError: error => { active.pointer?.stop(); send({ type: 'CONTENT_ERROR', reason: `Editor write failed: ${error.message}` }); } });
      if (message.config.pointerEnabled) { active.pointer = new lab.PointerSimulator({ editorElement: editorElement(detected.type), intervalMs: message.config.pointerIntervalMs, accuracy: message.config.pointerAccuracy, onMove: p => active.telemetry.normalizedPointerCoordinates.push(p) }); active.pointer.start(); }
      active.scheduler.start();
      await send({ type: 'CONTENT_RUNNING', details: { language, editorType: detected.type } });
    } catch (error) { if (active?.telemetry) active.telemetry.failureReason = error.message; active?.pointer?.stop(); active?.scheduler?.pause(); await send({ type: 'CONTENT_ERROR', reason: error.message }); }
  }
  async function pauseLocal() { if (!active) return; active.paused = true; active.scheduler?.pause(); active.pointer?.stop(); active.telemetry?.pauseResumeEvents.push({ type: 'pause', at: Date.now() }); await persistJournal(); }
  async function resumeLocal() { if (!active) return; active.paused = false; active.scheduler?.resume(); if (active.config.pointerEnabled && active.pointer) active.pointer.start(); active.telemetry?.pauseResumeEvents.push({ type: 'resume', at: Date.now() }); }
  async function cleanup(force) {
    if (!active) throw new Error('No live editor session');
    active.pointer?.stop(); if (active.journalTimer) clearInterval(active.journalTimer); await active.scheduler?.stop(); await persistJournal();
    try {
      if (active.config.editorEnabled) {
        const inspection = await active.bridge.inspect();
        if (inspection.current !== active.generated && !force) throw new Error('External modification inside the generated range');
        const before = inspection.source;
        let expectedAfter;
        if (inspection.current === active.generated) { expectedAfter = before.slice(0, inspection.start) + before.slice(inspection.end); await active.bridge.remove(false); }
        else {
          const result = lab.removeGenerated(before, active.journal, true); if (!result.ok) throw new Error(result.reason);
          expectedAfter = result.source;
          await active.bridge.removeRange(result.position, result.position + (before.length - result.source.length));
        }
        let after = await active.bridge.detect(active.config.fallbackLanguage);
        if (after.source !== expectedAfter) throw new Error('Cleanup verification failed');
        const remnants = lab.findKnownSyntheticRemnantRanges(after.source);
        if (remnants.length) {
          for (const range of [...remnants].reverse()) { await active.bridge.removeRange(range.start, range.end); expectedAfter = expectedAfter.slice(0, range.start) + expectedAfter.slice(range.end); }
          after = await active.bridge.detect(active.config.fallbackLanguage);
          if (after.source !== expectedAfter || lab.findKnownSyntheticRemnantRanges(after.source).length) throw new Error('Orphaned generated-block cleanup failed');
        }
      }
      await chrome.storage.local.remove(JOURNAL_KEY);
      active.telemetry.finishTimestamp = new Date().toISOString(); active.telemetry.cleanupResult = force ? 'forced-verified' : 'exact-verified';
      const telemetry = active.telemetry; active = null; await send({ type: 'CLEANUP_DONE', result: { ok: true, telemetry } });
    } catch (error) { active.telemetry.failureReason = error.message; active.telemetry.cleanupResult = 'refused'; await send({ type: 'CLEANUP_DONE', result: { ok: false, reason: error.message } }); }
  }
  async function cleanupDetached(message) {
    const bridge = new lab.EditorBridge(); active = { ...message, bridge, generated: '', paused: true, stopped: false, config: message.config || lab.DEFAULTS };
    try {
      let detected = await detectEditor(bridge); detected = await recoverPrevious(bridge, detected, message.runId, message.problem);
      let expected = detected.source; const remnants = lab.findKnownSyntheticRemnantRanges(expected);
      for (const range of [...remnants].reverse()) { await bridge.removeRange(range.start, range.end); expected = expected.slice(0, range.start) + expected.slice(range.end); }
      const after = await bridge.detect(active.config.fallbackLanguage);
      if (after.source !== expected || lab.findKnownSyntheticRemnantRanges(after.source).length) throw new Error('Detached cleanup verification failed');
      await chrome.storage.local.remove(JOURNAL_KEY); active = null; await send({ type: 'CLEANUP_DONE', result: { ok: true } });
    } catch (error) { active = null; await send({ type: 'CLEANUP_DONE', result: { ok: false, reason: error.message } }); }
  }
  async function stopLocal(notify = true) { if (!active) return; active.pointer?.stop(); active.scheduler?.pause(); if (active.journalTimer) clearInterval(active.journalTimer); await persistJournal(); active.stopped = true; if (notify) active = null; }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'PING_ACTIVE') { respond({ active: Boolean(active && !active.stopped), runId: active?.runId, problemId: active?.problem?.id, generatedLength: active?.generated?.length || 0 }); return false; }
    const work = message.type === 'START_PROBLEM' ? startProblem(message) : message.type === 'PAUSE' ? pauseLocal() : message.type === 'RESUME' ? resumeLocal() : message.type === 'CLEANUP' ? (active ? cleanup(Boolean(message.force)) : cleanupDetached(message)) : message.type === 'STOP' ? stopLocal() : Promise.resolve();
    work.then(() => respond({ ok: true })).catch(error => respond({ ok: false, error: error.message })); return true;
  });
  send({ type: 'PAGE_READY', page: { url: location.href, title: document.title, failure: pageFailure() } });
})();
