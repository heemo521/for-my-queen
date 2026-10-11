// Procedural textures: value-noise fbm, PBR hull plating, rock, planets, particle sprites.
import * as THREE from 'three';

// ---------- seeded value noise ----------
let seed = 1337;
const srand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const PERM = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(srand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const VALS = new Float32Array(256).map(() => srand());
const fade = t => t * t * (3 - 2 * t);
const h3 = (x, y, z) => VALS[PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)]];

export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const a = h3(xi, yi, zi), b = h3(xi + 1, yi, zi), c = h3(xi, yi + 1, zi), d = h3(xi + 1, yi + 1, zi);
  const e = h3(xi, yi, zi + 1), f = h3(xi + 1, yi, zi + 1), g = h3(xi, yi + 1, zi + 1), h = h3(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * xf, x2 = c + (d - c) * xf, x3 = e + (f - e) * xf, x4 = g + (h - g) * xf;
  const y1 = x1 + (x2 - x1) * yf, y2 = x3 + (x4 - x3) * yf;
  return y1 + (y2 - y1) * zf;
}

export function fbm(x, y, z, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(c, srgb = true, repeat = 0) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}

const rnd = (a, b) => a + Math.random() * (b - a);

// Grayscale noise layer painted into a canvas (used for grime / roughness variation).
function noiseLayer(g, w, h, scale, alpha, dark = true) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // tileable: sample a torus
      const u = (x / w) * Math.PI * 2, v = (y / h) * Math.PI * 2;
      const n = fbm(Math.cos(u) * scale, Math.sin(u) * scale, Math.cos(v) * scale + Math.sin(v) * scale * 0.7, 4);
      const k = (n - 0.5) * 255 * alpha * (dark ? 1 : -1);
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, d[i] + k));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + k));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + k));
    }
  }
  g.putImageData(img, 0, 0);
}

// Hull plating: albedo detail (multiplied by material color), roughness, bump.
let hullSet;
export function hullTextures() {
  if (hullSet) return hullSet;
  const S = 512;
  const map = canvas(S, S), rough = canvas(S, S), bump = canvas(S, S);
  const gm = map.getContext('2d'), gr = rough.getContext('2d'), gb = bump.getContext('2d');
  gm.fillStyle = '#e6e6e6'; gm.fillRect(0, 0, S, S);
  gr.fillStyle = '#6e6e6e'; gr.fillRect(0, 0, S, S);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, S, S);
  // plates: recursive subdivision
  const plates = [];
  const split = (x, y, w, h, depth) => {
    if (depth > 3 || (depth > 1 && Math.random() < 0.3)) { plates.push([x, y, w, h]); return; }
    if (w > h) { const s = Math.round(w * rnd(0.3, 0.7)); split(x, y, s, h, depth + 1); split(x + s, y, w - s, h, depth + 1); }
    else { const s = Math.round(h * rnd(0.3, 0.7)); split(x, y, w, s, depth + 1); split(x, y + s, w, h - s, depth + 1); }
  };
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) split(i * 128, j * 128, 128, 128, 0);
  for (const [x, y, w, h] of plates) {
    const shade = rnd(208, 245) | 0;
    gm.fillStyle = `rgb(${shade},${shade},${shade})`;
    gm.fillRect(x + 1, y + 1, w - 2, h - 2);
    const r = rnd(80, 140) | 0;
    gr.fillStyle = `rgb(${r},${r},${r})`;
    gr.fillRect(x + 1, y + 1, w - 2, h - 2);
    gb.fillStyle = '#8a8a8a';
    gb.fillRect(x + 2, y + 2, w - 4, h - 4);
    // seams
    gm.strokeStyle = 'rgba(40,40,40,0.8)'; gm.lineWidth = 1.5; gm.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    gb.strokeStyle = '#303030'; gb.lineWidth = 2; gb.strokeRect(x + 1, y + 1, w - 2, h - 2);
    // rivets
    if (w > 40 && h > 40 && Math.random() < 0.6) {
      gb.fillStyle = '#c0c0c0';
      gm.fillStyle = 'rgba(90,90,90,0.6)';
      for (let k = 6; k < w - 4; k += 10) for (const yy of [y + 5, y + h - 5]) { gb.fillRect(x + k, yy, 2, 2); gm.fillRect(x + k, yy, 2, 2); }
    }
    // occasional vents / hatches
    if (Math.random() < 0.08 && w > 30 && h > 30) {
      gm.fillStyle = 'rgba(30,30,30,0.85)';
      gb.fillStyle = '#404040';
      for (let k = 0; k < 5; k++) { gm.fillRect(x + 6, y + 6 + k * 5, w - 12, 2); gb.fillRect(x + 6, y + 6 + k * 5, w - 12, 2); }
    }
  }
  // warning stripes & markings
  gm.save();
  gm.beginPath(); gm.rect(0, 470, S, 24); gm.clip();
  for (let x = -40; x < S + 40; x += 24) { gm.fillStyle = '#ffd23f'; gm.beginPath(); gm.moveTo(x, 470); gm.lineTo(x + 12, 470); gm.lineTo(x + 36, 494); gm.lineTo(x + 24, 494); gm.fill(); }
  gm.restore();
  gm.fillStyle = 'rgba(30,30,30,0.85)'; gm.font = 'bold 34px Impact, sans-serif';
  gm.fillText('NX-' + ((Math.random() * 900 + 100) | 0), 300, 440);
  noiseLayer(gm, S, S, 3, 0.35);
  noiseLayer(gr, S, S, 5, 0.5, false);
  hullSet = { map: toTexture(map, true, 1), roughnessMap: toTexture(rough, false, 1), bumpMap: toTexture(bump, false, 1) };
  return hullSet;
}

