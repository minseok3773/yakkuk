// Upload only public frontend files, excluding credentials, source and dependencies.
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(tmpdir(), 'yakkuk-pages-site');
const files = ['index.html', 'workspace.js', 'ai-client.js', 'ai-config.js'];
await mkdir(output, { recursive: true });
const existing = await readdir(output);
if (existing.some(name => ![...files, '_headers'].includes(name))) {
  throw new Error('Unexpected files in the deployment folder. Inspect them before uploading.');
}
for (const name of files) await copyFile(join(root, name), join(output, name));
await writeFile(join(output, '_headers'), '/*\n  Cache-Control: no-cache\n  X-Content-Type-Options: nosniff\n');
console.log('Public frontend ready:', output, '(four app files and cache headers; no credentials)');
