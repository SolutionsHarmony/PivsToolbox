const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { normalize } = require('../usage-client.js');

const usageRaw = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'usage.json'), 'utf8')
);

test('normalize maps real payload to tidy shape', () => {
  const out = normalize(usageRaw);
  assert.ok(out, 'should return an object');
  assert.equal(out.fiveHour.pct, 21);
  assert.equal(out.weekly.pct, 6);
  assert.ok(out.fiveHour.pct >= 0 && out.fiveHour.pct <= 100);
  assert.ok(out.weekly.pct >= 0 && out.weekly.pct <= 100);
  // resetAt normalized to epoch ms (number)
  assert.equal(out.fiveHour.resetAt, Date.parse('2026-06-13T20:20:00.725123+00:00'));
  assert.equal(out.weekly.resetAt, Date.parse('2026-06-17T14:59:59.725141+00:00'));
});

test('normalize returns null on garbage', () => {
  assert.equal(normalize(null), null);
  assert.equal(normalize(undefined), null);
  assert.equal(normalize({}), null);
  assert.equal(normalize({ nope: true }), null);
});

test('normalize returns null when a utilization is missing/non-finite', () => {
  assert.equal(normalize({ five_hour: { resets_at: '2026-06-13T20:20:00Z' }, seven_day: { utilization: 6, resets_at: '2026-06-17T14:59:59Z' } }), null);
  assert.equal(normalize({ five_hour: { utilization: 'x', resets_at: '2026-06-13T20:20:00Z' }, seven_day: { utilization: 6, resets_at: '2026-06-17T14:59:59Z' } }), null);
});

test('normalize clamps percent into 0..100', () => {
  const out = normalize({ five_hour: { utilization: 150, resets_at: '2026-06-13T20:20:00Z' }, seven_day: { utilization: -5, resets_at: '2026-06-17T14:59:59Z' } });
  assert.equal(out.fiveHour.pct, 100);
  assert.equal(out.weekly.pct, 0);
});
