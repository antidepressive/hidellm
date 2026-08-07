// check.mjs: the lint step. `npm run lint`.
//
// There is no ESLint here on purpose: the whole repo is dependency-free, and a
// linter you have to install is a linter contributors skip. What this does instead
// is everything a syntax-only pass can do without a package tree:
//
//   1. every .js and .mjs file compiles
//   2. every .json file parses
//   3. no file uses tabs or trails whitespace (the .editorconfig contract)
//   4. no debugger statements or stray console.log in shipped source
//
// Exits non-zero on the first category with a problem, listing all of them.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist']);
// Dot-directories are tooling or local scratch and none of this repo's business,
// except .github, which is source we do want checked.
const skipDir = (name) => SKIP.has(name) || (name[0] === '.' && name !== '.github');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!skipDir(name)) walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const problems = [];
const note = (file, msg) => problems.push(`${relative(ROOT, file).replace(/\\/g, '/')}: ${msg}`);

let checked = 0;
for (const file of walk(ROOT)) {
  const ext = extname(file);
  if (!['.js', '.mjs', '.json', '.html', '.css', '.md', '.yml'].includes(ext)) continue;
  const src = readFileSync(file, 'utf8');
  checked++;

  if (ext === '.js' || ext === '.mjs') {
    if (ext === '.js') {
      // Compiling as a script is enough to catch syntax errors, and unlike
      // `node --check` it costs no process spawn per file.
      try {
        new vm.Script(src, { filename: file });
      } catch (err) {
        note(file, `syntax error: ${err.message}`);
      }
    } else {
      // ES modules can't be compiled by vm.Script; there are only a handful of
      // them, so spawning the real parser is fine.
      const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (res.status !== 0) note(file, `syntax error: ${(res.stderr || '').split('\n')[2] || 'see node --check'}`);
    }
    if (/^\s*debugger\b/m.test(src)) note(file, 'contains a debugger statement');
    if (file.includes(`${'src'}/`) && /console\.log\(/.test(src) && !file.includes('scripts')) {
      note(file, 'contains console.log in shipped source');
    }
  }

  if (ext === '.json') {
    try { JSON.parse(src); } catch (err) { note(file, `invalid JSON: ${err.message}`); }
  }

  if (/\t/.test(src)) note(file, 'contains a tab character (use two spaces)');
  if (/[ \t]+$/m.test(src)) note(file, 'has trailing whitespace');
  if (src.length && !src.endsWith('\n')) note(file, 'has no trailing newline');
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('');
  process.exit(1);
}

console.log(`lint: ${checked} files clean`);
