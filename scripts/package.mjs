import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await mkdir(output, { recursive: true });
for (const path of ['index.html', 'card.html', 'favicon.svg', 'css', 'js', '.nojekyll']) await cp(new URL(path, root), new URL(path, output), { recursive: true });
console.log('Static files copied to dist/ (no compilation or runtime dependencies).');
