const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { normalize } = require('../usage-client.js');
const { pickWorkingOrg } = require('../usage-fetch.js');

const usageRaw = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'usage.json'), 'utf8')
);
const goodUsage = normalize(usageRaw); // a valid normalized object

test('pickWorkingOrg returns the first org that yields valid usage', async () => {
  const calls = [];
  const usageFor = async (id) => {
    calls.push(id);
    // Only the second org returns valid usage.
    return id === 'org-b' ? goodUsage : null;
  };
  const picked = await pickWorkingOrg(['org-a', 'org-b', 'org-c'], usageFor);
  assert.ok(picked, 'should pick an org');
  assert.equal(picked.orgId, 'org-b');
  assert.equal(picked.usage, goodUsage);
  // Stops at the first success — does not try org-c.
  assert.deepEqual(calls, ['org-a', 'org-b']);
});

test('pickWorkingOrg returns null when no org yields valid usage', async () => {
  const usageFor = async () => null;
  const picked = await pickWorkingOrg(['org-a', 'org-b'], usageFor);
  assert.equal(picked, null);
});

test('pickWorkingOrg treats a throwing org as a failure and moves on', async () => {
  const usageFor = async (id) => {
    if (id === 'org-a') throw new Error('404');
    return goodUsage;
  };
  const picked = await pickWorkingOrg(['org-a', 'org-b'], usageFor);
  assert.ok(picked);
  assert.equal(picked.orgId, 'org-b');
});

test('pickWorkingOrg handles empty / non-array input', async () => {
  assert.equal(await pickWorkingOrg([], async () => goodUsage), null);
  assert.equal(await pickWorkingOrg(null, async () => goodUsage), null);
  assert.equal(await pickWorkingOrg(undefined, async () => goodUsage), null);
});

test('pickWorkingOrg skips falsy org ids', async () => {
  const seen = [];
  const usageFor = async (id) => { seen.push(id); return id === 'real' ? goodUsage : null; };
  const picked = await pickWorkingOrg(['', null, 'real'], usageFor);
  assert.ok(picked);
  assert.equal(picked.orgId, 'real');
  assert.deepEqual(seen, ['real']); // falsy ids never reach usageFor
});
