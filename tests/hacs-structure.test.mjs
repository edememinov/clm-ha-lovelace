import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

test('HACS can discover the configured JavaScript file in publishable repository content', async () => {
  const manifest = JSON.parse(await readFile(new URL('hacs.json', root), 'utf8'));
  assert.match(manifest.filename, /^[^/\\]+\.js$/);
  // Include new files during development, but exclude ignored local build output.
  const paths = new Set(execFileSync('git', [
    'ls-files', '--cached', '--others', '--exclude-standard', '-z',
  ], { cwd: fileURLToPath(root), encoding: 'utf8' }).split('\0'));
  const candidates = manifest.content_in_root
    ? [manifest.filename]
    : [manifest.filename, `dist/${manifest.filename}`];
  const artifact = candidates.find(path => paths.has(path));
  assert.ok(artifact, `HACS requires ${manifest.filename} in the repository root or dist, not ignored build output`);
  assert.ok((await readFile(new URL(artifact, root), 'utf8')).trim(), 'Card artifact must not be empty');
});
