# AdsCrawl JavaScript / TypeScript SDK

Turn a URL into rendered HTML, readable Markdown, structured data, or a PNG screenshot. When your workflow needs interaction, connect a remote browser with Playwright or Puppeteer.

[Website](https://www.adscrawl.net/?utm_source=github&utm_medium=sdk&utm_campaign=adscrawl-js) · [API documentation](https://www.adscrawl.net/docs/) · [Get an API key](https://app.adscrawl.net/register/?utm_source=npm&utm_medium=sdk&utm_campaign=adscrawl-js) · [中文](./README.zh-CN.md)

- TypeScript types and editor autocomplete.
- Node.js 20+, ESM and CommonJS.
- Zero runtime dependencies; uses native `fetch`.
- Explicit deadlines, cancellation, and typed errors.
- No automatic retries of metered requests or browser creation.

## Install

```bash
npm install adscrawl
```

## Your first request

[Create an account](https://app.adscrawl.net/register/?utm_source=npm&utm_medium=sdk&utm_campaign=adscrawl-js) and create an API key in the dashboard. Set `ADSCRAWL_API_KEY` in your server environment, then:

```ts
import AdsCrawl from 'adscrawl';

const client = new AdsCrawl();
const markdown = await client.markdown({
  url: 'https://www.adscrawl.net',
  waitUntil: 'domcontentloaded',
});
console.log(markdown);
```

You can also pass `new AdsCrawl({ apiKey: process.env.ADSCRAWL_API_KEY })`. Use this SDK on your server; do not expose your API key in frontend bundles.

CommonJS:

```js
const { AdsCrawl } = require('adscrawl');
const client = new AdsCrawl();
```

## Rendered content and screenshots

```ts
import { writeFile } from 'node:fs/promises';

const html = await client.html({ url: 'https://www.adscrawl.net' });
const article = await client.article({ url: 'https://www.adscrawl.net' });
console.log(article.title, article.textContent);

const png = await client.screenshot({
  url: 'https://www.adscrawl.net',
  viewport: { width: 1440, height: 900 },
  fullPage: true,
  waitUntil: 'load',
});
await writeFile('page.png', png);
```

`html()` returns a string for `contentMode: 'html'` (the default) or `'markdown'`, and an `Article` for `'json'`. `markdown()` and `article()` are conveniences for those modes. `screenshot()` returns a `Uint8Array` containing a PNG.

Pass `selector` to extract an element or capture its screenshot. Page operations also accept `locale`, `timezoneId`, `geolocation`, `cookies`, `fingerprint`, and User-Agent settings. Use a custom `proxy` **or** managed `countryCode`, such as `US` or `GLOBAL`; they are mutually exclusive.

```ts
const markdown = await client.markdown({
  url: 'https://www.adscrawl.net',
  countryCode: 'US',
  userAgentMode: 'random',
  userAgentOs: 'windows',
});
```

## Structured extraction

List available templates and their parameters:

```ts
const { templates } = await client.spa.templates();

const result = await client.spa.extract({
  template: 'google-trends-explore',
  keyword: 'playwright,puppeteer',
});
console.log(result.data);
```

For your own page, specify DOM or network fields. A generic describes the expected output; it does not validate your custom data at runtime. Always check `missingFields`.

```ts
const result = await client.spa.extract<{ title: string }>({
  url: 'https://www.adscrawl.net',
  fields: {
    title: { source: 'dom', selector: 'h1', value: 'text', required: true },
  },
});
console.log(result.data.title);

const inspection = await client.spa.inspect({ url: 'https://www.adscrawl.net' });
```

Use `actions` for clicks, input, scrolling, and waits, and `waitFor` for a visible selector or text. See the [API reference](https://www.adscrawl.net/docs/browser-tasks/) for template-specific requirements.

## Remote browsers with Playwright

Install your preferred automation library separately:

```bash
npm install playwright-core
```

```ts
import { chromium } from 'playwright-core';

const session = await client.cdp.create({
  idleTimeoutMs: 600_000,
  maxSessionMs: 3_600_000,
  browserSettings: { viewport: { width: 1440, height: 900 } },
});

try {
  const browser = await chromium.connectOverCDP(session.cdpBaseUrl);
  const context = browser.contexts()[0] ?? await browser.newContext();
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto('https://www.adscrawl.net');
  console.log(await page.title());
} finally {
  await client.cdp.close(session.sessionId);
}
```

The creation response contains `sessionId`, `expiresAt`, and `cdpBaseUrl`. It does **not** contain a WebSocket URL. For Puppeteer, use discovery:

```ts
import puppeteer from 'puppeteer-core';

const session = await client.cdp.create();
try {
  const version = await client.cdp.getVersion(session);
  const browser = await puppeteer.connect({
    browserWSEndpoint: version.webSocketDebuggerUrl,
  });
  // Use the browser here.
  await browser.disconnect();
} finally {
  await client.cdp.close(session.sessionId);
}
```

`cdp.list()` returns `{ ok, data }`. `cdp.liveToken(sessionId)` returns a single-use live-control URL valid for 30 seconds. Treat all connection URLs as secrets and do not log them.

## Persistent cloud browsers

Cloud browser profiles retain their configuration after stop. API-key starts require an explicit, top-level custom proxy on **every** start, even when a proxy was saved in the profile.

```ts
const { id } = await client.cloudBrowsers.create({ remark: 'My workflow' });
try {
  await client.cloudBrowsers.start(id, {
    proxy: { server: 'http://your-proxy-host:8080' },
  });
  const profile = await client.cloudBrowsers.get(id);
  // profile.runtime.connectUrl opens the interactive browser in an
  // authenticated browser signed in as the profile owner.
} finally {
  const result = await client.cloudBrowsers.stop(id);
  // If runtime.status is 'stopping', query until 'stopped' is confirmed.
  // See examples/cloud-browser.mjs for bounded cleanup.
}
```

`cloudBrowsers.launch({ proxy, tabs?, cookies?, fingerprint? })` creates a persistent profile and starts it in one request. Failed launches can return a profile id in `AdsCrawlAPIError.id`; inspect and stop that profile. If no id was received, inspect `cloudBrowsers.list()` before repeating the launch.

`cloudBrowsers.list({ page?, pageSize? })` includes pagination and saved/running quotas. A stop response with `runtime.status: 'stopping'` means shutdown is pending and quota is still reserved. Closing the viewer does not stop billing. The SDK covers API-key endpoints; profile configuration `PATCH`/`DELETE` and viewer authentication require a dashboard session and are not included.

## Configuration, deadlines, and cancellation

```ts
const client = new AdsCrawl({
  apiKey: process.env.ADSCRAWL_API_KEY,
  baseURL: 'https://api.adscrawl.net',
  timeoutMs: 90_000,
  // fetch: customFetch,
});

const controller = new AbortController();
const result = await client.markdown(
  { url: 'https://www.adscrawl.net', timeoutMs: 60_000 }, // Server task timeout.
  { timeoutMs: 75_000, signal: controller.signal }, // HTTP deadline / cancellation.
);
```

The API key defaults to `ADSCRAWL_API_KEY`. The API origin defaults to `ADSCRAWL_BASE_URL`, then `ADSCRAWL_API_URL`, then `https://api.adscrawl.net`. HTTP deadlines cover both the request and reading its response. Ordinary calls default to 90 seconds; `cloudBrowsers.launch()` defaults to 195 seconds to allow startup and server cleanup unless you set a client or per-call deadline. For long tasks, set an HTTP deadline greater than the server task timeout. Cancellation or a deadline does not prove remote work stopped.

## Errors

```ts
import { AdsCrawlAPIError, AdsCrawlTimeoutError } from 'adscrawl';

try {
  await client.markdown({ url: 'https://www.adscrawl.net' });
} catch (error) {
  if (error instanceof AdsCrawlAPIError) {
    console.error(error.status, error.code, error.traceId);
    // error.body contains the service response with credentials redacted.
  } else if (error instanceof AdsCrawlTimeoutError) {
    // Inspect existing sessions/profiles before retrying browser creation.
  } else {
    throw error;
  }
}
```

API errors preserve HTTP `status`, stable `code`, redacted `body`, `traceId`, and `requestId` when available. Network failures use `AdsCrawlConnectionError`; invalid/empty responses use `AdsCrawlResponseError`. Caller cancellation preserves the `AbortSignal` reason. Requests are never automatically retried. See [official status/error descriptions](https://www.adscrawl.net/docs/browser-tasks/).

## Develop and release

```bash
npm ci
npm run check
npm pack --dry-run
```

Tests use fake credentials, mocked API responses, and a local HTTP server. They do not consume AdsCrawl credits. Runnable examples are in [`examples/`](./examples/). See [`RELEASING.md`](./RELEASING.md) for first publish and GitHub Actions trusted publishing.

## License

MIT
