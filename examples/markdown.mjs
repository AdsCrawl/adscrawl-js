// From this repository: npm run build && node examples/markdown.mjs
// In your own project, change the import to 'adscrawl'.
import AdsCrawl from '../dist/esm/index.js';

const client = new AdsCrawl();
console.log(await client.markdown({
  url: process.argv[2] ?? 'https://example.com',
  waitUntil: 'domcontentloaded',
}));
