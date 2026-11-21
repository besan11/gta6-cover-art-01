// Vice Cover Studio — entry program (Node 22, standard library only).
//
// What it does, in order:
//   1. Empties the output directory's contents (never the directory
//      itself, which in the grader is a bind mount) and rebuilds it
//      from scratch, so a run never inherits stale files.
//   2. Copies app/ and screenshots/ from beside this file into it.
//   3. Writes dossier.json with the vendored make.fun library, using the
//      same caps the scorer enforces, so a dossier that passes here is
//      shaped the way the gate expects.
//   4. Self-checks the result: screenshot count and size, app file count
//      and size, dossier parses and stays under its cap. Any failure
//      throws instead of printing a cheerful summary.
//
// Local check (outside the grader, /output is replaced by an env var):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Run it twice and compare the two trees: the bytes must be identical.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

function fail(message: string): never {
  throw new Error('vice-cover-studio main.ts: ' + message);
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
    else fail('non-file entry under app/: ' + full);
  }
  return out;
}

function totalBytes(files: string[]): number {
  return files.reduce((sum, file) => sum + statSync(file).size, 0);
}

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// 1. Fresh output directory: remove only what is inside it, one entry
//    at a time, and leave the directory itself standing. In the grader
//    the output directory is a bind mount under a read-only filesystem,
//    so removing the mount point itself fails with "Device or resource
//    busy" — emptying its contents does not.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}

// 2. Copy the app and its screenshots.
cpSync(join(repoRoot, 'app'), join(outDir, 'app'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// 3. Dossier, written by the vendored library from the copied tree.
const dossierText = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossierText);

// 4. Self-check: the same limits the gate applies, verified locally.
const appFiles = walkFiles(join(outDir, 'app'));
if (appFiles.length > CAPS.app_max_files) fail(`app/ holds ${appFiles.length} files, cap ${CAPS.app_max_files}`);
const appBytes = totalBytes(appFiles);
if (appBytes > CAPS.app_max_bytes) fail(`app/ is ${appBytes} bytes, cap ${CAPS.app_max_bytes}`);
for (const file of appFiles) {
  const rel = file.slice(join(outDir, 'app').length + 1);
  if (Buffer.byteLength(rel, 'utf8') > CAPS.app_path_max_bytes) fail('app/ path too long: ' + rel);
}
const indexHtml = join(outDir, 'app', 'index.html');
if (!existsSync(indexHtml)) fail('app/index.html is missing');
if (statSync(indexHtml).size > 1024 * 1024) fail('app/index.html is over 1 MiB');

const shotFiles = readdirSync(join(outDir, 'screenshots'))
  .filter(name => !name.startsWith('.'))
  .map(name => join(outDir, 'screenshots', name));
if (shotFiles.length < 3 || shotFiles.length > CAPS.screenshots.max) {
  fail(`screenshots/ holds ${shotFiles.length} files, need 3 or 4`);
}
for (const file of shotFiles) {
  if (statSync(file).size > CAPS.screenshots.max_bytes) fail('screenshot over 256 KiB: ' + file);
}

let dossier;
try {
  dossier = JSON.parse(readFileSync(join(outDir, 'dossier.json'), 'utf8'));
} catch {
  fail('dossier.json does not parse as JSON');
}
if (typeof dossier !== 'object' || dossier === null) fail('dossier.json is not an object');
if (statSync(join(outDir, 'dossier.json')).size > 1572864) fail('dossier.json is over 1.5 MiB');

console.log(
  `vice-cover-studio: wrote ${outDir} — app ${appFiles.length} files / ${appBytes} bytes, ` +
  `${shotFiles.length} screenshots, dossier ${dossierText.length} bytes. Self-check passed.`
);
