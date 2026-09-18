import {
  AdsCrawlAPIError, AdsCrawlConnectionError, AdsCrawlResponseError, AdsCrawlTimeoutError,
  collectSecrets, isRecord, redact,
} from './errors.js';
import type {
  AdsCrawlOptions, Article, CdpSession, CdpVersion, CloudBrowser, CloudBrowserList,
  CloudBrowserRunResult, ContentOptions, CreatedCloudBrowser, CreateCloudBrowserOptions,
  CreateSessionOptions, ExtractionResult, HtmlOptions, InspectionResult, LaunchedCloudBrowser,
  LaunchCloudBrowserOptions, ListCloudBrowsersOptions, LiveToken, OkResult, RequestOptions,
  ScreenshotOptions, SessionList, SpaOptions, StartCloudBrowserOptions, TemplateList,
} from './types.js';

type Guard = (value: unknown) => boolean;
const record: Guard = isRecord;
const ok: Guard = (v) => isRecord(v) && v.ok === true;
const session: Guard = (v) => isRecord(v) && typeof v.sessionId === 'string'
  && typeof v.expiresAt === 'string' && typeof v.cdpBaseUrl === 'string';
const runtime: Guard = (v) => isRecord(v) && ['starting', 'running', 'stopping', 'stopped'].includes(String(v.status));
const runResult: Guard = (v) => ok(v) && isRecord(v) && runtime(v.runtime);
const cloud: Guard = (v) => isRecord(v) && typeof v.id === 'string' && runtime(v.runtime) && isRecord(v.browserSettings);
const page: Guard = (v) => isRecord(v) && typeof v.url === 'string' && typeof v.title === 'string';

function env(key: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
}
function deadline(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new TypeError('timeoutMs must be a positive integer no greater than 2147483647.');
  }
  return value;
}
function idPath(id: string): string {
  if (typeof id !== 'string' || !id.trim() || id === '.' || id === '..') throw new TypeError('A non-empty resource id is required.');
  return encodeURIComponent(id);
}
function validateRouting(body: unknown): void {
  if (!isRecord(body)) return;
  if (body.proxy !== undefined && body.countryCode !== undefined) throw new TypeError('proxy and countryCode cannot be combined.');
  if (isRecord(body.browserSettings)) validateRouting(body.browserSettings);
}

export class AdsCrawl {
  #apiKey: string;
  #baseURL: string;
  #fetch: typeof globalThis.fetch;
  #timeoutMs: number;
  #customTimeout: boolean;

