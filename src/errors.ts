export class AdsCrawlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AdsCrawlAPIError extends AdsCrawlError {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: unknown;
  readonly traceId: string | undefined;
  readonly requestId: string | undefined;
  /** Profile id returned by a failed launch, useful for cleanup. */
  readonly id: string | undefined;

  constructor(status: number, body: unknown, headers: Headers) {
    const data = isRecord(body) ? body : {};
    const message = typeof data.error === 'string' ? data.error : `AdsCrawl API returned HTTP ${status}`;
    super(message.slice(0, 2048));
    this.status = status;
    this.body = body;
    this.code = typeof data.code === 'string' ? data.code : undefined;
    this.id = typeof data.id === 'string' ? data.id : undefined;
    this.traceId = headers.get('x-trace-id') ?? (typeof data.traceId === 'string' ? data.traceId : undefined);
    this.requestId = headers.get('x-request-id') ?? undefined;
  }
}

export class AdsCrawlTimeoutError extends AdsCrawlError {
  constructor(readonly timeoutMs: number) {
    super(`AdsCrawl request timed out after ${timeoutMs}ms. Remote work may still be running; inspect sessions before retrying.`);
  }
}
export class AdsCrawlConnectionError extends AdsCrawlError {
  constructor() { super('Unable to complete the AdsCrawl request. Check your network and service availability.'); }
}
export class AdsCrawlResponseError extends AdsCrawlError {
  constructor(message = 'AdsCrawl returned an invalid or empty response.') { super(message); }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Redact known request secrets as well as credentials echoed by the service. */
export function redact(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') {
    let text = value;
    for (const secret of secrets) if (secret) text = text.split(secret).join('[REDACTED]');
    return text
      .replace(/([?&](?:token|controlToken|apiKey|api_key)=)[^&#\s"<>]+/gi, '$1[REDACTED]')
      .replace(/(\b(?:https?|socks5):\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@');
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      /^(api[-_]?key|x-api-key|authorization|password|username|cookies?|token|controlToken|webSocketDebuggerUrl|cdpBaseUrl|controlUrl|connectUrl)$/i.test(key)
        ? '[REDACTED]' : redact(item, secrets),
    ]));
  }
  return value;
}

export function collectSecrets(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectSecrets);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    if (key === 'cookies' && Array.isArray(item)) {
      return item.flatMap((cookie) => isRecord(cookie) && typeof cookie.value === 'string' ? [cookie.value] : []);
    }
    if (/^(password|username|token|controlToken)$/i.test(key) && typeof item === 'string') return [item];
    return collectSecrets(item);
  });
}
