(function () {
  const lab = globalThis.TraversalLab;
  const JOURNAL_KEY = 'recoveryJournalV1';
  const QUARANTINE_KEY = 'recoveryJournalQuarantineV1';
  let active = null;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = message => chrome.runtime.sendMessage(message).catch(() => null);
  async function nativeCommand(command) {
    if (document.visibilityState !== 'visible') throw new Error('Native input paused because the GFG tab is hidden');
    const result = await chrome.runtime.sendMessage({ type: 'NATIVE_COMMAND', command });
    if (result?.error) throw new Error(result.error);
    if (!result) throw new Error('Native companion did not respond');
    return result;
  }
  function detectUserActivity(event) {
    if (!active || active.config?.inputMode !== 'native' || active.paused || active.userPauseRequested || !event.isTrusted) return;
    const expected = event.type === 'keydown' ? active.nativeTyping : event.type === 'mousemove' ? active.nativePointerMoving : false;
    if (expected) return;
    active.userPauseRequested = true; send({ type: 'USER_ACTIVITY' });
  }
  document.addEventListener('keydown', detectUserActivity, true);
  document.addEventListener('mousemove', detectUserActivity, true);
  document.addEventListener('mousedown', detectUserActivity, true);
  document.addEventListener('pointerdown', detectUserActivity, true);
  document.addEventListener('focusin', event => {
    if (!active?.waitingForNativeFocus || !active.editorElement?.contains(event.target) || !document.hasFocus()) return;
    active.waitingForNativeFocus = false; send({ type: 'NATIVE_FOCUS_READY' });
  }, true);
  function requireNativeEditorFocus() {
    if (!active || active.config?.inputMode !== 'native' || active.waitingForNativeFocus) return;
    active.paused = true; active.waitingForNativeFocus = true; active.scheduler?.pause(); active.pointer?.stop(); send({ type: 'NATIVE_FOCUS_REQUIRED' });
  }
  window.addEventListener('blur', () => { if (active && !active.paused && active.config?.inputMode === 'native') requireNativeEditorFocus(); });
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
  function visibleProblemContext() { const heading = document.querySelector('h1,h2,[class*="problem"] h3')?.textContent || document.title; const body = document.querySelector('[class*="problem-statement"],[class*="problemStatement"],main')?.textContent || ''; return `${heading}\n${body.slice(0, 2500)}`; }
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
  async function removeKnownRemnants(bridge, detected) {
    let expected = detected.source, ranges = lab.findKnownSyntheticRemnantRanges(expected);
    if (!ranges.length) return detected;
    await send({ type: 'CONTENT_PHASE', phase: `Restoring ${ranges.length} orphaned generated block${ranges.length === 1 ? '' : 's'}` });
    for (const range of [...ranges].reverse()) { await bridge.removeRange(range.start, range.end); expected = expected.slice(0, range.start) + expected.slice(range.end); }
    const after = await bridge.detect(active.config.fallbackLanguage); ranges = lab.findKnownSyntheticRemnantRanges(after.source);
    if (after.source !== expected || ranges.length) throw new Error('Orphaned generated-block cleanup failed');
    return after;
  }
  function baseTelemetry(message, language) {
    return { label: 'synthetic', inputMode: message.config.inputMode || 'synthetic', runId: message.runId, problemId: message.problem.id, problemUrl: message.problem.url, language, startTimestamp: new Date().toISOString(), finishTimestamp: null, configuredMinCps: message.config.minCps, configuredMaxCps: message.config.maxCps, speedProfile: message.config.speedProfile, speedChangeIntervalRange: [message.config.minResampleMs, message.config.maxResampleMs], replaySeed: message.config.replaySeed || null, charactersPerElapsedSecond: [], targetCpsSamples: [], generatedBlocks: [], totalCharacters: 0, pointerMovementIntervalRange: [message.config.minPointerIntervalMs, message.config.maxPointerIntervalMs], pointerAccuracy: message.config.pointerAccuracy, pointerScope: message.config.pointerScope, normalizedPointerCoordinates: [], pauseResumeEvents: [], wakeLockStates: [], cleanupResult: null, failureReason: null };
  }
  async function startProblem(message) {
    if (active) await stopLocal(false);
    const failure = pageFailure(); if (failure) return send({ type: 'CONTENT_ERROR', reason: failure });
    active = { ...message, bridge: new lab.EditorBridge(), generated: '', paused: false, stopped: false, telemetry: baseTelemetry(message, 'pending') };
    try {
      await send({ type: 'CONTENT_PHASE', phase: 'Detecting the GFG editor' });
      active.wakeLock = new lab.ScreenWakeLock(state => { active?.telemetry?.wakeLockStates.push({ at: Date.now(), state }); send({ type: 'RUNTIME_AID_STATUS', wakeLock: state }); });
      if (!message.config.editorEnabled) {
        active.telemetry = baseTelemetry(message, 'none');
        if (message.config.keepAwake) await active.wakeLock.acquire();
        await send({ type: 'CONTENT_RUNNING', details: { language: 'none', editorType: 'disabled' } }); return;
      }
      let detected = await detectEditor(active.bridge); await send({ type: 'CONTENT_PHASE', phase: `Found ${detected.type}; checking recovery state` }); detected = await recoverPrevious(active.bridge, detected, message.runId, message.problem); detected = await removeKnownRemnants(active.bridge, detected);
      if (message.config.pageLanguage && message.config.pageLanguage !== 'auto') { await send({ type: 'CONTENT_PHASE', phase: `Confirming ${message.config.pageLanguage} editor language` }); await active.bridge.setPageLanguage(message.config.pageLanguage); await delay(800); detected = await detectEditor(active.bridge); }
      const language = lab.normalizeLanguage(detected.language) || message.config.fallbackLanguage;
      if (!lab.LANGUAGES.has(language)) throw new Error('Unsupported language');
      const plan = lab.planInsertion(detected.source, language);
      await send({ type: 'CONTENT_PHASE', phase: 'Preparing continuous editor session' });
      const context = lab.contextFor(detected.source, plan.index);
      active.language = language; active.detected = detected; active.plan = plan; active.telemetry = baseTelemetry(message, language);
      active.journal = { runId: message.runId, problemId: message.problem.id, problemUrl: message.problem.url, language, generatedContent: '', insertionPosition: plan.index, contextBefore: context.before, contextAfter: context.after, maximumUnsavedTailAllowance: 2000000, originalSourceHash: lab.hashText(detected.source), lastUpdateTimestamp: Date.now() };
      await active.bridge.begin(plan.index, `${message.runId}:${message.problem.id}`); active.begun = true; await persistJournal();
      active.journalTimer = setInterval(persistJournal, 2000);
      const seed = message.config.replaySeed || `${message.runId}:${message.problem.id}`, random = lab.seededRandom(seed + ':pointer');
      const problemContext = visibleProblemContext(); active.telemetry.contextKind = lab.contextKind(problemContext);
      const nativeMode = message.config.inputMode === 'native';
      const write = nativeMode ? async chunk => {
        if (!document.hasFocus()) { active.nativeDeferredChunk = chunk; requireNativeEditorFocus(); return; }
        if (active.nativeAutoConsumed?.startsWith(chunk)) { active.nativeAutoConsumed = active.nativeAutoConsumed.slice(chunk.length); return; }
        if (active.nativeAutoConsumed) active.nativeAutoConsumed = '';
        const prepared = await active.bridge.prepareNative(chunk);
        active.nativeTyping = true;
        let commandError = null;
        try { await nativeCommand(prepared.operation === 'advance' ? { action: 'type', key: 'ArrowRight' } : { action: 'type', text: chunk }); }
        catch (error) { commandError = error; }
        finally { if (active) active.nativeTyping = false; }
        if (commandError && prepared.operation === 'advance') { await active.bridge.cancelNative().catch(() => {}); throw commandError; }
        let result;
        try { result = await active.bridge.commitNative(chunk); }
        catch (verificationError) { await active.bridge.cancelNative().catch(() => {}); throw new Error(commandError ? `${commandError.message}; ${verificationError.message}` : verificationError.message); }
        active.nativeAutoConsumed = result.autoConsumed || ''; active.generated = result.text; active.telemetry.totalCharacters = active.generated.length;
        if (result.unexpected) throw new Error(commandError ? `${commandError.message}; native editor transformed the typed character unexpectedly` : 'Native editor transformed the typed character unexpectedly');
      } : async chunk => { const result = await active.bridge.insert(chunk); active.generated = result.text; active.telemetry.totalCharacters = active.generated.length; }; active.nativeWrite = nativeMode ? write : null;
      active.scheduler = new lab.TypingScheduler({ nextText: block => { const raw = lab.generateContextSnippet(language, detected.source, message.position * 97 + block * 17, problemContext); return lab.insertGenerated('', { index: 0, indent: plan.indent }, raw).generated; }, write, minCps: message.config.minCps, maxCps: message.config.maxCps, profile: message.config.speedProfile, minResampleMs: message.config.minResampleMs, maxResampleMs: message.config.maxResampleMs, minChunkSize: nativeMode ? 1 : message.config.minChunkSize, maxChunkSize: nativeMode ? 1 : message.config.maxChunkSize, pauseProbability: message.config.pauseProbability, minPauseMs: message.config.minPauseMs, maxPauseMs: message.config.maxPauseMs, seed, pauseWhenHidden: nativeMode || message.config.pauseWhenHidden, onSample: sample => { active.telemetry.targetCpsSamples.push(sample); send({ type: 'TARGET_CPS', cps: sample.cps }); }, onSecond: row => active.telemetry.charactersPerElapsedSecond.push(row), onBlock: row => active.telemetry.generatedBlocks.push(row), onError: error => { active.pointer?.stop(); nativeCommand({ action: 'stop' }).catch(() => {}); send({ type: 'CONTENT_ERROR', reason: `Editor write failed: ${error.message}` }); } });
      const element = editorElement(detected.type); active.editorElement = element; if (message.config.focusMode) { active.focusMode = new lab.EditorFocusMode(element); active.focusMode.start(); }
      if (message.config.keepAwake) await active.wakeLock.acquire();
      if (message.config.pointerEnabled) active.pointer = new lab.PointerSimulator({ editorElement: element, minIntervalMs: message.config.minPointerIntervalMs, maxIntervalMs: message.config.maxPointerIntervalMs, accuracy: message.config.pointerAccuracy, scope: message.config.pointerScope, random, nativeDurationMs: message.config.nativeMoveDurationMs, nativeMove: nativeMode ? async p => { active.nativePointerMoving = true; try { return await nativeCommand({ action: 'move', x: p.x, y: p.y, durationMs: p.durationMs, steps: Math.max(2, Math.round(p.durationMs / 16)) }); } catch (error) { send({ type: 'CONTENT_ERROR', reason: `Native pointer failed: ${error.message}` }); throw error; } finally { if (active) active.nativePointerMoving = false; } } : null, onMove: p => active.telemetry.normalizedPointerCoordinates.push(p) });
      await send({ type: 'CONTENT_RUNNING', details: { language, editorType: detected.type } });
      if (nativeMode && !document.hasFocus()) { requireNativeEditorFocus(); return; }
      active.pointer?.start(); active.scheduler.start();
    } catch (error) { if (active?.telemetry) active.telemetry.failureReason = error.message; active?.pointer?.stop(); active?.scheduler?.pause(); await send({ type: 'CONTENT_ERROR', reason: error.message }); }
  }
  async function pauseLocal() { if (!active) return; active.paused = true; active.scheduler?.pause(); active.pointer?.stop(); if (active.config.inputMode === 'native') await nativeCommand({ action: 'stop' }).catch(() => {}); active.telemetry?.pauseResumeEvents.push({ type: 'pause', at: Date.now() }); await persistJournal(); }
  async function resumeLocal() { if (!active) return; if (active.config.inputMode === 'native' && !document.hasFocus()) { requireNativeEditorFocus(); return; } active.paused = false; active.waitingForNativeFocus = false; active.userPauseRequested = false; if (active.nativeDeferredChunk) { const chunk = active.nativeDeferredChunk; active.nativeDeferredChunk = ''; await active.nativeWrite(chunk); } active.scheduler?.resume(); if (active.config.pointerEnabled && active.pointer) active.pointer.start(); active.telemetry?.pauseResumeEvents.push({ type: 'resume', at: Date.now() }); }
  async function cleanup(force) {
    if (!active) throw new Error('No live editor session');
    active.pointer?.stop(); if (active.config.inputMode === 'native') await nativeCommand({ action: 'stop' }).catch(() => {}); if (active.journalTimer) clearInterval(active.journalTimer); await active.scheduler?.stop(); await persistJournal();
    try {
      if (active.config.editorEnabled && !active.begun) {
        let detected = await detectEditor(active.bridge); detected = await recoverPrevious(active.bridge, detected, active.runId, active.problem); await removeKnownRemnants(active.bridge, detected);
      } else if (active.config.editorEnabled && active.begun) {
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
      active.focusMode?.stop(); await active.wakeLock?.release(); const telemetry = active.telemetry; active = null; await send({ type: 'CLEANUP_DONE', result: { ok: true, telemetry } });
    } catch (error) { active.focusMode?.stop(); await active.wakeLock?.release(); active.telemetry.failureReason = error.message; active.telemetry.cleanupResult = 'refused'; await send({ type: 'CLEANUP_DONE', result: { ok: false, reason: error.message } }); }
  }
  async function cleanupDetached(message) {
    const bridge = new lab.EditorBridge(); active = { ...message, bridge, generated: '', paused: true, stopped: false, config: message.config || lab.DEFAULTS };
    try {
      let detected = await detectEditor(bridge); detected = await recoverPrevious(bridge, detected, message.runId, message.problem); await removeKnownRemnants(bridge, detected);
      await chrome.storage.local.remove(JOURNAL_KEY); active = null; await send({ type: 'CLEANUP_DONE', result: { ok: true } });
    } catch (error) { active = null; await send({ type: 'CLEANUP_DONE', result: { ok: false, reason: error.message } }); }
  }
  async function stopLocal(notify = true) { if (!active) return; active.pointer?.stop(); active.scheduler?.pause(); if (active.config.inputMode === 'native') await nativeCommand({ action: 'stop' }).catch(() => {}); if (active.journalTimer) clearInterval(active.journalTimer); await persistJournal(); active.focusMode?.stop(); await active.wakeLock?.release(); active.stopped = true; if (notify) active = null; }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'PING_ACTIVE') { respond({ active: Boolean(active && !active.stopped), runId: active?.runId, problemId: active?.problem?.id, generatedLength: active?.generated?.length || 0 }); return false; }
    const work = message.type === 'START_PROBLEM' ? startProblem(message) : message.type === 'PAUSE' ? pauseLocal() : message.type === 'RESUME' ? resumeLocal() : message.type === 'CLEANUP' ? (active ? cleanup(Boolean(message.force)) : cleanupDetached(message)) : message.type === 'STOP' ? stopLocal() : Promise.resolve();
    work.then(() => respond({ ok: true })).catch(error => respond({ ok: false, error: error.message })); return true;
  });
  send({ type: 'PAGE_READY', page: { url: location.href, title: document.title, failure: pageFailure() } });
})();
