import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const policy = await readFile('src/frame-policy.js', 'utf8');
const card = (await readFile('src/clm-card.js', 'utf8')).replace(/^import[^\n]+\n/, '');
await writeFile('dist/clm-card.js', `${policy}\n${card}`);
