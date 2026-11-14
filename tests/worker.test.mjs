import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { DailyBudget, MODEL, normalizeOutput } from '../server/worker.mjs';

const origin = 'https://minseok3773.github.io';
const analysis = { urgent: [], drugs: [{ input: '가상 약 A', ingredient: '확인 필요', ingredient_en: [], unsure: true }],
  combos: [], checklist: [], observations: [], questions: ['의료진에게 확인'], plan: [], member_talk: [] };
class MemoryStorage {
  values = new Map();
  queue = Promise.resolve();
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  transaction(fn) {
    const result = this.queue.then(() => fn(this));
    this.queue = result.catch(() => {});
    return result;
  }
}
function setup(limit = '20') {
  const storage = new MemoryStorage();
  const calls = [];
  const env = { ALLOWED_ORIGIN: origin, DAILY_REQUEST_LIMIT: limit,
    AI: { async run(model, input) { calls.push({ model, input }); return { response: JSON.stringify(analysis) }; } } };
  const object = new DailyBudget({ storage }, env);
  env.BUDGET = { idFromName: name => name, get: () => object };
  return { env, calls, storage };
}
function req({ path = '/api/analyze', method = 'POST', prompt = '가상 약과 관찰 학습', fictional = true, kind = 'analysis', requestOrigin = origin } = {}) {
  return new Request('https://yakkuk-ai.example' + path, { method,
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ prompt, fictional, kind }) } : {}),
  });
}

test('health checks and preflight do not run inference or consume budget', async () => {
  const { env, calls, storage } = setup();
  const status = await worker.fetch(req({ path: '/api/status', method: 'GET' }), env);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).model, MODEL);
  assert.equal((await worker.fetch(req({ method: 'OPTIONS' }), env)).status, 204);
  assert.equal(calls.length, 0);
  assert.equal(storage.values.size, 0);
});

