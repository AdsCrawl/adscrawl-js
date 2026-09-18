export interface RequestOptions {
  /** HTTP deadline, including reading the response body. Default: 90 seconds. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AdsCrawlOptions {
  /** Defaults to ADSCRAWL_API_KEY in Node.js. Keep it on the server. */
  apiKey?: string;
  /** Defaults to ADSCRAWL_BASE_URL, ADSCRAWL_API_URL, or https://api.adscrawl.net. */
  baseURL?: string;
  timeoutMs?: number;
  /** Optional fetch implementation for testing or custom networking. */
  fetch?: typeof globalThis.fetch;
}

export type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle';
export interface Viewport { width: number; height: number }
export interface Geolocation { latitude: number; longitude: number }

type ProxyAddress =
  | { server: string; protocol?: never; host?: never; port?: never }
  | { server?: never; protocol: 'http' | 'socks5'; host: string; port: number | string };
type ProxyCredentials =
  | { username: string; password: string }
  | { username?: never; password?: never };
export type Proxy = ProxyAddress & ProxyCredentials;

/** Custom and managed proxies are mutually exclusive. */
export type Routing =
  | { proxy: Proxy; countryCode?: never }
  | { proxy?: never; countryCode?: string };

export interface Fingerprint {
  webRtc?: 'forward' | 'real' | 'disabled';
  webGl?: 'random' | 'real';
  webGpu?: 'random' | 'real' | 'disabled';
  webGlImage?: 'random' | 'real';
  canvas?: 'random' | 'real';
  audioContext?: 'random' | 'real';
  clientRects?: 'random' | 'real';
  speechVoices?: 'random' | 'real';
  fonts?: 'random' | 'real';
  hardware?: 'random' | 'real';
  /** Legacy explicit hardware overrides accepted by cloud browser runtimes (1–64). */
  hardwareConcurrency?: number;
  deviceMemory?: number;
  doNotTrack?: 'random' | 'enabled' | 'disabled';
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean | string | number;
  httpOnly?: boolean | string | number;
  hostOnly?: boolean | string | number;
  sameSite?: string;
  session?: boolean | string | number;
  expirationDate?: number;
  expires?: number;
  expiry?: number;
}

export type BrowserSettings = Routing & {
  viewport?: Viewport;
  locale?: string;
  timezoneId?: string;
  geolocation?: Geolocation;
  userAgent?: string;
  userAgentMode?: 'custom' | 'random';
  userAgentOs?: 'windows' | 'macos';
  fingerprint?: Fingerprint;
  cookies?: Cookie[];
};

export type PageOptions = BrowserSettings & {
  url: string;
  waitUntil?: WaitUntil;
  /** Server navigation/task timeout, separate from RequestOptions.timeoutMs. */
  timeoutMs?: number;
};

export type ContentMode = 'html' | 'markdown' | 'json';
export type HtmlOptions = PageOptions & { contentMode?: ContentMode; selector?: string };
export type ContentOptions = PageOptions & { selector?: string };
export type ScreenshotOptions = PageOptions & { fullPage?: boolean; selector?: string };

export interface Article {
  title: string;
  byline: string | null;
  excerpt: string | null;
  siteName: string | null;
  lang: string | null;
  dir: string | null;
  content: string;
  textContent: string;
  length: number;
  publishedTime: string | null;
}

export interface WaitFor { selector?: string; text?: string; timeoutMs?: number }
export type Action =
  | { type: 'wait'; milliseconds: number }
  | { type: 'waitForSelector'; selector: string; timeoutMs?: number }
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'press'; selector: string; key: string }
  | { type: 'scroll'; selector?: string; x?: number; y?: number };

export type Field = (
  | { source: 'dom'; selector: string; value?: 'text' | 'html'; attribute?: never; multiple?: boolean }
  | { source: 'dom'; selector: string; value: 'attribute'; attribute: string; multiple?: boolean }
  | { source: 'network'; urlIncludes: string; path: string }
) & {
  parse?: 'string' | 'number' | 'integer' | 'boolean' | 'json';
  regex?: string;
  required?: boolean;
};

