const test = require('node:test');
const assert = require('node:assert');
const { frameIndex, reorder } = require('../art-math.js');

test('frameIndex maps 0% to first, 100% to last', () => {
  assert.equal(frameIndex(0, 5), 0);
  assert.equal(frameIndex(100, 5), 4);
});
test('frameIndex rounds to nearest across the range', () => {
  assert.equal(frameIndex(50, 5), 2);   // round(0.5*4)=2
  assert.equal(frameIndex(49, 3), 1);   // round(0.49*2)=1
});
test('frameIndex clamps out-of-range pct', () => {
  assert.equal(frameIndex(-10, 4), 0);
  assert.equal(frameIndex(150, 4), 3);
});
test('frameIndex edge counts', () => {
  assert.equal(frameIndex(37, 1), 0);   // single frame
  assert.equal(frameIndex(50, 0), -1);  // no frames -> sentinel -1
});
test('frameIndex handles non-finite pct as 0', () => {
  assert.equal(frameIndex(NaN, 4), 0);
});
test('reorder moves an item from i to j (pure, non-mutating)', () => {
  const a = ['a','b','c','d'];
  const out = reorder(a, 0, 2);
  assert.deepEqual(out, ['b','c','a','d']);
  assert.deepEqual(a, ['a','b','c','d']); // original untouched
});
test('reorder out-of-bounds returns a shallow copy unchanged', () => {
  assert.deepEqual(reorder(['a','b'], 5, 0), ['a','b']);
});
