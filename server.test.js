import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, buildRequest, validatePayload } from './server.js';

test('request asks Choice, Score, and Noul about the same ticket', () => {
  const payload = buildRequest('I lost my phone and need an MFA reset.');
  assert.equal(payload.model, 'jev-latest');
  assert.deepEqual(Object.values(payload.questions).map(question => question.type), ['choice', 'score', 'noul']);
  assert.equal(payload.questions.route.criteria.other.includes('manual triage'), true);
  assert.equal(payload.questions.urgency.criteria.length, 4);
});

test('server forwards all three questions with server-side authentication', async () => {
  let captured;
  const server = createServer({ apiKey: 'test-key', fetchImpl: async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ model: 'jev-latest', answers: {
      route: { type: 'choice', choice: 'identity_access', probabilities: { identity_access: 1 }, confidence: 1 },
      urgency: { type: 'score', score: 2, probabilities: { 2: 1 }, confidence: 1 },
      human_review: { type: 'noul', noul: .99 }
    }, usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Please reset my MFA after I lost my phone.' }) });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(captured.url, 'https://thejevai.com/v1/systemone');
    assert.equal(captured.options.headers.authorization, 'Bearer test-key');
    assert.deepEqual(Object.values(JSON.parse(captured.options.body).questions).map(question => question.type), ['choice', 'score', 'noul']);
    assert.equal(data.result.answers.human_review.noul, .99);
    assert.equal('authorization' in data.request, false);
  } finally { server.close(); }
});

test('server rejects missing key without contacting Jev', async () => {
  const server = createServer({ apiKey: '', fetchImpl: () => { throw new Error('Unexpected fetch'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Please reset my MFA after I lost my phone.' }) });
    assert.equal(response.status, 503);
  } finally { server.close(); }
});

test('edited JSON is forwarded unchanged and arbitrary question IDs are accepted', async () => {
  const payload = buildRequest('My account is locked.');
  payload.model = 'jev-preview';
  payload.questions.route.instructions = 'Choose the best team for this ticket.';
  payload.questions.extra_check = { type: 'noul', instructions: 'Does the ticket mention SSO?' };
  assert.equal(validatePayload(payload), null);
  let forwarded;
  const server = createServer({ apiKey: 'test-key', fetchImpl: async (_url, options) => {
    forwarded = JSON.parse(options.body);
    return new Response(JSON.stringify({ model: 'jev-preview', answers: Object.fromEntries(Object.entries(payload.questions).map(([key, question]) => [key, { type: question.type }])) }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload }) });
    assert.equal(response.status, 200);
    assert.deepEqual(forwarded, payload);
  } finally { server.close(); }
});

test('invalid edited JSON payload is rejected before any API call', async () => {
  const server = createServer({ apiKey: 'test-key', fetchImpl: () => { throw new Error('Unexpected fetch'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload: { model: 'jev-latest', state: 'test', questions: { route: { type: 'choice', instructions: 'route', criteria: { only_one: 'invalid' } } } } }) });
    assert.equal(response.status, 400);
    const asset = await fetch(`http://127.0.0.1:${server.address().port}/request.js`);
    assert.equal(asset.status, 200);
  } finally { server.close(); }
});