export type SpaOptions = BrowserSettings & {
  url?: string;
  keyword?: string;
  template?: string;
  parameters?: Record<string, unknown>;
  waitUntil?: WaitUntil;
  waitFor?: WaitFor;
  actions?: Action[];
  fields?: Record<string, Field>;
  schema?: Record<string, string | Field> | { properties: Record<string, string | Field> };
  timeoutMs?: number;
};

export interface ExtractionResult<T = Record<string, unknown>> {
  mode: 'extract';
  page: { url: string; title: string };
  /** A generic describes expected data; it does not validate that data at runtime. */
  data: T;
  missingFields: string[];
  source?: 'sunbrowser' | 'cache';
  cached?: boolean;
  stale?: boolean;
  collectedAt?: string;
  attempts?: number;
}
export interface InspectionResult {
  mode: 'inspect';
  page: { url: string; title: string };
  candidates: { dom: Record<string, unknown>; network: unknown[] };
  suggestedPlan: { fields: Record<string, Field>; schema: Record<string, unknown> };
}
export interface ExtractionTemplate {
  id: string;
  name: string;
  description: string;
  urlPattern: string;
  exampleUrl: string;
  version: number;
  updatedAt: string;
  outputFields: string[];
  waitUntil?: WaitUntil;
  input?: { type: string; example: string; urlTemplate?: string };
  catalog?: { category: string; featured: boolean; keywords: string[] };
}
export interface TemplateList { templates: ExtractionTemplate[] }

export interface CreateSessionOptions {
  idleTimeoutMs?: number;
  maxSessionMs?: number;
  browserSettings?: BrowserSettings;
}
export interface CdpSession {
  sessionId: string;
  expiresAt: string;
  /** Token-bearing URL. Pass directly to Playwright connectOverCDP. Do not log. */
  cdpBaseUrl: string;
}
export interface SessionList { ok: true; data: CdpSession[] }
export interface CdpVersion {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl: string;
}
export interface LiveToken {
  ok: true;
  /** Single-use control token URL, valid for 30 seconds. Do not log. */
  controlUrl: string;
  /** Unix milliseconds. */
  expiresAt: number;
}
export interface OkResult { ok: true }

export interface CloudRuntime {
  runtimeKind?: 'neko' | 'worker_cdp';
  status: 'starting' | 'running' | 'stopping' | 'stopped';
  sessionId?: string;
  expiresAt?: string;
  /** Requires the profile owner's login session; closing it does not stop billing. */
  connectUrl?: string;
  cdpBaseUrl?: string;
}
export interface CloudBrowser {
  id: string;
  source: 'manual' | 'launch';
  deleteOnStop: boolean;
  remark: string;
  browserSettings: BrowserSettings;
  proxyDisplayIp: string | null;
  proxyDisplayRegion: string | null;
  lastOpenedAt: string | null;
  updatedAt: string;
  runtime: CloudRuntime;
  traceId?: string;
  deleted?: boolean;
}
export interface CloudBrowserList {
  ok: true;
  data: CloudBrowser[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  limit: number;
  runningLimit: number;
  runningCount: number;
  traceId?: string;
}
export interface ListCloudBrowsersOptions { page?: number; pageSize?: number }
export interface CreateCloudBrowserOptions { remark?: string; browserSettings?: BrowserSettings }
export interface CreatedCloudBrowser { ok: true; id: string; traceId?: string }
export interface StartCloudBrowserOptions {
  /** Required on EVERY API-key start, even if saved in the profile. */
  proxy: Proxy;
  cookies?: Cookie[];
  fingerprint?: Fingerprint;
}
export interface LaunchCloudBrowserOptions extends StartCloudBrowserOptions {
  tabs?: (string | { url: string; active?: boolean })[];
}
export interface CloudBrowserRunResult {
  ok: true;
  /** stopping means shutdown is pending; query until stopped. */
  runtime: CloudRuntime;
  source?: 'manual' | 'launch';
  deleteOnStop?: boolean;
  deleted?: boolean;
  traceId?: string;
}
export interface LaunchedCloudBrowser extends CloudBrowserRunResult {
  id: string;
  source: 'launch';
  deleteOnStop: false;
}
