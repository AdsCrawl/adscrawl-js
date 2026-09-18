// npm run build && node examples/fingerprint.mjs
// Defaults to BrowserScan. Optionally pass a target URL and an output PNG path.
// In your own project, change the import to 'adscrawl'.
import { writeFile } from 'node:fs/promises';
import AdsCrawl from '../dist/esm/index.js';

const client = new AdsCrawl();
const server = process.env.ADSCRAWL_PROXY_SERVER;
const username = process.env.ADSCRAWL_PROXY_USERNAME;
const password = process.env.ADSCRAWL_PROXY_PASSWORD;
if (Boolean(username) !== Boolean(password)) {
  throw new Error('Set both proxy username and password, or neither.');
}
if (!server && (username || password)) {
  throw new Error('Set ADSCRAWL_PROXY_SERVER when supplying proxy credentials.');
}
const routing = server
  ? { proxy: username && password ? { server, username, password } : { server } }
  : { countryCode: 'GLOBAL' };

const png = await client.screenshot({
  url: process.argv[2] ?? 'https://www.browserscan.net/',
  ...routing,
  viewport: { width: 1440, height: 900 },
  fullPage: true,
  waitUntil: 'networkidle',
  timeoutMs: 60_000,
  userAgentMode: 'random',
  userAgentOs: 'windows',
  fingerprint: {
    webRtc: 'forward',
    webGl: 'random',
    webGpu: 'random',
    webGlImage: 'random',
    canvas: 'random',
    audioContext: 'random',
    clientRects: 'random',
    speechVoices: 'random',
    fonts: 'random',
    hardware: 'random',
    doNotTrack: 'random',
  },
}, { timeoutMs: 75_000 });

const output = process.argv[3] ?? 'browserscan.png';
await writeFile(output, png);
console.log(`Saved fingerprint-check screenshot to ${output}`);
