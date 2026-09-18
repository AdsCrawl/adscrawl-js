// npm install --no-save playwright-core
import { chromium } from 'playwright-core';
import AdsCrawl from '../dist/esm/index.js';

const client = new AdsCrawl();
const session = await client.cdp.create();
try {
  const browser = await chromium.connectOverCDP(session.cdpBaseUrl);
  const context = browser.contexts()[0] ?? await browser.newContext();
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(process.argv[2] ?? 'https://www.adscrawl.net');
  console.log(await page.title());
} finally {
  await client.cdp.close(session.sessionId);
}
