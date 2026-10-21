// Package only the static app. Local records, test output and project documents
// never belong in the public deployment.
import { cp, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const output = path.join(root, 'dist');
const files = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'LICENSE',
  'data/exercises.json', 'data/EXERCISES-LICENSE.txt',
  'icons/mark.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];
for (const entry of await readdir(path.join(root, 'js'), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) files.push(`js/${entry.name}`);
}

// Fail before touching an older build if an offline asset was left out.
const worker = await readFile(path.join(root, 'sw.js'), 'utf8');
const assets = worker.match(/const ASSETS = (\[[^;]+\]);/)?.[1];
if (!assets) throw new Error('Cannot read the service-worker asset list.');
for (const [, asset] of assets.matchAll(/'([^']+)'/g)) {
  const file = asset === './' ? 'index.html' : asset.replace(/^\.\//, '');
  if (!files.includes(file)) throw new Error(`Offline asset is missing from the build: ${asset}`);
}
for (const file of files) {
  const source = path.join(root, file);
  if (!(await lstat(source)).isFile() || await realpath(source) !== source) {
    throw new Error(`Expected a regular app file inside the project: ${file}`);
  }
}

// Never recursively remove a symlink/junction or a path outside this project.
const previous = await lstat(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (previous) {
  if (!previous.isDirectory() || previous.isSymbolicLink() || await realpath(output) !== output || path.dirname(output) !== root) {
    throw new Error('Refusing to replace an unsafe dist path.');
  }
  await rm(output, { recursive: true });
}
await mkdir(output);
for (const file of files) {
  await mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await cp(path.join(root, file), path.join(output, file));
}
console.log(`Built ${files.length} public app files in dist/ (offline assets verified).`);
