// package.mjs: builds dist/hidellm-<version>.zip, the artefact you upload to the
// Chrome Web Store. `npm run build`.
//
// Writes the ZIP by hand (deflate + the two central-directory records) so the
// repo keeps its zero-dependency promise. Only the files the extension actually
// needs at runtime go in: no tests, no docs, no scripts.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// Everything Chrome loads, and nothing else. The icons come from the manifest
// rather than from a listing of icons/, so nothing that happens to be sitting in
// that directory (a source file, a scratch export) can end up in the zip.
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const INCLUDE = [
  'manifest.json',
  'LICENSE',
  'src',
  ...new Set([...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]),
];
const EXCLUDE = /\.(svg|map)$/;

function collect(entry, out = []) {
  const full = join(ROOT, entry);
  if (!existsSync(full)) throw new Error(`missing: ${entry}`);
  if (statSync(full).isDirectory()) {
    for (const name of readdirSync(full)) collect(join(entry, name), out);
  } else if (!EXCLUDE.test(full)) {
    out.push(relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}

// ─── minimal ZIP writer ───
// Node ships crc32 as of 20.12; fall back to a local table on older runtimes so
// the build works anywhere the tests do.
const crc = crc32 || (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    // store the file uncompressed if deflating made it bigger (tiny JSON does this)
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const sum = crc(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8); // method
    local.writeUInt32LE(0, 10);            // dos time/date: zeroed for reproducible builds
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(stored ? 0 : 8, 10);
    dir.writeUInt32LE(0, 12);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

// ─── build ───
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

if (manifest.version !== pkg.version) {
  console.error(`version mismatch: manifest.json is ${manifest.version}, package.json is ${pkg.version}`);
  process.exit(1);
}

const names = INCLUDE.flatMap((entry) => collect(entry));
const files = names.sort().map((name) => ({ name, data: readFileSync(join(ROOT, name)) }));

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const out = join(DIST, `hidellm-${manifest.version}.zip`);
writeFileSync(out, zip(files));

const kb = (statSync(out).size / 1024).toFixed(1);
console.log(`${relative(ROOT, out).replace(/\\/g, '/')}: ${files.length} files, ${kb} KB`);
for (const f of files) console.log('  ' + f.name);
