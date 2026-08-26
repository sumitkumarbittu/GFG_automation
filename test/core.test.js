const test = require('node:test');
const assert = require('node:assert/strict');
const { positions, filterCatalog, journalMatchesProblem, journalAppearsClean } = require('../src/shared/core.js');
const { validateConfig, DEFAULTS } = require('../src/shared/validation.js');

test('last completed is exclusive and end is inclusive', () => assert.deepEqual(positions(100, 150), Array.from({ length: 50 }, (_, i) => i + 101)));
test('CPS range validation accepts bounds and rejects inversions', () => {
  assert.equal(validateConfig({ ...DEFAULTS, endPosition: 2, minCps: 40, maxCps: 150 }).maxCps, 150);
  assert.throws(() => validateConfig({ ...DEFAULTS, endPosition: 2, minCps: 151, maxCps: 150 }), /CPS/);
});
test('pointer interval and accuracy validation', () => {
  assert.throws(() => validateConfig({ ...DEFAULTS, endPosition: 2, pointerIntervalMs: 249 }), /Pointer interval/);
  assert.throws(() => validateConfig({ ...DEFAULTS, endPosition: 2, pointerAccuracy: 101 }), /Pointer accuracy/);
});
test('premium and unavailable filtering preserves catalog positions', () => {
  const catalog = [{ id:'a' }, { id:'b', premium:true }, { id:'c', available:false }, { id:'d' }];
  assert.deepEqual(filterCatalog(catalog, [1,2,3,4], true).map(x => x.position), [1,4]);
});
test('recovery journals match canonical problem slugs across URL changes', () => {
  const journal={problemId:'old-id',problemUrl:'https://practice.geeksforgeeks.org/problems/prime-number2314/0'};
  assert.equal(journalMatchesProblem(journal,{id:'703954',url:'https://www.geeksforgeeks.org/problems/prime-number2314/1'}),true);
  assert.equal(journalMatchesProblem(journal,{id:'2',url:'https://www.geeksforgeeks.org/problems/factorial/1'}),false);
});
test('already-clean journal is recognized only when both anchors remain',()=>{
  const source='beforeAFTERtail',journal={insertionPosition:6,contextBefore:'before',contextAfter:'AFTER'};
  assert.equal(journalAppearsClean(source,journal),true);assert.equal(journalAppearsClean('changed',journal),false);
});
