const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/shared/core.js');
require('../src/shared/validation.js');
const { RunController, RUN_KEY, DWELL_ALARM } = require('../src/background/run-controller.js');

function fakeChrome(run, pingReply) {
  const state = { [RUN_KEY]: structuredClone(run) }, calls = { messages: [], updates: [], alarms: [] };
  return {
    calls,
    storage: { local: { get: async key => ({ [key]: state[key] }), set: async values => Object.assign(state, structuredClone(values)), remove: async key => { delete state[key]; } } },
    tabs: {
      get: async id => ({ id, url: run.queue[0].problem.url }),
      sendMessage: async (id, message) => { calls.messages.push(message); return message.type === 'PING_ACTIVE' ? pingReply : { ok: true }; },
      update: async (id, update) => { calls.updates.push(update); return { id, ...update }; },
      create: async create => ({ id: 99, ...create })
    },
    alarms: { create: async (name, options) => calls.alarms.push({ name, options }), clear: async () => true },
    runtime: { sendMessage: async () => ({}) }
  };
}
function storedRun(state = 'RUNNING') { return { state, runId: 'run-1', tabId: 7, queueIndex: 0, queue: [{ position: 16, problem: { id: 'p16', slug: 'arithmetic-number', url: 'https://www.geeksforgeeks.org/problems/arithmetic-number/1', title: 'Arithmetic Number' } }], config: { ...global.TraversalLab.DEFAULTS, endPosition: 100, lastCompleted: 15, minutesPerQuestion: 1 }, dwellDeadline: Date.now() + 30000, counts: { completed: 0, skipped: 0, failed: 0 } }; }

test('service-worker suspension reconnects without reloading or duplicating typing', async () => {
  const run = storedRun(), chromeApi = fakeChrome(run, { active: true, runId: 'run-1', problemId: 'p16', generatedLength: 120 });
  const controller = new RunController({ chromeApi, resolver: {} }); await controller.init();
  assert.equal(controller.run.state, 'RUNNING'); assert.equal(chromeApi.calls.updates.length, 0); assert.equal(chromeApi.calls.messages.filter(x => x.type === 'START_PROBLEM').length, 0); assert.equal(chromeApi.calls.alarms[0].name, DWELL_ALARM);
});

test('real page-session loss recovers current page once without tab navigation', async () => {
  const run = storedRun(), chromeApi = fakeChrome(run, { active: false });
  const controller = new RunController({ chromeApi, resolver: {} }); await controller.init();
  assert.equal(controller.run.state, 'WAITING_FOR_EDITOR'); assert.equal(chromeApi.calls.updates.length, 0); assert.equal(chromeApi.calls.messages.filter(x => x.type === 'START_PROBLEM').length, 1);
});

test('extension reload with stale page scripts pauses cleanly instead of breaking controller initialization', async () => {
  const run = storedRun(), chromeApi = fakeChrome(run, null);
  chromeApi.tabs.sendMessage = async () => { throw new Error('Receiving end does not exist'); };
  const controller = new RunController({ chromeApi, resolver: {} }); await controller.init();
  assert.equal(controller.run.state, 'PAUSED'); assert.match(controller.run.recoverableError, /Refresh the GFG tab/);
});
test('exact URL mode freezes a deduplicated slug queue without consulting Explore', async () => {
  const initial = { state: 'IDLE', queue: [{ problem: { url: 'https://www.geeksforgeeks.org/problems/placeholder/1' } }] };
  const chromeApi = fakeChrome(initial, null); const resolver = { resolve: async () => { throw new Error('Explore must not be called'); } };
  const controller = new RunController({ chromeApi, resolver }); await controller.init();
  await controller.start({ ...global.TraversalLab.DEFAULTS, traversalMode: 'urls', urlList: 'https://www.geeksforgeeks.org/problems/factorial5739/1\nhttps://www.geeksforgeeks.org/problems/lcm-and-gcd4516/1', editorConfirmed: true });
  assert.deepEqual(controller.run.queue.map(item => item.problem.slug), ['factorial5739', 'lcm-and-gcd4516']);
  assert.equal(controller.run.queueSource, 'user-url-list'); assert.match(controller.run.queueFingerprint, /^[0-9a-f]{8}$/);
});
