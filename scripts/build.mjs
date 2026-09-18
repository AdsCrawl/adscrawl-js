import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
rmSync('dist', { recursive: true, force: true });
execFileSync(process.execPath, [tsc], { stdio: 'inherit' });
execFileSync(process.execPath, [tsc, '--module', 'CommonJS', '--moduleResolution', 'Node', '--outDir', 'dist/cjs'], { stdio: 'inherit' });
mkdirSync('dist/cjs', { recursive: true });
writeFileSync('dist/cjs/package.json', '{"type":"commonjs"}\n');
