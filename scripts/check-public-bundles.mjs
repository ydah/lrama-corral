#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  ['ruby/src/lrama_api.rb', 'public/lrama_api.rb'],
  ['ruby/src/lrama_bundle.rb', 'public/lrama_bundle.rb'],
  ['ruby/src/railroad_diagrams_bundle.rb', 'public/railroad_diagrams_bundle.rb'],
];

const failures = [];

for (const [sourcePath, publicPath] of checks) {
  const source = resolve(projectRoot, sourcePath);
  const publicFile = resolve(projectRoot, publicPath);
  const [sourceContent, publicContent] = await Promise.all([
    readFile(source),
    readFile(publicFile),
  ]);

  if (!sourceContent.equals(publicContent)) {
    failures.push(`${relative(projectRoot, publicFile)} does not match ${relative(projectRoot, source)}`);
  }
}

const wasmPath = resolve(projectRoot, 'public/ruby.wasm');
const wasm = await stat(wasmPath);
if (wasm.size === 0) {
  failures.push('public/ruby.wasm is empty');
}

if (failures.length > 0) {
  console.error('Public bundle verification failed:');
  failures.forEach(failure => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('Public bundle verification passed.');
