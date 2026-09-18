# AdsCrawl JavaScript / TypeScript SDK

用几行代码把网页转换为 HTML、Markdown、结构化数据或 PNG 截图。需要点击、输入和登录流程时，可连接远程浏览器，使用 Playwright 或 Puppeteer。

[官网](https://www.adscrawl.net/zh/?utm_source=github&utm_medium=sdk&utm_campaign=adscrawl-js) · [API 文档](https://www.adscrawl.net/docs/) · [获取 API key](https://app.adscrawl.net/register/?utm_source=npm&utm_medium=sdk&utm_campaign=adscrawl-js) · [English](./README.md)

支持 Node.js 20+、TypeScript、ESM 和 CommonJS，零运行时依赖。

## 安装与快速开始

```bash
npm install adscrawl
```

在服务端环境变量中设置 `ADSCRAWL_API_KEY`：

以下每段示例均包含独立的导入和客户端初始化，可分别复制到 ES module 文件或 TypeScript 项目中使用。

```ts
import AdsCrawl from 'adscrawl';

const client = new AdsCrawl();
const markdown = await client.markdown({
  url: 'https://www.adscrawl.net',
  waitUntil: 'domcontentloaded',
});
console.log(markdown);
```

也可以使用 `new AdsCrawl({ apiKey: process.env.ADSCRAWL_API_KEY })`。API key 应保存在服务端，避免进入前端打包文件。

## 常用功能

```ts
import { writeFile } from 'node:fs/promises';
import AdsCrawl from 'adscrawl';

const client = new AdsCrawl();
const html = await client.html({ url: 'https://www.adscrawl.net' });
console.log(html);
const article = await client.article({ url: 'https://www.adscrawl.net' });
console.log(article.title, article.textContent);

const png = await client.screenshot({
  url: 'https://www.adscrawl.net',
  viewport: { width: 1440, height: 900 },
  fullPage: true,
});
await writeFile('page.png', png);

const { templates } = await client.spa.templates();
console.log(templates);
const result = await client.spa.extract({
  template: 'google-trends-explore',
  keyword: 'playwright,puppeteer',
});
console.log(result.data);
```

`html()` 默认为 HTML 字符串；指定 `contentMode: 'markdown'` 返回 Markdown，指定 `'json'` 返回结构化文章。截图返回 `Uint8Array`。`selector` 可用于提取或截图单个元素。网页接口支持视口、语言、时区、Cookie、指纹和 User-Agent 设置；`countryCode` 与自定义 `proxy` 不能同时传入。

## Playwright 远程浏览器

单独安装 `playwright-core` 后：

```bash
npm install adscrawl playwright-core
```

```ts
import { chromium } from 'playwright-core';
import AdsCrawl from 'adscrawl';

const client = new AdsCrawl();
const session = await client.cdp.create();
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

创建接口返回 `sessionId`、`expiresAt` 和 `cdpBaseUrl`。Puppeteer 可通过 `client.cdp.getVersion(session)` 获取 `webSocketDebuggerUrl`。连接 URL 含有 token，避免记录到日志。

## 云浏览器

提供 `client.cloudBrowsers.create/list/get/start/stop/launch`。每次使用 API key 启动，都必须传入顶层 `proxy`。停止保留配置；返回 `stopping` 时，仍需查询直到实际状态为 `stopped`。关闭浏览器查看页面不会停止计费。完整清理示例见 [`examples/cloud-browser.mjs`](./examples/cloud-browser.mjs)。仅支持 API key 可访问的接口，配置修改、删除和查看页面需要控制台登录会话。

## 超时与错误

```ts
import AdsCrawl, { AdsCrawlAPIError } from 'adscrawl';

const client = new AdsCrawl();

try {
  const markdown = await client.markdown(
    { url: 'https://www.adscrawl.net', timeoutMs: 60_000 },
    { timeoutMs: 75_000 },
  );
  console.log(markdown);
} catch (error) {
  if (error instanceof AdsCrawlAPIError) {
    console.error(error.status, error.code, error.traceId);
  } else {
    throw error;
  }
}
```

第一组 `timeoutMs` 是服务端任务超时，第二组是 HTTP 总超时，也可传入 `signal` 取消。普通 HTTP 请求默认 90 秒；云浏览器一键启动默认 195 秒，可被客户端或单次请求设置覆盖。超时、取消不代表远程浏览器已停止。

错误包括 `AdsCrawlAPIError`、`AdsCrawlTimeoutError`、`AdsCrawlConnectionError`、`AdsCrawlResponseError`。API 错误保留状态码、错误代码和脱敏响应体。SDK 不自动重试请求，避免重复计费或重复创建浏览器。云浏览器启动失败如返回 `error.id`，请查询并清理该配置对应的实例。

## 开发与发布

```bash
npm ci
npm run check
npm pack --dry-run
```

更多类型、参数和示例见 [英文 README](./README.md)。首次发布及后续自动发布步骤见 [`RELEASING.md`](./RELEASING.md)。MIT 许可证。
