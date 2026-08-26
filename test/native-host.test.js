const test = require('node:test');
const assert = require('node:assert/strict');
const { HOST_NAME, NativeHostClient } = require('../src/background/native-host.js');

function eventSlot() {
  const listeners = [];
  return { listeners, addListener(listener) { listeners.push(listener); }, emit(value) { for (const listener of listeners) listener(value); } };
}

test('native host client probes the fixed host identity and correlates replies', async () => {
  const onMessage = eventSlot(), onDisconnect = eventSlot(), calls = [];
  const port = { onMessage, onDisconnect, postMessage(message) { calls.push(message); queueMicrotask(() => onMessage.emit({ id: message.id, ok: true, result: { version: '1.0.0', platform: 'macos', accessibility: true } })); } };
  const chromeApi = { runtime: { connectNative(name) { assert.equal(name, HOST_NAME); return port; }, lastError: null } };
  const client = new NativeHostClient({ chromeApi, timeoutMs: 100 });
  const info = await client.probe();
  assert.equal(info.platform, 'macos');
  assert.equal(calls[0].action, 'hello');
});

test('native host client rejects unapproved command types before connecting', async () => {
  let connected = false;
  const client = new NativeHostClient({ chromeApi: { runtime: { connectNative() { connected = true; } } } });
  await assert.rejects(client.command({ action: 'click' }), /Unsupported native command/);
  assert.equal(connected, false);
});

test('native host probe rejects missing accessibility permission', async () => {
  const onMessage = eventSlot(), onDisconnect = eventSlot();
  const port = { onMessage, onDisconnect, postMessage(message) { queueMicrotask(() => onMessage.emit({ id: message.id, ok: true, result: { version: '1.0.0', platform: 'macos', accessibility: false } })); } };
  const client = new NativeHostClient({ chromeApi: { runtime: { connectNative: () => port, lastError: null } }, timeoutMs: 100 });
  await assert.rejects(client.probe(), /Accessibility permission/);
});

