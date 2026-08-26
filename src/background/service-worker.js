importScripts('../shared/core.js', '../shared/validation.js', 'catalog-resolver.js', 'native-host.js', 'run-controller.js');
const controller = new TraversalLab.RunController();
const nativeHost = new TraversalLab.NativeHostClient({ chromeApi: chrome });
const ready = controller.init();

chrome.action.onClicked.addListener(tab => chrome.sidePanel.open({ tabId: tab.id }).catch(() => {}));
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ready;
    switch (message.type) {
      case 'GET_STATUS': return controller.status();
      case 'START':
        if (message.config?.inputMode === 'native') await nativeHost.probe();
        await controller.start(message.config); return controller.status();
      case 'PAUSE_RUN': await controller.pause(); return controller.status();
      case 'RESUME_RUN': await controller.resume(); return controller.status();
      case 'RETRY': await controller.retry(); return controller.status();
      case 'SKIP': await controller.requestCleanup('skip'); return controller.status();
      case 'REMOVE': await controller.requestCleanup('remove', Boolean(message.force)); return controller.status();
      case 'REPAIR_RECOVERY': await controller.repairRecovery(); return controller.status();
      case 'STOP_RUN': await controller.stop(); return controller.status();
      case 'GET_TELEMETRY': return controller.telemetry();
      case 'GET_NATIVE_STATUS': return nativeHost.status();
      case 'NATIVE_COMMAND':
        if (sender.tab?.id !== controller.run.tabId) throw new Error('Native input rejected for a non-automation tab');
        return nativeHost.command(message.command);
      case 'PAGE_READY': await controller.pageReady(sender.tab?.id, message.page); return { ok: true };
      case 'CONTENT_RUNNING': await controller.contentRunning(message.details); return { ok: true };
      case 'CONTENT_PHASE': await controller.contentPhase(message.phase); return { ok: true };
      case 'CONTENT_ERROR': await controller.fail(message.reason, true); return { ok: true };
      case 'USER_ACTIVITY': await controller.pause('OS input paused because user activity was detected'); return { ok: true };
      case 'NATIVE_FOCUS_REQUIRED': await controller.pause('Click once inside the GFG editor to start OS typing automatically'); return { ok: true };
      case 'NATIVE_FOCUS_READY':
        if (controller.run.state === 'PAUSED' && /click once inside the GFG editor/i.test(controller.run.recoverableError || '')) await controller.resume();
        return { ok: true };
      case 'CLEANUP_DONE': await controller.cleanupDone(message.result); return { ok: true };
      case 'TARGET_CPS': controller.run.currentTargetCps = message.cps; await controller.save(); await controller.broadcast(); return { ok: true };
      default: return { ok: false, error: 'Unknown message' };
    }
  })().then(sendResponse).catch(error => sendResponse({ error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => ready.then(() => {
  if (alarm.name === TraversalLab.DWELL_ALARM) return controller.requestCleanup('advance');
  if (alarm.name === TraversalLab.NAV_ALARM) return controller.fail('Navigation timeout', true);
}));
chrome.tabs.onRemoved.addListener(tabId => ready.then(() => { if (tabId === controller.run.tabId && !TraversalLab.TERMINAL_STATES.has(controller.run.state)) controller.fail('Closed automation tab', true); }));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => ready.then(() => {
  if (tabId !== controller.run.tabId || !changeInfo.url || !['RUNNING', 'WAITING_FOR_EDITOR', 'CLEANING'].includes(controller.run.state)) return;
  const slug = controller.current()?.problem?.slug;
  if (slug && !changeInfo.url.includes(`/problems/${slug}`)) controller.fail('Unexpected navigation before verified cleanup', true);
}));
