// make-icons.mjs: renders the extension icons. `npm run icons`.
//
// The mark is defined once, here, as vector geometry: a rounded tile and a single
// even-odd path. Everything shipped in icons/ is generated from it (the SVG the
// README uses and the four PNG sizes the manifest points at), so there is no
// binary asset in the repository that can't be reproduced from source.
//
// The PNGs are rasterised by scanline fill at 8x8 subsamples per pixel rather than
// downscaled from one large export, which keeps the 16px icon from turning to mush.
//
// Writes icons/icon-{16,32,48,128}.png plus icons/icon.svg.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SIZES = [16, 32, 48, 128];

// ─── the mark ───
// Coordinates are in a 512x512 box. RADIUS is the tile's corner radius; GLYPH is
// filled white with the even-odd rule, which is what hollows out the knot.
const VIEW = 512;
const RADIUS = 79.6;
const RED = [235, 60, 68];
const HEX = '#eb3c44';

const GLYPH = `M429.3 68L426.1 69.4L367.3 128.5L358.7 123.4L351.7 120.1L344 117.2L336.2 115.2L324 113.5
L317.4 113.5L301.5 115.2L292.1 105.4L283.6 98.9L271.3 92.3L259.5 88.2L248.9 86.2
L236.6 85.6L225.2 86.6L213.3 89.5L203.1 93.6L196.2 97.2L188.8 102.1L181.5 108.2
L173.5 116.6L167.8 124.3L161.9 134.9L158.2 143.7L145.6 147.5L134.5 152.7L123.1 160.5
L115.7 167.2L109.9 173.7L105.4 179.9L101.3 186.8L96 198.2L93.5 206L91.5 215.8L90.7 223.5
L90.7 232.5L92.7 247.2L96.8 260.3L103 272.5L111.5 284.4L108.2 296.2L106.6 309.7
L107 320.3L109.5 333.4L112.8 343.2L116.8 351.7L122.5 360.7L128.9 368.5L69 428.9
L67.8 431.8L67.8 435.4L69 437.9L71.8 440.8L74.1 442L77 442.4L79.8 441.7L81.7 440.3
L438 81.9L439.7 78.2L439.7 74.9L438.8 72.9L433.8 68.3Z
M234.7 109.2L245.6 109.5L258.7 112.4L270.5 118L278.2 123.9L211.7 163.8L208.8 165.9
L206.6 168.8L205.4 173.3L205.2 266.8L175.2 249.3L175.2 170.1L176 161.9L178.9 151.3
L184.2 140.2L189.1 133.3L196.2 125.8L205.2 118.9L214.6 113.9L224.4 110.7Z
M313.4 136.6L323.6 136.4L332.6 137.7L342.8 140.9L350.8 145.1L320.7 175.6L308.9 169.5
L305.2 169.3L301.9 169.9L221.1 217.3L221.2 184.3L245.2 170.6L290.1 143.3L301.1 138.9Z
M386.4 147.5L370.7 163.5L376.4 173.3L379.2 180.3L380.9 186L382.5 198.2L382.1 207.2
L381.4 211.3L344.4 189.9L328.4 206L368.9 230.4L373.4 233.6L379.1 238.7L384.5 244.8
L389 251.3L392.7 258.2L395.6 266L397.6 275.4L398.1 287.2L397.2 295L395.1 303.6L391 313.4
L385.4 322.3L379.5 329.1L369.7 337.2L362.4 341.3L358.7 342.9L358.1 342.8L358.4 270.1
L357.2 264L355.2 260.7L353 258.5L305.2 229.5L292.4 242.3L291.9 276.6L256.6 297.2
L244.4 290.7L233.6 301.5L240.9 306L241.1 306.7L213.3 323.2L211.7 323.4L196.5 338.7
L201.9 341.7L204.4 342.5L208 342.8L212.1 341.6L291.3 294.3L291.9 294.6L291.8 327.7
L226 367L216.2 371.9L210.5 373.9L203.1 375.6L190.9 376.3L177.8 374.4L165.6 369.9
L149.7 386L157 390.2L163.5 393.1L177.8 397.2L188 398.4L197 398.5L211.3 396.6L219.9 405.3
L229.3 412.3L240.3 418L250.9 421.7L260.3 423.8L267.6 424.6L277.4 424.6L285.6 423.8
L296.6 421.3L304.8 418.5L315.4 413.2L322.3 408.6L332.1 400.5L341.3 390.1L347.8 379.9
L353.4 367.7L366 364.2L376.7 359.2L386 353.1L395.5 344.8L401.7 337.9L406.6 330.9
L411.1 323.2L414.4 315.8L417.7 306L419.3 298.7L420.5 286.8L420.5 281.1L418.9 266.8
L414.8 252.9L408.6 240.3L400 228L402.9 217.4L404.6 205.2L404.6 193.7L402.1 178.2
L399.2 169.2L395.2 160.3L389.4 150.9Z
M152.5 169.2L153.2 169.2L153.3 171.3L153.3 246.8L154.4 252.5L156 255L158.6 257.6
L209.5 287.6L188.4 308.9L146.4 284.6L139.8 280.4L134.1 275.9L127.9 269.3L122.2 261.1
L118.5 254.2L114.8 243.5L113.2 234.6L113.2 221.9L115.3 211.3L119.8 199.5L125.8 189.7
L133.7 180.9L143.5 173.6Z
M298.9 189.7L299.9 189.4L304 191.9L304 192.5L282.3 214.4L269.8 206.8Z
M255 215.4L271.1 225.6L221.5 275.6L221.1 235Z
M307.4 249.7L333 264.7L336.4 267.2L336.3 341.1L335.1 350.9L332.3 360.7L327 371.8
L319.6 381.6L310.5 389.9L304.4 393.9L297.9 397.2L285.2 401.2L273.4 402.5L260.7 401.3
L249.7 398L240.7 393.5L233.8 388.1L301.1 348.2L304.5 345.2L306.1 342.4L307 338.3Z
M130.2 301.1L130.9 300.9L172 325.2L144.7 352.8L141.7 349.7L137.2 342.8L133.5 335
L131.6 329.3L129.5 319.9L129.1 314.6L129.2 308.5Z`;