test('an added owned origin works alongside the existing site without allowing other domains', async () => {
  const { env, calls } = setup();
  env.ADDITIONAL_ORIGINS = ' https://yakkuk.pages.dev ';
  for (const requestOrigin of [origin, 'https://yakkuk.pages.dev']) {
    const response = await worker.fetch(req({ path: '/api/status', method: 'GET', requestOrigin }), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), requestOrigin);
    assert.equal(response.headers.get('Vary'), 'Origin');
    assert.equal((await worker.fetch(req({ method: 'OPTIONS', requestOrigin }), env)).status, 204);
  }
  for (const requestOrigin of ['https://yakkuk.pages.dev.evil.example', 'http://yakkuk.pages.dev', 'https://other.pages.dev']) {
    assert.equal((await worker.fetch(req({ path: '/api/status', method: 'GET', requestOrigin }), env)).status, 403);
  }
  assert.equal(calls.length, 0);
});
test('denied origin, missing consent and invalid inputs are rejected before inference', async () => {
  const { env, calls, storage } = setup();
  for (const [options, status] of [
    [{ requestOrigin: 'https://unrelated.example' }, 403], [{ requestOrigin: '' }, 403],
    [{ fictional: false }, 400], [{ prompt: '' }, 400], [{ prompt: 'a'.repeat(12001) }, 400],
    [{ kind: 'unknown' }, 400], [{ path: '/not-found' }, 404],
  ]) assert.equal((await worker.fetch(req(options), env)).status, status);
  const invalid = new Request('https://yakkuk-ai.example/api/analyze', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{broken',
  });
  assert.equal((await worker.fetch(invalid, env)).status, 400);
  const large = new Request('https://yakkuk-ai.example/api/analyze', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: 'a'.repeat(65537),
  });
  assert.equal((await worker.fetch(large, env)).status, 413);
  assert.equal(calls.length, 0);
  assert.equal(storage.values.size, 0);
});
test('one explicit analysis uses fixed free-tier model and bounded generation', async () => {
  const { env, calls, storage } = setup();
  const response = await worker.fetch(req(), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(JSON.parse((await response.json()).text), analysis);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, MODEL);
  assert.equal(calls[0].input.max_tokens, 8192);
  assert.equal(calls[0].input.messages[0].role, 'system');
  assert.match(calls[0].input.messages[0].content, /가상 사례/);
  assert.deepEqual([...storage.values.keys()], ['budget']);
  assert.doesNotMatch(JSON.stringify([...storage.values]), /가상 약|관찰 학습/);
});
test('global budget is atomic across concurrent requests and never exceeds the cap', async () => {
  const { env, calls } = setup('3');
  const responses = await Promise.all(Array.from({ length: 12 }, () => worker.fetch(req(), env)));
  assert.equal(responses.filter(r => r.status === 200).length, 3);
  assert.equal(responses.filter(r => r.status === 429).length, 9);
  assert.equal(calls.length, 3);
  const status = await (await worker.fetch(req({ path: '/api/status', method: 'GET' }), env)).json();
  assert.equal(status.allowed, false);
  assert.equal(status.remaining, 0);
});
test('configuration cannot raise the safety cap above twenty calls', async () => {
  const { env, calls } = setup('1000');
  const responses = await Promise.all(Array.from({ length: 22 }, () => worker.fetch(req(), env)));
  assert.equal(responses.filter(r => r.status === 200).length, 20);
  assert.equal(calls.length, 20);
});
test('daily provider quota pauses all new requests without automatic retries or paid fallback', async () => {
  const { env, storage } = setup();
  let calls = 0;
  env.AI.run = async () => { calls++; throw Object.assign(new Error('Error 3036: daily free allocation exceeded'), { status: 429 }); };
  for (let i = 0; i < 2; i++) {
    const response = await worker.fetch(req(), env);
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, 'daily_quota');
  }
  assert.equal(calls, 1);
  assert.equal((await storage.get('budget')).paused, true);
});
test('counter and quota pause reset on a new UTC day', async () => {
  const { env, calls, storage } = setup();
  await storage.put('budget', { day: '2000-01-01', count: 20, paused: true });
  assert.equal((await worker.fetch(req(), env)).status, 200);
  assert.equal(calls.length, 1);
  assert.equal((await storage.get('budget')).count, 1);
});
test('temporary capacity, timeout and setup errors never trigger paid-model fallback', async () => {
  for (const [issue, status, code] of [
    [Object.assign(new Error('Error 3040: out of capacity'), { status: 429 }), 503, 'provider_busy'],
    [Object.assign(new Error('timeout'), { code: 'timeout' }), 503, 'timeout'],
    [new Error('5035 model requires paid plan'), 503, 'provider_setup'],
    [new Error('private upstream detail MUST_NOT_LEAK'), 503, 'provider_error'],
  ]) {
    const { env } = setup(); let calls = 0;
    env.AI.run = async () => { calls++; throw issue; };
    const response = await worker.fetch(req(), env);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.doesNotMatch(JSON.stringify(body), /MUST_NOT_LEAK/);
    assert.equal(calls, 1);
  }
});
test('invalid model output is not returned as a valid analysis', async () => {
  for (const response of ['not JSON', '{"drugs":[]}', JSON.stringify({ ...analysis, checklist: [{ area: 'x', items: [null] }] })]) {
    const { env } = setup();
    env.AI.run = async () => ({ response });
    const result = await worker.fetch(req(), env);
    assert.equal(result.status, 502);
    assert.equal((await result.json()).error.code, 'invalid_response');
  }
});
test('study and quiz use the same server boundary, with valid JSON and no thought output', () => {
  assert.equal(normalizeOutput('<think>private reasoning</think>가상 학습 안내', 'study'), '가상 학습 안내');
  assert.throws(() => normalizeOutput('<think>unfinished', 'study'));
  const quiz = [{ q: '가상 문제', options: ['A', 'B', 'C', 'D'], answer: 2, explain: '가상 해설' }];
  assert.deepEqual(JSON.parse(normalizeOutput(JSON.stringify(quiz), 'quiz')), quiz);
  assert.throws(() => normalizeOutput('[{"q":"x","options":[],"answer":8}]', 'quiz'));
});

test('structured JSON mode is requested and accepts the provider object response', async () => {
  const { env, calls } = setup();
  const run = env.AI.run;
  env.AI.run = async (model, input) => {
    await run(model, input);
    return { response: analysis };
  };
  const response = await worker.fetch(req(), env);
  assert.equal(response.status, 200);
  assert.equal(calls[0].input.response_format.type, 'json_schema');
  assert.deepEqual(JSON.parse((await response.json()).text), analysis);
  assert.deepEqual(JSON.parse(normalizeOutput({ items: [{ q: '가상 문제', options: ['A','B','C','D'], answer: 0, explain: '가상 해설' }] }, 'quiz'))[0].answer, 0);
  assert.throws(() => normalizeOutput({ items: [null] }, 'quiz'));
});

test('repetitive analysis and non-English ingredient keys are rejected', () => {
  assert.throws(() => normalizeOutput({ ...analysis, questions: Array(8).fill('repeat') }, 'analysis'));
  assert.throws(() => normalizeOutput({ ...analysis, drugs: [{ ...analysis.drugs[0], ingredient_en: ['리스페리돈'], unsure: false }] }, 'analysis'));
});
