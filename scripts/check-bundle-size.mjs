#!/usr/bin/env node
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const limits = {
  mainJsBytes: 4 * 1024 * 1024,
  assetsBytes: 5 * 1024 * 1024,
  distBytes: 40 * 1024 * 1024,
  rubyWasmBytes: 32 * 1024 * 1024,
};

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function failIfOver(failures, label, actual, limit) {
  if (actual <= limit) return;
  failures.push(`${label} is ${formatBytes(actual)}; budget is ${formatBytes(limit)}`);
}

const distDir = resolve(projectRoot, 'dist');
const assetsDir = resolve(distDir, 'assets');
const files = await collectFiles(distDir);
const stats = await Promise.all(files.map(async file => [file, await stat(file)]));
const sizeOf = (predicate) => stats
  .filter(([file]) => predicate(file))
  .reduce((sum, [, fileStat]) => sum + fileStat.size, 0);

const distBytes = sizeOf(() => true);
const assetsBytes = sizeOf(file => file.startsWith(assetsDir));
const rubyWasmBytes = sizeOf(file => relative(distDir, file) === 'ruby.wasm');
const mainJsBytes = sizeOf(file => /\/assets\/index-[^/]+\.js$/.test(file));
const failures = [];

failIfOver(failures, 'main JS bundle', mainJsBytes, limits.mainJsBytes);
failIfOver(failures, 'dist assets', assetsBytes, limits.assetsBytes);
failIfOver(failures, 'dist output', distBytes, limits.distBytes);
failIfOver(failures, 'ruby.wasm', rubyWasmBytes, limits.rubyWasmBytes);

console.log(`main JS: ${formatBytes(mainJsBytes)}`);
console.log(`assets: ${formatBytes(assetsBytes)}`);
console.log(`dist: ${formatBytes(distBytes)}`);
console.log(`ruby.wasm: ${formatBytes(rubyWasmBytes)}`);

if (failures.length > 0) {
  console.error('Bundle size budget failed:');
  failures.forEach(failure => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('Bundle size budget passed.');