// ─── minimal PNG writer ───
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // truecolour + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── geometry ───
// Every subpath is a closed polygon of straight segments, so parsing is just
// "read the numbers"; there are no curves to flatten.
function polygons(d) {
  return d.trim().split('M').filter(Boolean).map((sub) => {
    const nums = sub.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const pts = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    return pts;
  });
}

// Signed distance to a rounded rectangle: negative inside, positive outside.
function roundedRect(px, py, half, r) {
  const dx = Math.abs(px - half) - (half - r);
  const dy = Math.abs(py - half) - (half - r);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
}

const POLYS = polygons(GLYPH);
const EDGES = [];
for (const poly of POLYS) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a[1] !== b[1]) EDGES.push([a[0], a[1], b[0], b[1]]);
  }
}

// ─── raster ───
// One pass per subsample row: find where the glyph's edges cross it, sort the
// crossings and fill between alternate pairs (the even-odd rule). The tile is
// analytic, so it only needs a distance test per subsample.
function render(size) {
  const SS = 8;
  const out = new Uint8Array(size * size * 4);
  const scale = VIEW / size;         // one pixel, in mark units
  const cover = new Float32Array(size); // glyph coverage for the row being built
  const tile = new Float32Array(size);  // tile coverage for the row being built
  const xs = [];

  for (let y = 0; y < size; y++) {
    cover.fill(0);
    tile.fill(0);
    for (let sy = 0; sy < SS; sy++) {
      const my = (y + (sy + 0.5) / SS) * scale;

      xs.length = 0;
      for (const [x1, y1, x2, y2] of EDGES) {
        if ((my >= y1) === (my >= y2)) continue;
        xs.push(x1 + ((my - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);

      for (let sx = 0; sx < SS; sx++) {
        const off = (sx + 0.5) / SS;
        for (let x = 0; x < size; x++) {
          const mx = (x + off) * scale;
          if (roundedRect(mx, my, VIEW / 2, RADIUS) < 0) tile[x] += 1;
          else continue;
          let inside = false;
          for (let i = 0; i < xs.length && xs[i] <= mx; i++) inside = !inside;
          if (inside) cover[x] += 1;
        }
      }
    }

    const n = SS * SS;
    for (let x = 0; x < size; x++) {
      const a = tile[x] / n;
      const i = (y * size + x) * 4;
      if (a === 0) continue;
      // White is mixed in over the covered part of the pixel only, so an edge
      // pixel keeps its hue instead of fading toward black.
      const white = tile[x] ? cover[x] / tile[x] : 0;
      out[i] = Math.round(RED[0] + (255 - RED[0]) * white);
      out[i + 1] = Math.round(RED[1] + (255 - RED[1]) * white);
      out[i + 2] = Math.round(RED[2] + (255 - RED[2]) * white);
      out[i + 3] = Math.round(a * 255);
    }
  }
  return out;
}

// The same mark as vector, for the README and anywhere a raster icon won't do.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${VIEW}" height="${VIEW}" role="img" aria-label="HideLLM">
<rect width="${VIEW}" height="${VIEW}" rx="${RADIUS}" fill="${HEX}"/>
<path fill="#fff" fill-rule="evenodd" d="${GLYPH}"/>
</svg>
`;

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(OUT, `icon-${size}.png`), encodePng(size, render(size)));
  console.log(`icons/icon-${size}.png`);
}
writeFileSync(join(OUT, 'icon.svg'), SVG);
console.log('icons/icon.svg');
