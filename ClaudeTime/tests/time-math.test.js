// ClaudeTime/tests/time-math.test.js
const assert = require('node:assert');
const { test } = require('node:test');
const { weekFraction, WEEK_MS } = require('../time-math.js');

const end = Date.parse('2026-06-17T11:00:00Z'); // a weekly reset instant

test('weekFraction: just after window start is ~0', () => {
  const now = end - WEEK_MS + 1000; // 1s into the window
  assert.ok(weekFraction(now, end) < 0.01, `got ${weekFraction(now, end)}`);
});

test('weekFraction: midpoint is ~0.5', () => {
  const now = end - WEEK_MS / 2;
  assert.ok(Math.abs(weekFraction(now, end) - 0.5) < 1e-6);
});

test('weekFraction: just before reset is ~1', () => {
  assert.ok(weekFraction(end - 1000, end) > 0.99);
});

test('weekFraction clamps to [0,1]', () => {
  assert.strictEqual(weekFraction(end + 5000, end), 1);            // past reset
  assert.strictEqual(weekFraction(end - 8 * 24 * 3600 * 1000, end), 0); // before start
});

test('weekFraction: non-finite inputs return 0', () => {
  assert.strictEqual(weekFraction(NaN, end), 0);
  assert.strictEqual(weekFraction(Date.now(), NaN), 0);
});
