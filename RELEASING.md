# Publishing adscrawl

Repository: `AdsCrawl/adscrawl-js`. Public npm package: `adscrawl`.

## First release through GitHub Actions

The **Publish to npm** workflow supports both matching `vX.Y.Z` tags and a manual **Run workflow** from `main`. It checks the release ref, runs the SDK tests and package consumer checks, builds ESM/CommonJS and declarations, then publishes with provenance. Ordinary branch pushes only run CI.

Since `adscrawl` does not exist on npm yet, bootstrap the first release with a temporary granular token:

1. Sign in to the npm account that should own `adscrawl` and complete email verification and npm's required authentication setup.
2. In npm **Access Tokens → Generate New Token**, create a short-lived granular token. Enable **Bypass two-factor authentication**, and set **Packages and scopes → Permissions** to **Read and write (publish and stage)**. For the new, unscoped package, select **All Packages**; the package cannot be selected individually before it exists. Organization permissions are not required.
3. In [GitHub repository Actions secrets](https://github.com/AdsCrawl/adscrawl-js/settings/secrets/actions), choose **New repository secret**, name it `NPM_TOKEN`, and paste the token as its value. Never paste it into code, issues, or chat.
4. Open [Publish to npm](https://github.com/AdsCrawl/adscrawl-js/actions/workflows/publish.yml), select **Run workflow**, choose `main`, then run it. This publishes the version in `package.json`, currently `0.1.0`.
5. Check the workflow is green and `npm view adscrawl version` returns `0.1.0`. A published version cannot be overwritten; bump the version before the next release.
6. Configure Trusted Publisher below, then delete the GitHub `NPM_TOKEN` secret and revoke the temporary npm token.

See [npm's granular token instructions](https://docs.npmjs.com/creating-and-viewing-access-tokens/). The token is available only to the publish step, not dependency installation or tests. Publishing makes the version publicly installable.

Alternatively, bootstrap locally with `npm login`, `npm run check`, `npm run test:package`, and `npm publish --access public`, then configure Trusted Publisher. Complete interactive login and 2FA yourself.

### Troubleshooting authentication

If publishing fails with `ENEEDAUTH`, inspect the **Publish to npm** step:

- **NPM_TOKEN is unavailable**: check the exact secret name and repository. Use **Repository secrets** under **Secrets and variables → Actions**, not Actions **Variables**. This job does not use a GitHub environment, so environment secrets are not available. After saving the secret, start a new run from `main`.
- **NPM_TOKEN could not authenticate**: replace the secret with the complete, valid npm token value. Check the token has not expired or been revoked.
- Authentication succeeds but publishing is denied: check the token has **Read and write (publish and stage)** permission and **Bypass 2FA** enabled, as described above.

Use **Run workflow** after workflow updates. **Re-run jobs** runs the original commit and will not pick up updated workflow code. Do not run `npm adduser` inside CI; supply the token or configure Trusted Publisher instead.

## Later releases: npm Trusted Publisher

Once the package exists, open its npm **Settings → Trusted Publisher**, choose **GitHub Actions**, and enter:

| Field | Value |
| --- | --- |
| Organization or user | `AdsCrawl` |
| Repository | `adscrawl-js` |
| Workflow filename | `publish.yml` |
| Environment name | Leave empty |
| Allowed actions | Enable direct `npm publish` |

Direct publishing must be enabled: new publisher connections otherwise permit staged publishing only. See [npm's official Trusted Publisher instructions](https://docs.npmjs.com/trusted-publishers/).

The workflow uses a GitHub-hosted runner, Node.js 24, npm 11.5.1+, and `id-token: write`. After removing `NPM_TOKEN`, npm uses OIDC credentials supplied by GitHub Actions. Release builds do not use dependency caches.

Update the changelog and package version, then push the matching tag:

```bash
npm version patch
git push origin main --follow-tags
```

For example, this advances `0.1.0` to `0.1.1`, creates `v0.1.1`, and starts automatic publishing when the tag reaches GitHub. You can also use **Run workflow** on `main` after updating and pushing `package.json`. Tag names must exactly match the package version, and manual publishing from unrelated branches is rejected. Only publish versions ready for users; npm's default distribution tag is `latest`.

## Contract verification

SDK endpoints and response formats were checked against the public AdsCrawl documentation on 2026-09-18:

- [Browser tasks](https://www.adscrawl.net/docs/browser-tasks/)
- [Remote CDP](https://www.adscrawl.net/docs/remote-cdp/)
- [Cloud browsers](https://www.adscrawl.net/docs/cloud-browsers/)
- [Shared schemas](https://www.adscrawl.net/docs/schemas/)

Automated tests use documented fixtures and a local HTTP server. Before releasing against a changed API, verify one small live task and close any browser session. No live AdsCrawl request is part of the default tests.