let rockSet;
export function rockTextures() {
  if (rockSet) return rockSet;
  const S = 256, c = canvas(S, S), b = canvas(S, S);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  const img = g.createImageData(S, S), ib = gb.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    const n = fbm(Math.cos(u) * 2 + 10, Math.sin(u) * 2, Math.cos(v) * 2 + Math.sin(v), 6);
    const cr = fbm(Math.cos(u) * 6, Math.sin(u) * 6 + 5, Math.cos(v) * 6 + Math.sin(v) * 6, 3);
    const crater = cr > 0.68 ? -0.25 : 0;
    const l = 70 + n * 110 + crater * 120;
    const i = (y * S + x) * 4;
    img.data[i] = l * 1.05; img.data[i + 1] = l * 0.95; img.data[i + 2] = l * 0.85; img.data[i + 3] = 255;
    const bl = n * 255 + crater * 200;
    ib.data[i] = ib.data[i + 1] = ib.data[i + 2] = bl; ib.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  gb.putImageData(ib, 0, 0);
  rockSet = { map: toTexture(c, true, 2), bumpMap: toTexture(b, false, 2) };
  return rockSet;
}

// Equirectangular planet surface sampled on the sphere so there are no seams.
export function planetTexture(type, hue, W = 1024, H = 512) {
  const c = canvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const col = new THREE.Color();
  const off = Math.random() * 50;
  for (let y = 0; y < H; y++) {
    const lat = (y / H) * Math.PI;
    const sl = Math.sin(lat), cl = Math.cos(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const px = sl * Math.cos(lon), py = cl, pz = sl * Math.sin(lon);
      let r, gg, b;
      if (type === 'gas') {
        const warp = fbm(px * 3 + off, py * 3, pz * 3, 4);
        const band = Math.sin(py * 14 + warp * 6) * 0.5 + 0.5;
        const fine = fbm(px * 8, py * 40 + warp * 4, pz * 8, 3);
        col.setHSL((hue + band * 25 - 10) / 360, 0.45 + band * 0.2, 0.32 + band * 0.25 + (fine - 0.5) * 0.15);
        // storm
        const sd = Math.hypot(px - 0.6, py + 0.3, pz - 0.74);
        if (sd < 0.18) col.lerp(new THREE.Color().setHSL(0.02, 0.6, 0.45), (1 - sd / 0.18) * 0.8);
        r = col.r; gg = col.g; b = col.b;
      } else if (type === 'earth') {
        const n = fbm(px * 2.2 + off, py * 2.2, pz * 2.2, 6);
        const ice = Math.abs(py) > 0.82 - (n - 0.5) * 0.3;
        if (ice) { r = 0.9; gg = 0.93; b = 0.96; }
        else if (n < 0.5) { const k = n / 0.5; r = 0.02 + k * 0.05; gg = 0.08 + k * 0.18; b = 0.22 + k * 0.3; }
        else {
          const k = (n - 0.5) / 0.5, dry = fbm(px * 5, py * 5 + 3, pz * 5, 3);
          col.setHSL(dry > 0.55 ? 0.09 : 0.27 - k * 0.1, 0.45, 0.18 + k * 0.35);
          r = col.r; gg = col.g; b = col.b;
        }
      } else {
        // barren / desert with craters
        const n = fbm(px * 3 + off, py * 3, pz * 3, 6);
        const cr = fbm(px * 9, py * 9, pz * 9, 2);
        col.setHSL(hue / 360, 0.3, 0.2 + n * 0.35 - (cr > 0.66 ? 0.12 : 0));
        r = col.r; gg = col.g; b = col.b;
      }
      const i = (y * W + x) * 4;
      d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = b * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

export function cloudTexture(W = 512, H = 256) {
  const c = canvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    const lat = (y / H) * Math.PI, sl = Math.sin(lat), cl = Math.cos(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const n = fbm(sl * Math.cos(lon) * 3 + 40, cl * 3, sl * Math.sin(lon) * 3, 5);
      const a = Math.max(0, (n - 0.5) * 3.2);
      const i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.min(255, a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

export function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)') {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.25, mid);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return toTexture(c);
}

export function smokeTexture() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x / S - 0.5, dy = y / S - 0.5, r = Math.hypot(dx, dy) * 2;
    const n = fbm(x * 0.05, y * 0.05, 7.7, 4);
    const a = Math.max(0, 1 - r) ** 1.5 * (0.5 + n);
    const i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 200 + n * 55;
    d[i + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

export function windowTexture() {
  const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
  for (let y = 10; y < H; y += 22) {
    for (let x = 8; x < W; x += 18) {
      const lit = Math.random();
      if (lit < 0.5) {
        const hue = [42, 190, 320, 40, 200][(Math.random() * 5) | 0];
        g.fillStyle = `hsl(${hue},${rnd(40, 90)}%,${rnd(45, 75)}%)`;
        g.fillRect(x, y, 12, 14);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, y + 7, 12, 1);
        if (Math.random() < 0.3) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + rnd(0, 8), y + 4, 3, 10); } // silhouettes
      } else {
        g.fillStyle = '#0d1018'; g.fillRect(x, y, 12, 14);
      }
    }
  }
  return toTexture(c, true);
}