  constructor(options: AdsCrawlOptions = {}) {
    const apiKey = options.apiKey ?? env('ADSCRAWL_API_KEY');
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new TypeError('Set ADSCRAWL_API_KEY or pass apiKey to AdsCrawl.');
    if (/[\r\n]/.test(apiKey)) throw new TypeError('apiKey must not contain line breaks.');
    this.#apiKey = apiKey.trim();
    let url: URL;
    try { url = new URL(options.baseURL ?? env('ADSCRAWL_BASE_URL') ?? env('ADSCRAWL_API_URL') ?? 'https://api.adscrawl.net'); }
    catch { throw new TypeError('baseURL must be a valid HTTP(S) URL.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError('baseURL must be an HTTP(S) URL without credentials, query, or fragment.');
    }
    this.#baseURL = url.toString().replace(/\/+$/, '');
    const fetcher = options.fetch ?? globalThis.fetch;
    if (typeof fetcher !== 'function') throw new TypeError('A fetch implementation is required (Node.js 20+).');
    this.#fetch = fetcher.bind(globalThis);
    this.#timeoutMs = deadline(options.timeoutMs ?? 90_000);
    this.#customTimeout = options.timeoutMs !== undefined;
  }

  html(params: HtmlOptions & { contentMode: 'json' }, options?: RequestOptions): Promise<Article>;
  html(params: HtmlOptions & { contentMode?: 'html' | 'markdown' }, options?: RequestOptions): Promise<string>;
  html(params: HtmlOptions, options?: RequestOptions): Promise<string | Article>;
  async html(params: HtmlOptions, options: RequestOptions = {}): Promise<string | Article> {
    if (params.contentMode === 'json') {
      return this.#json<Article>('POST', '/html', params, options, (v) => isRecord(v)
        && typeof v.title === 'string' && typeof v.content === 'string'
        && typeof v.textContent === 'string' && typeof v.length === 'number');
    }
    return this.#request('POST', '/html', params, options, async (response) => {
      const text = await response.text();
      if (!text.trim()) throw new AdsCrawlResponseError('AdsCrawl returned empty page content.');
      return text;
    });
  }

  markdown(params: ContentOptions, options?: RequestOptions): Promise<string> {
    return this.html({ ...params, contentMode: 'markdown' }, options);
  }
  article(params: ContentOptions, options?: RequestOptions): Promise<Article> {
    return this.html({ ...params, contentMode: 'json' }, options);
  }
  screenshot(params: ScreenshotOptions, options: RequestOptions = {}): Promise<Uint8Array> {
    return this.#request('POST', '/screenshot', params, options, async (response) => {
      const bytes = new Uint8Array(await response.arrayBuffer());
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (!signature.every((byte, i) => bytes[i] === byte)) throw new AdsCrawlResponseError('AdsCrawl returned an invalid PNG screenshot.');
      return bytes;
    });
  }

  readonly spa = {
    templates: (options: RequestOptions = {}): Promise<TemplateList> =>
      this.#json('GET', '/spa-extract/templates', undefined, options, (v) => isRecord(v)
        && Array.isArray(v.templates) && v.templates.every((t) => isRecord(t) && typeof t.id === 'string' && typeof t.name === 'string')),
    extract: <T = Record<string, unknown>>(params: SpaOptions, options: RequestOptions = {}): Promise<ExtractionResult<T>> =>
      this.#json('POST', '/spa-extract', { ...params, mode: 'extract' }, options, (v) => isRecord(v)
        && v.mode === 'extract' && page(v.page) && isRecord(v.data) && Array.isArray(v.missingFields)),
    inspect: (params: SpaOptions, options: RequestOptions = {}): Promise<InspectionResult> =>
      this.#json('POST', '/spa-extract', { ...params, mode: 'inspect' }, options, (v) => isRecord(v)
        && v.mode === 'inspect' && page(v.page) && isRecord(v.candidates) && isRecord(v.suggestedPlan)),
  };

  readonly cdp = {
    create: (params: CreateSessionOptions = {}, options: RequestOptions = {}): Promise<CdpSession> =>
      this.#json('POST', '/cdp/sessions', params, options, session),
    list: (options: RequestOptions = {}): Promise<SessionList> =>
      this.#json('GET', '/cdp/sessions', undefined, options, (v) => ok(v) && isRecord(v) && Array.isArray(v.data) && v.data.every(session)),
    close: (sessionId: string, options: RequestOptions = {}): Promise<OkResult> =>
      this.#json('DELETE', `/cdp/sessions/${idPath(sessionId)}`, undefined, options, ok),
    getVersion: (value: CdpSession, options: RequestOptions = {}): Promise<CdpVersion> => {
      let url: URL;
      try { url = new URL(value.cdpBaseUrl); }
      catch { throw new TypeError('The session must contain a valid cdpBaseUrl.'); }
      const expected = new URL(`${this.#baseURL}/cdp/sessions/${idPath(value.sessionId)}`);
      if (url.origin !== expected.origin || url.pathname.replace(/\/$/, '') !== expected.pathname
        || url.username || url.password || !url.searchParams.get('token')) {
        throw new TypeError('cdpBaseUrl must belong to this API origin and session and include a data token.');
      }
      const token = url.searchParams.get('token')!;
      const path = `/cdp/sessions/${idPath(value.sessionId)}/json/version?${new URLSearchParams({ token })}`;
      return this.#json('GET', path, undefined, options, (v) => isRecord(v)
        && typeof v.webSocketDebuggerUrl === 'string' && typeof v.Browser === 'string', false, [token]);
    },
    liveToken: (sessionId: string, options: RequestOptions = {}): Promise<LiveToken> => {
      idPath(sessionId);
      return this.#json('POST', '/cdp/live-token', { sessionId }, options, (v) => ok(v)
        && isRecord(v) && typeof v.controlUrl === 'string' && typeof v.expiresAt === 'number');
    },
  };

  /** API-key operations only. Configuration PATCH/DELETE and viewer access require a dashboard session. */
  readonly cloudBrowsers = {
    list: (params: ListCloudBrowsersOptions = {}, options: RequestOptions = {}): Promise<CloudBrowserList> => {
      const query = new URLSearchParams();
      if (params.page !== undefined) query.set('page', String(params.page));
      if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
      return this.#json('GET', `/cloud-browsers${query.size ? `?${query}` : ''}`, undefined, options,
        (v) => ok(v) && isRecord(v) && Array.isArray(v.data) && v.data.every(cloud)
          && isRecord(v.pagination) && typeof v.limit === 'number'
          && typeof v.runningLimit === 'number' && typeof v.runningCount === 'number');
    },
    create: (params: CreateCloudBrowserOptions = {}, options: RequestOptions = {}): Promise<CreatedCloudBrowser> =>
      this.#json('POST', '/cloud-browsers', params, options, (v) => ok(v) && isRecord(v) && typeof v.id === 'string'),
    get: (id: string, options: RequestOptions = {}): Promise<CloudBrowser> =>
      this.#json('GET', `/cloud-browsers/${idPath(id)}`, undefined, options, cloud),
    start: (id: string, params: StartCloudBrowserOptions, options: RequestOptions = {}): Promise<CloudBrowserRunResult> => {
      this.#requireProxy(params);
      return this.#json('POST', `/cloud-browsers/${idPath(id)}/start`, params, options, runResult);
    },
    stop: (id: string, options: RequestOptions = {}): Promise<CloudBrowserRunResult> =>
      this.#json('POST', `/cloud-browsers/${idPath(id)}/stop`, undefined, options, runResult),
    launch: (params: LaunchCloudBrowserOptions, options: RequestOptions = {}): Promise<LaunchedCloudBrowser> => {
      this.#requireProxy(params);
      const launchOptions = { ...options, timeoutMs: options.timeoutMs ?? (this.#customTimeout ? this.#timeoutMs : 195_000) };
      return this.#json('POST', '/cloud-browsers/launch', params, launchOptions,
        (v) => runResult(v) && isRecord(v) && typeof v.id === 'string' && v.source === 'launch' && v.deleteOnStop === false);
    },
  };

  #requireProxy(params: unknown): void {
    if (!isRecord(params) || !isRecord(params.proxy)) throw new TypeError('Cloud browser starts and launches require an explicit top-level proxy.');
  }

  #json<T>(method: string, path: string, body: unknown, options: RequestOptions, guard: Guard = record,
    authenticate = true, secrets: string[] = []): Promise<T> {
    return this.#request(method, path, body, options, async (response) => {
      let value: unknown;
      try { value = await response.json(); }
      catch (error) {
        if (error instanceof SyntaxError) throw new AdsCrawlResponseError('AdsCrawl returned invalid JSON.');
        throw error;
      }
      if (!guard(value)) throw new AdsCrawlResponseError('AdsCrawl returned an unexpected JSON response shape.');
      return value as T;
    }, authenticate, secrets);
  }

  async #request<T>(method: string, path: string, body: unknown, options: RequestOptions,
    decode: (response: Response) => Promise<T>, authenticate = true, additionalSecrets: string[] = []): Promise<T> {
    validateRouting(body);
    const timeoutMs = deadline(options.timeoutMs ?? this.#timeoutMs);
    options.signal?.throwIfAborted();
    const controller = new AbortController();
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const secrets = [this.#apiKey, ...collectSecrets(body), ...additionalSecrets];
    try {
      const headers: Record<string, string> = { 'user-agent': 'adscrawl-js' };
      if (authenticate) headers['x-api-key'] = this.#apiKey;
      const init: RequestInit = { method, headers, signal: controller.signal, redirect: 'error' };
      if (body !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const response = await this.#fetch(`${this.#baseURL}${path}`, init);
      if (!response.ok) {
        const text = await response.text();
        let value: unknown = text;
        try { value = JSON.parse(text); } catch { /* Some gateways return plain text. */ }
        const safeHeaders = new Headers();
        for (const name of ['x-trace-id', 'x-request-id']) {
          const value = response.headers.get(name);
          if (value !== null) safeHeaders.set(name, String(redact(value, secrets)));
        }
        throw new AdsCrawlAPIError(response.status, redact(value, secrets), safeHeaders);
      }
      return await decode(response);
    } catch (error) {
      if (timedOut) throw new AdsCrawlTimeoutError(timeoutMs);
      if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Request aborted', 'AbortError');
      if (error instanceof AdsCrawlAPIError || error instanceof AdsCrawlResponseError) throw error;
      throw new AdsCrawlConnectionError();
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }
}
