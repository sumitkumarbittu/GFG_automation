const test = require('node:test');
const assert = require('node:assert/strict');
const { sampleCps, seededRandom } = require('../src/content/typing-scheduler.js');
const { pointerTarget } = require('../src/content/pointer-simulator.js');

test('every speed profile stays within configured bounds', () => {
  for (const profile of ['uniform','triangular','bursty']) for (let i=0;i<1000;i++) assert.ok(sampleCps(profile, 40, 150) >= 40 && sampleCps(profile, 40, 150) <= 150);
});
test('seeded sampling is repeatable', () => {
  const a = seededRandom('replay-7'), b = seededRandom('replay-7');
  assert.deepEqual(Array.from({length:20}, () => sampleCps('seeded', 40, 150, a)), Array.from({length:20}, () => sampleCps('seeded', 40, 150, b)));
});
test('pointer targets remain clamped inside editor', () => {
  const rect = { left:10, top:20, width:300, height:200, right:310, bottom:220 };
  for (const accuracy of [0,50,100]) for(let i=0;i<100;i++){ const p=pointerTarget(rect,{left:500,top:-100},accuracy); assert.ok(p.x>=10&&p.x<=310&&p.y>=20&&p.y<=220&&p.nx>=0&&p.nx<=1&&p.ny>=0&&p.ny<=1); }
});
