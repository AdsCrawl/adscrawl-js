import { writeFile } from 'node:fs/promises';
import AdsCrawl from '../dist/esm/index.js';

const client = new AdsCrawl();
const png = await client.screenshot({ url: process.argv[2] ?? 'https://example.com', fullPage: true });
await writeFile(process.argv[3] ?? 'page.png', png);
