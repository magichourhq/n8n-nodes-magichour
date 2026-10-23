const assert = require('node:assert/strict');
const test = require('node:test');
const { MagicHour } = require('../dist/nodes/MagicHour/MagicHour.node.js');

function context(handler, { keepGoing = true, count = 1 } = {}) {
  return {
    getInputData: () => Array.from({length: count}, () => ({json: {}})),
    getNode: () => ({id: 'test', name: 'Magic Hour', type: 'magicHour', typeVersion: 1, position: [0, 0], parameters: {}}),
    getNodeParameter: (name, i, fallback) => ({resource: 'image', operation: 'generateImage', prompt: 'test mug', options: {model: 'flux-2-klein', resolution: '640px'}, waitForCompletion: true, timeoutSeconds: -1, externalId: `row-${i}`})[name] ?? fallback,
    continueOnFail: () => keepGoing,
    helpers: {httpRequestWithAuthentication: async (_, request) => handler(request)},
  };
}

const run = (ctx) => MagicHour.prototype.execute.call(ctx);

test('polling timeout keeps accepted ID and charge, with one create', async () => {
  let creates = 0;
  const [items] = await run(context(async (r) => r.method === 'POST' ? (creates++, {id: 'accepted', credits_charged: 5}) : {status: 'rendering'}));
  assert.equal(creates, 1); assert.equal(items[0].json.projectId, 'accepted');
  assert.equal(items[0].json.creditsCharged, 5); assert.equal(items[0].json.status, 'failed');
  assert.equal(items[0].json.externalId, 'row-0');
});

test('completed project with no output cannot be succeeded', async () => {
  const [items] = await run(context(async (r) => r.method === 'POST' ? {id: 'accepted', credits_charged: 5} : {status: 'complete', downloads: []}));
  assert.equal(items[0].json.status, 'failed'); assert.equal(items[0].json.projectId, 'accepted');
  assert.match(items[0].json.errorMessage, /usable download/);
});

test('terminal provider error preserves the final refunded charge', async () => {
  const [items] = await run(context(async (r) => r.method === 'POST' ? {id: 'accepted', credits_charged: 5} : {status: 'error', credits_charged: 0}));
  assert.equal(items[0].json.status, 'failed'); assert.equal(items[0].json.projectId, 'accepted');
  assert.equal(items[0].json.creditsCharged, 0);
});

test('a second rejected item cannot inherit the first accepted job', async () => {
  let creates = 0;
  const [items] = await run(context(async (r) => {
    if (r.method === 'POST') { if (++creates === 2) throw {statusCode: 402, message: 'insufficient credits'}; return {id: 'first', credits_charged: 5}; }
    return {status: 'rendering'};
  }, {count: 2}));
  assert.equal(items[0].json.projectId, 'first'); assert.equal(items[1].json.projectId, null);
  assert.equal(items[1].json.creditsCharged, null); assert.equal(items[1].pairedItem.item, 1);
});

test('success requires usable HTTPS output and preserves signed query', async () => {
  const url = 'https://example.com/result.png?signature=exact';
  const [items] = await run(context(async (r) => r.method === 'POST' ? {id: 'accepted', credits_charged: 5} : {status: 'complete', credits_charged: 5, downloads: [{url}, {url: 'not-a-url'}]}));
  assert.equal(items[0].json.status, 'succeeded'); assert.equal(items[0].json.outputUrl, url);
  assert.deepEqual(items[0].json.downloadUrls, [url]);
});

test('stopping the workflow retains accepted ID in the thrown error', async () => {
  await assert.rejects(run(context(async (r) => r.method === 'POST' ? {id: 'keep-this-id', credits_charged: 5} : {status: 'complete', downloads: []}, {keepGoing: false})), /keep-this-id/);
});

for (const statusCode of [401, 402, 429, 500]) {
  test(`HTTP ${statusCode} before acceptance has no invented project ID`, async () => {
    const [items] = await run(context(async () => {throw {statusCode, message: 'rejected'};}));
    assert.equal(items[0].json.projectId, null); assert.equal(items[0].json.status, 'failed');
  });
}
