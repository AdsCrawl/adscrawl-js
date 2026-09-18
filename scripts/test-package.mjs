import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'adscrawl-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmOptions = { cwd: root, encoding: 'utf8', env: { ...process.env, npm_config_cache: join(temp, 'cache') } };
try {
  const output = execFileSync(npm, ['pack', '--json', '--pack-destination', temp], npmOptions);
  // npm may print prepack lifecycle output before the JSON result.
  const [pack] = JSON.parse(output.slice(output.indexOf('[\n')));
  const files = pack.files.map((file) => file.path);
  for (const file of files) {
    assert.ok(file.startsWith('dist/') || ['package.json', 'README.md', 'README.zh-CN.md', 'LICENSE'].includes(file), `Unexpected packed file: ${file}`);
  }
  assert.ok(files.includes('dist/esm/index.d.ts'));
  assert.ok(files.includes('dist/cjs/index.d.ts'));
  writeFileSync(join(temp, 'package.json'), '{"private":true,"type":"module"}\n');
  execFileSync(npm, ['install', join(temp, pack.filename), '--ignore-scripts', '--offline', '--no-audit', '--no-fund'],
    { ...npmOptions, cwd: temp, stdio: 'pipe' });
  const esm = `import SDK, { AdsCrawl } from 'adscrawl'; import assert from 'node:assert/strict'; assert.equal(SDK, AdsCrawl); assert.equal(typeof AdsCrawl, 'function');`;
  const cjs = `const { AdsCrawl, default: SDK } = require('adscrawl'); require('node:assert/strict').equal(SDK, AdsCrawl);`;
  execFileSync(process.execPath, ['--input-type=module', '-e', esm], { cwd: temp, stdio: 'inherit' });
  execFileSync(process.execPath, ['--input-type=commonjs', '-e', cjs], { cwd: temp, stdio: 'inherit' });
  const types = `import AdsCrawl, { type Article, type HtmlOptions } from 'adscrawl';
const client = new AdsCrawl({ apiKey: 'test-only' });
const text: Promise<string> = client.html({ url: 'https://example.com' });
const article: Promise<Article> = client.html({ url: 'https://example.com', contentMode: 'json' });
const params: HtmlOptions = { url: 'https://example.com', contentMode: Math.random() ? 'html' : 'json' };
const union: Promise<string | Article> = client.html(params);
const png: Promise<Uint8Array> = client.screenshot({ url: 'https://example.com' });
async function extract() {
  const result = await client.spa.extract<{ title: string }>({ url: 'https://example.com' });
  const title: string = result.data.title;
}
// @ts-expect-error proxy and countryCode are mutually exclusive
client.markdown({ url: 'https://example.com', proxy: { server: 'http://example.com:8080' }, countryCode: 'US' });
// @ts-expect-error a top-level proxy is mandatory for API key starts
client.cloudBrowsers.start('browser-1', {});
// @ts-expect-error a proxy password requires a username
client.cloudBrowsers.launch({ proxy: { server: 'http://example.com:8080', password: 'secret' } });
`;
  writeFileSync(join(temp, 'consumer.mts'), types);
  writeFileSync(join(temp, 'consumer.cts'), types);
  const tsc = join(root, 'node_modules/typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--target', 'ES2022', '--lib', 'ES2022,DOM', 'consumer.mts', 'consumer.cts'], { cwd: temp, stdio: 'inherit' });
  const metadata = JSON.parse(readFileSync(join(temp, 'node_modules/adscrawl/package.json'), 'utf8'));
  assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0);
  console.log(`Packed adscrawl@${metadata.version}: ${files.length} files, ${pack.size} bytes. Clean install, ESM, CommonJS, and TypeScript consumers passed.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
