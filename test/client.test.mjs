import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { inspect } from 'node:util';
import { test } from 'node:test';
import { AdsCrawl, AdsCrawlAPIError, AdsCrawlConnectionError, AdsCrawlResponseError, AdsCrawlTimeoutError } from '../dist/esm/index.js';

const apiKey = 'test-only-not-a-real-key';
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const article = { title: 'Article', byline: null, excerpt: null, siteName: null, lang: 'en', dir: null,
  content: '<p>Text</p>', textContent: 'Text', length: 4, publishedTime: null };
const session = { sessionId: 'session-1', expiresAt: '2026-09-18T12:00:00Z',
  cdpBaseUrl: 'https://api.adscrawl.net/cdp/sessions/session-1?token=data-secret' };
const profile = { id: 'browser-1', source: 'manual', deleteOnStop: false, remark: '', browserSettings: {},
  proxyDisplayIp: null, proxyDisplayRegion: null, lastOpenedAt: null, updatedAt: '', runtime: { status: 'stopped' } };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', ...headers },
});
function mock(reply) {
  const calls = [];
  const client = new AdsCrawl({ apiKey, fetch: async (url, init) => {
    calls.push({ url, init, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    return typeof reply === 'function' ? reply(url, init) : reply;
  } });
  return { client, calls };
}

test('ESM and CommonJS exports are usable', () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/cjs/index.js');
  assert.equal(typeof cjs.AdsCrawl, 'function');
  assert.equal(cjs.default, cjs.AdsCrawl);
});
test('missing key, invalid base URL and invalid deadline fail before a request', () => {
  assert.throws(() => new AdsCrawl({ apiKey: '' }), /ADSCRAWL_API_KEY/);
  for (const baseURL of ['bad-url', 'file:///tmp', 'https://user:password@example.com', 'https://example.com?key=x']) {
    assert.throws(() => new AdsCrawl({ apiKey, baseURL }), TypeError);
  }
  assert.throws(() => new AdsCrawl({ apiKey, timeoutMs: 0 }), TypeError);
});
test('reads environment configuration without exposing credentials during inspection', () => {
  const old = process.env.ADSCRAWL_API_KEY;
  try {
    process.env.ADSCRAWL_API_KEY = apiKey;
    const client = new AdsCrawl();
    assert.equal(inspect(client).includes(apiKey), false);
    assert.equal(JSON.stringify(client).includes(apiKey), false);
  } finally {
    if (old === undefined) delete process.env.ADSCRAWL_API_KEY;
    else process.env.ADSCRAWL_API_KEY = old;
  }
});
test('native fetch sends authentication and decodes Markdown over HTTP', async () => {
  let received;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    received = { url: req.url, method: req.method, headers: req.headers, body: JSON.parse(body) };
    res.writeHead(200, { 'content-type': 'text/markdown' });
    res.end('# Hello');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const client = new AdsCrawl({ apiKey, baseURL: `http://127.0.0.1:${server.address().port}/` });
    assert.equal(await client.markdown({ url: 'https://example.com', waitUntil: 'domcontentloaded' }), '# Hello');
    assert.equal(received.url, '/html');
    assert.equal(received.method, 'POST');
    assert.equal(received.headers['x-api-key'], apiKey);
    assert.equal(received.body.contentMode, 'markdown');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
test('HTML stays text, article JSON stays structured, screenshot stays binary', async () => {
  assert.equal(await mock(new Response('<html></html>')).client.html({ url: 'https://example.com' }), '<html></html>');
  assert.deepEqual(await mock(json(article)).client.article({ url: 'https://example.com' }), article);
  assert.deepEqual(await mock(json(article)).client.html({ url: 'https://example.com', contentMode: 'json' }), article);
  assert.deepEqual(await mock(new Response(png)).client.screenshot({ url: 'https://example.com' }), png);
});
test('empty content, invalid PNG, malformed JSON and wrong JSON shape are response errors', async () => {
  await assert.rejects(mock(new Response('  ')).client.markdown({ url: 'https://example.com' }), AdsCrawlResponseError);
  await assert.rejects(mock(new Response('not png')).client.screenshot({ url: 'https://example.com' }), AdsCrawlResponseError);
  await assert.rejects(mock(new Response('{')).client.article({ url: 'https://example.com' }), AdsCrawlResponseError);
  await assert.rejects(mock(json({})).client.article({ url: 'https://example.com' }), AdsCrawlResponseError);
});
test('proxy routing conflicts fail before spending credits', async () => {
  const { client, calls } = mock(json({}));
  await assert.rejects(client.html({ url: 'https://example.com', proxy: { server: 'http://proxy.example.com:8080' }, countryCode: 'US' }), TypeError);
  await assert.rejects(client.cdp.create({ browserSettings: { proxy: { server: 'http://proxy.example.com:8080' }, countryCode: 'US' } }), TypeError);
  assert.equal(calls.length, 0);
});
for (const status of [400, 401, 402, 422, 429, 502, 503, 504]) {
  test(`HTTP ${status} preserves status/code/trace and never retries`, async () => {
    const { client, calls } = mock(json({ error: 'Service error', code: 'TEST_CODE', balance: 0 }, status, { 'x-trace-id': 'trace-1' }));
    await assert.rejects(client.markdown({ url: 'https://example.com' }), (e) => {
      assert.ok(e instanceof AdsCrawlAPIError);
      assert.equal(e.status, status);
      assert.equal(e.code, 'TEST_CODE');
      assert.equal(e.traceId, 'trace-1');
      assert.equal(e.body.balance, 0);
      return true;
    });
    assert.equal(calls.length, 1);
  });
}
test('plain-text gateway errors preserve a safe body', async () => {
  await assert.rejects(mock(new Response('Bad gateway', { status: 502 })).client.cdp.list(), (e) => {
    assert.equal(e.status, 502);
    assert.equal(e.body, 'Bad gateway');
    return true;
  });
});
test('echoed API keys, proxy credentials, cookies and token URLs are redacted', async () => {
  const body = { error: `${apiKey} proxy-password cookie-secret https://x.example?token=url-secret`,
    password: 'proxy-password', cookies: [{ value: 'cookie-secret' }], cdpBaseUrl: session.cdpBaseUrl };
  const { client } = mock(json(body, 400, { 'x-trace-id': apiKey }));
  await assert.rejects(client.html({ url: 'https://example.com',
    proxy: { server: 'http://proxy.example.com:8080', username: 'proxy-user', password: 'proxy-password' },
    cookies: [{ name: 'session', value: 'cookie-secret', domain: 'example.com' }] }), (e) => {
    const text = inspect(e);
    for (const secret of [apiKey, 'proxy-password', 'cookie-secret', 'url-secret', 'data-secret']) assert.equal(text.includes(secret), false);
    return true;
  });
});
test('network failures do not expose fetch URLs or credentials', async () => {
  const { client } = mock(() => { throw new TypeError(`Failed ${apiKey}`); });
  await assert.rejects(client.cdp.list(), (e) => e instanceof AdsCrawlConnectionError && !inspect(e).includes(apiKey));
});
test('timeout and cancellation remain distinct', async () => {
  const { client, calls } = mock((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  }));
  await assert.rejects(client.cdp.list({ timeoutMs: 10 }), AdsCrawlTimeoutError);
  const aborted = AbortSignal.abort();
  await assert.rejects(client.cdp.list({ signal: aborted }), (e) => e.name === 'AbortError');
  assert.equal(calls.length, 1);
  const controller = new AbortController();
  const pending = client.cdp.list({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (e) => e.name === 'AbortError');
});
test('deadline includes streaming the response body', async () => {
  const client = new AdsCrawl({ apiKey, fetch: async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true });
    },
  })) });
  await assert.rejects(client.html({ url: 'https://example.com' }, { timeoutMs: 10 }), AdsCrawlTimeoutError);
});
test('CDP create/list/close/live-token use documented endpoints', async () => {
  const { client, calls } = mock((url, init) => {
    if (url.endsWith('live-token')) return json({ ok: true, controlUrl: 'wss://example.com?controlToken=x', expiresAt: 123 });
    if (init.method === 'DELETE') return json({ ok: true });
    return init.method === 'POST' ? json(session, 201) : json({ ok: true, data: [session] });
  });
  assert.deepEqual(await client.cdp.create(), session);
  assert.deepEqual((await client.cdp.list()).data, [session]);
  assert.deepEqual(await client.cdp.close('session/1'), { ok: true });
  assert.equal((await client.cdp.liveToken('session-1')).expiresAt, 123);
  assert.equal(calls[2].url.endsWith('session%2F1'), true);
  assert.equal(calls[1].init.body, undefined);
  assert.equal(calls[0].init.redirect, 'error');
});
test('CDP discovery authenticates with data token without forwarding API key', async () => {
  const { client, calls } = mock(json({ Browser: 'Chrome/136', webSocketDebuggerUrl: 'wss://example.com' }));
  await client.cdp.getVersion(session);
  assert.equal(calls[0].url, 'https://api.adscrawl.net/cdp/sessions/session-1/json/version?token=data-secret');
  assert.equal(calls[0].init.headers['x-api-key'], undefined);
  assert.throws(() => client.cdp.getVersion({ ...session, cdpBaseUrl: 'https://other.example/cdp/sessions/session-1?token=x' }), TypeError);
  assert.throws(() => client.cdp.getVersion({ ...session, cdpBaseUrl: session.cdpBaseUrl.replace('session-1?', 'session-2?') }), TypeError);
  assert.throws(() => client.cdp.close('..'), TypeError);
});
test('SPA templates, extraction and inspection preserve response shapes', async () => {
  const extraction = { mode: 'extract', page: { url: 'https://example.com', title: 'Page' }, data: { visits: 10 }, missingFields: [], cached: false };
  const { client, calls } = mock(json(extraction));
  assert.deepEqual(await client.spa.extract({ template: 'similarweb-overview', url: 'https://example.com' }), extraction);
  assert.equal(calls[0].body.mode, 'extract');
  const inspection = { mode: 'inspect', page: extraction.page, candidates: { dom: {}, network: [] }, suggestedPlan: { fields: {}, schema: {} } };
  assert.deepEqual(await mock(json(inspection)).client.spa.inspect({ url: 'https://example.com' }), inspection);
  assert.deepEqual(await mock(json({ templates: [] })).client.spa.templates(), { templates: [] });
});
test('cloud list preserves account quotas, direct detail response and pagination', async () => {
  const response = { ok: true, data: [profile], pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 }, limit: 20, runningLimit: 1, runningCount: 0 };
  const { client, calls } = mock(json(response));
  assert.deepEqual(await client.cloudBrowsers.list({ page: 2, pageSize: 10 }), response);
  assert.equal(calls[0].url.endsWith('?page=2&pageSize=10'), true);
  assert.deepEqual(await mock(json(profile)).client.cloudBrowsers.get('browser-1'), profile);
  assert.deepEqual(await mock(json({ ok: true, id: 'browser-1' }, 201)).client.cloudBrowsers.create(), { ok: true, id: 'browser-1' });
});
test('cloud starts require a top-level proxy and pending stop stays pending', async () => {
  const { client, calls } = mock(json({ ok: true, runtime: { status: 'stopping' } }, 202));
  assert.throws(() => client.cloudBrowsers.start('browser-1', {}), TypeError);
  assert.throws(() => client.cloudBrowsers.launch({}), TypeError);
  assert.equal(calls.length, 0);
  assert.equal((await client.cloudBrowsers.stop('browser-1')).runtime.status, 'stopping');
  const running = mock(json({ ok: true, runtime: { status: 'running' } }));
  await running.client.cloudBrowsers.start('browser-1', { proxy: { server: 'http://proxy.example.com:8080' } });
  assert.equal(running.calls[0].body.proxy.server, 'http://proxy.example.com:8080');
});
test('failed cloud launch preserves profile id/runtime for cleanup and never retries', async () => {
  const { client, calls } = mock(json({ error: 'Startup timed out', code: 'CLOUD_RUNTIME_TIMEOUT', id: 'browser-1', runtime: { status: 'stopping' } }, 504));
  await assert.rejects(client.cloudBrowsers.launch({ proxy: { server: 'http://proxy.example.com:8080' } }), (e) => {
    assert.equal(e.id, 'browser-1');
    assert.equal(e.body.runtime.status, 'stopping');
    return true;
  });
  assert.equal(calls.length, 1);
});
test('cloud launch returns persistent profile rather than an ephemeral CDP session', async () => {
  const response = { ok: true, id: 'browser-1', source: 'launch', deleteOnStop: false, runtime: { status: 'running', connectUrl: 'https://example.com/viewer' } };
  assert.deepEqual(await mock(json(response, 201)).client.cloudBrowsers.launch({ proxy: { server: 'http://proxy.example.com:8080' }, tabs: ['https://example.com'] }), response);
});
