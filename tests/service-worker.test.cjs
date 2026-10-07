const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worker({ response = new Response('fresh'), offline = false, hit, put = async () => {} } = {}) {
  const handlers = {}, deleted = [], stored = [], matches = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), {
    self: { addEventListener: (type, fn) => { handlers[type] = fn; }, clients: { claim: async () => {} } },
    location: { origin: 'https://ascent-academia.github.io' }, URL, Response,
    fetch: async () => { if (offline) throw new Error('Offline'); return response; },
    caches: {
      keys: async () => ['ascent-clock-v4', 'ascent-clock-v5', 'another-app-v1'],
      delete: async (key) => { deleted.push(key); },
      open: async () => ({ put: async (request, value) => { stored.push(await value.text()); await put(request, value); } }),
      match: async (request, options) => { matches.push(options); return hit; },
    },
  });
  async function activate() { let pending; handlers.activate({ waitUntil: (p) => { pending = p; } }); await pending; }
  async function fetchAsset() {
    let result;
    const pending = [];
    handlers.fetch({ request: new Request('https://ascent-academia.github.io/ascent-clock/app.js'),
      waitUntil: (p) => pending.push(p), respondWith: (p) => { result = p; } });
    const res = await result;
    await Promise.all(pending);
    return res;
  }
  return { activate, fetchAsset, deleted, stored, matches };
}

test('activation removes old clock caches and preserves other apps on the same origin', async () => {
  const w = worker();
  await w.activate();
  assert.deepEqual(w.deleted, ['ascent-clock-v4']);
});

test('HTTP errors cannot poison the offline cache and use its working asset', async () => {
  const hit = new Response('known-good');
  const w = worker({ response: new Response('error page', { status: 503 }), hit });
  assert.equal(await (await w.fetchAsset()).text(), 'known-good');
  assert.deepEqual(w.stored, []);
});

test('successful responses remain usable if writing the cache fails', async () => {
  const w = worker({ put: async () => { throw new Error('quota'); } });
  assert.equal(await (await w.fetchAsset()).text(), 'fresh');
  assert.deepEqual(w.stored, ['fresh']);
});

test('offline fallback reads only this clock version cache', async () => {
  const w = worker({ offline: true, hit: new Response('offline asset') });
  assert.equal(await (await w.fetchAsset()).text(), 'offline asset');
  assert.equal(w.matches[0].cacheName, 'ascent-clock-v5');
  assert.equal(w.matches[0].ignoreSearch, true);
});

test('an uncached offline request returns a network error response', async () => {
  const w = worker({ offline: true });
  assert.equal((await w.fetchAsset()).type, 'error');
});
