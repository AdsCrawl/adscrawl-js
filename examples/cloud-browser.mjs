import { setTimeout as delay } from 'node:timers/promises';
import AdsCrawl, { AdsCrawlAPIError, AdsCrawlConnectionError, AdsCrawlTimeoutError } from '../dist/esm/index.js';

const client = new AdsCrawl();
const server = process.env.ADSCRAWL_PROXY_SERVER;
if (!server) throw new Error('Set ADSCRAWL_PROXY_SERVER to a reachable http:// or socks5:// proxy URL with an explicit port.');
const username = process.env.ADSCRAWL_PROXY_USERNAME;
const password = process.env.ADSCRAWL_PROXY_PASSWORD;
if (Boolean(username) !== Boolean(password)) throw new Error('Set both proxy username and password, or neither.');
const proxy = username ? { server, username, password } : { server };

// Stop is safe to repeat. A pending/failed stop is not confirmation of shutdown.
async function stopAndWait(id) {
  const end = Date.now() + 120_000;
  while (Date.now() < end) {
    try {
      const options = { timeoutMs: Math.min(10_000, end - Date.now()) };
      if ((await client.cloudBrowsers.stop(id, options)).runtime.status === 'stopped') return;
      const remaining = end - Date.now();
      if (remaining <= 0) break;
      if ((await client.cloudBrowsers.get(id, { timeoutMs: Math.min(10_000, remaining) })).runtime.status === 'stopped') return;
    } catch (error) {
      const retryable = error instanceof AdsCrawlTimeoutError || error instanceof AdsCrawlConnectionError
        || (error instanceof AdsCrawlAPIError && (error.code === 'CDP_SESSION_STARTING' || error.status >= 500));
      if (!retryable) throw error;
    }
    if (Date.now() < end) await delay(Math.min(2000, end - Date.now()));
  }
  throw new Error(`Stop unconfirmed for ${id}. Inspect the profile and retry stop; quota may still be reserved.`);
}

let id;
try {
  const launched = await client.cloudBrowsers.launch({ proxy, tabs: ['https://www.adscrawl.net'] });
  id = launched.id;
  console.log({ id, status: launched.runtime.status });
  // Use the browser here. Do not log connection URLs.
} catch (error) {
  if (error instanceof AdsCrawlAPIError) id = error.id;
  if (!id) console.error('No profile id received. Inspect cloudBrowsers.list() before repeating launch.');
  throw error;
} finally {
  if (id) await stopAndWait(id);
}
