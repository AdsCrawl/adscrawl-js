# Publishing adscrawl

Target repository: `AdsCrawl/adscrawl-js`. Target npm package: `adscrawl`.

## First release

1. Create a public GitHub repository named `adscrawl-js` under `AdsCrawl`, without generated files. Push this repository's `main` branch. If you change the owner/name, update `package.json` and the npm trusted-publisher configuration together.
2. Run `npm ci`, `npm run check`, and `npm pack --dry-run`. The package includes only compiled ESM/CommonJS, declarations, README files, and the license.
3. Sign in to the npm account that should own the package: `npm login`, then verify with `npm whoami`. Complete npm's authentication/2FA prompts yourself; never paste credentials into source files or chat.
4. Confirm `npm view adscrawl version` returns E404. If another package has appeared, choose a new name before publishing.
5. Publish `0.1.0` from the repository root: `npm publish --access public`. The `prepack` script builds both module formats.
6. Verify `npm view adscrawl version` returns `0.1.0`, then install `adscrawl` in a clean Node.js project and check ESM, CommonJS, and TypeScript imports.

Publishing makes the version publicly installable. The first release uses your npm login. The workflow below is for later releases after trusted publishing is configured.

## Later releases: npm trusted publishing

In npm's package settings, add a GitHub Actions trusted publisher:

- Organization or user: `AdsCrawl`
- Repository: `adscrawl-js`
- Workflow filename: `publish.yml`
- Allow direct `npm publish` for this publisher if the settings offer action restrictions.

See [npm's official instructions](https://docs.npmjs.com/trusted-publishers/). The workflow uses a GitHub-hosted runner with Node.js 24, a current bundled npm, and `id-token: write`; it needs no npm token secret. Trusted publishing requires npm 11.5.1+ and Node.js 22.14.0+.

Update the package version and changelog, then create and push the matching tag:

```bash
npm version patch
git push origin main --follow-tags
```

`.github/workflows/publish.yml` runs checks, verifies that `vX.Y.Z` matches `package.json`, and publishes with provenance. Configure the trusted publisher before pushing a release tag. Ordinary branch pushes only run CI; they do not publish.

## Contract verification

SDK endpoints and response formats were checked against the public AdsCrawl documentation on 2026-09-18:

- [Browser tasks](https://www.adscrawl.net/docs/browser-tasks/)
- [Remote CDP](https://www.adscrawl.net/docs/remote-cdp/)
- [Cloud browsers](https://www.adscrawl.net/docs/cloud-browsers/)
- [Shared schemas](https://www.adscrawl.net/docs/schemas/)

Automated tests use documented fixtures and a local HTTP server. Before releasing against a changed API, verify one small live task and close any browser session. No live AdsCrawl request is part of the default tests.
