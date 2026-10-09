// Procedural low-poly models: ships, astronaut, droids, cash crates, blaster.
import * as THREE from 'three';

export const PAINT = [0xd8dde6, 0xffb000, 0x2b7bff, 0x22c55e, 0xe11d48, 0x9b5de5, 0xf15bb5, 0x00bbf9, 0xff6b35];

const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45, ...o });
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o });
const additive = color => basic(color, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

const adder = g => (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
};

const G = {
  fus: new THREE.CylinderGeometry(0.45, 1.6, 9, 8),
  fusBig: new THREE.CylinderGeometry(1.2, 2.4, 12, 8),
  canopy: new THREE.SphereGeometry(0.85, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  wing: new THREE.BoxGeometry(10, 0.18, 2.6),
  tip: new THREE.BoxGeometry(0.3, 0.8, 2.8),
  fin: new THREE.BoxGeometry(0.18, 1.8, 2.2),
  spike: new THREE.ConeGeometry(0.3, 2.2, 6),
  cargo: new THREE.BoxGeometry(4.6, 3.2, 7),
  stub: new THREE.BoxGeometry(9, 0.3, 2),
  engine: new THREE.CylinderGeometry(0.55, 0.65, 3, 10),
  flame: new THREE.ConeGeometry(0.5, 1, 10).translate(0, 0.5, 0),
  light: new THREE.BoxGeometry(0.35, 0.22, 0.5),
  nav: new THREE.SphereGeometry(0.15, 8, 6),
};

const M = {
  canopy: std(0x66ddff, { metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.55 }),
  dark: std(0x22252e, { metalness: 0.7, roughness: 0.35 }),
  white: std(0xe8e8ee),
  flameBlue: additive(0x66ccff),
  flameRed: additive(0xff6633),
  red: basic(0xff1133),
  blue: basic(0x1166ff),
  navR: basic(0xff2222),
  navG: basic(0x22ff44),
};

// Ships face -Z. userData: flames (scale.y = thrust), canopy, police lights, hull material.
export function buildShipMesh(kind, color, team) {
  const g = new THREE.Group();
  const add = adder(g);
  const hull = std(color);
  const accent = team === 'police' ? M.white : M.dark;
  const big = kind === 'hauler';
  const L = big ? 12 : 9;

  add(big ? G.fusBig : G.fus, hull, 0, 0, 0, -Math.PI / 2);
  const canopy = add(G.canopy, M.canopy, 0, big ? 1.4 : 0.55, big ? -3 : -1.2);
  canopy.scale.set(1, 0.8, 2);

  if (big) {
    add(G.cargo, accent, 0, 0.6, 2.2);
    add(G.stub, hull, 0, -0.4, 2.5);
  } else {
    add(G.wing, hull, 0, -0.25, 1.6);
    add(G.tip, accent, -5, -0.1, 1.6);
    add(G.tip, accent, 5, -0.1, 1.6);
    add(G.fin, accent, 0, 1.1, 3.4);
  }
  if (team === 'pirate') {
    add(G.spike, M.dark, -3, 0.6, 1.2, 0, 0, 0.5);
    add(G.spike, M.dark, 3, 0.6, 1.2, 0, 0, -0.5);
    add(G.spike, M.dark, 0, 0, -L / 2 - 0.6, -Math.PI / 2);
  }

  const flames = [];
  const ex = big ? 2.2 : 1.3;
  for (const sx of [-ex, ex]) {
    add(G.engine, M.dark, sx, -0.1, L / 2 - 0.8, Math.PI / 2);
    flames.push(add(G.flame, team === 'pirate' ? M.flameRed : M.flameBlue, sx, -0.1, L / 2 + 0.7, Math.PI / 2));
  }
  const tipX = big ? 4.5 : 5.1;
  add(G.nav, M.navR, -tipX, 0, big ? 2.5 : 1.6);
  add(G.nav, M.navG, tipX, 0, big ? 2.5 : 1.6);

  const lights = [];
  if (team === 'police') {
    const y = big ? 2 : 1.05;
    lights.push(add(G.light, M.red, -0.35, y, 0.8), add(G.light, M.blue, 0.35, y, 0.8));
  }
  g.userData = { flames, canopy, lights, hull };
  return g;
}

export function buildAvatar() {
  const g = new THREE.Group();
  const add = adder(g);
  const suit = std(0xf4f4f6, { metalness: 0.1, roughness: 0.6 });
  const pink = std(0xff2e88, { metalness: 0.2, roughness: 0.5 });
  const visor = std(0xffb000, { metalness: 1, roughness: 0.1 });
  add(new THREE.CylinderGeometry(0.12, 0.11, 0.85, 8), suit, -0.14, 0.43, 0);
  add(new THREE.CylinderGeometry(0.12, 0.11, 0.85, 8), suit, 0.14, 0.43, 0);
  add(new THREE.CapsuleGeometry(0.3, 0.45, 4, 10), suit, 0, 1.15, 0);
  add(new THREE.BoxGeometry(0.62, 0.1, 0.42), pink, 0, 0.95, 0);
  add(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), suit, -0.42, 1.12, 0, 0, 0, 0.15);
  add(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), suit, 0.42, 1.12, 0, 0, 0, -0.15);
  add(new THREE.SphereGeometry(0.28, 16, 12), suit, 0, 1.68, 0);
  add(new THREE.SphereGeometry(0.2, 16, 12), visor, 0, 1.69, -0.13).scale.set(1.05, 0.75, 0.7);
  add(new THREE.BoxGeometry(0.46, 0.56, 0.26), pink, 0, 1.2, 0.3);
  const jets = [];
  for (const x of [-0.12, 0.12]) {
    const j = add(G.flame, M.flameBlue, x, 0.9, 0.32, Math.PI);
    j.scale.set(0.3, 0.6, 0.3);
    jets.push(j);
  }
  g.userData.jets = jets;
  return g;
}

export function buildDroid() {
  const g = new THREE.Group();
  const add = adder(g);
  const body = std(pickOne(PAINT), { metalness: 0.4, roughness: 0.4 });
  add(new THREE.CylinderGeometry(0.32, 0.36, 0.12, 12), M.dark, 0, 0.06, 0);
  add(new THREE.CylinderGeometry(0.28, 0.32, 0.8, 14), body, 0, 0.5, 0);
  add(new THREE.SphereGeometry(0.29, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.white, 0, 0.9, 0);
  add(new THREE.SphereGeometry(0.07, 8, 6), basic(0x29f0ff), 0, 1.02, -0.25);
  add(new THREE.BoxGeometry(0.08, 0.4, 0.08), M.dark, -0.34, 0.55, 0, 0, 0, 0.2);
  add(new THREE.BoxGeometry(0.08, 0.4, 0.08), M.dark, 0.34, 0.55, 0, 0, 0, -0.2);
  return g;
}

let crateTex;
export function buildCrate() {
  if (!crateTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#0b1a10'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#22ff88'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
    g.fillStyle = '#8dff6b'; g.font = 'bold 90px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('$', 64, 70);
    crateTex = new THREE.CanvasTexture(c);
    crateTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2.4, 2.4),
    new THREE.MeshStandardMaterial({ map: crateTex, emissive: 0xffffff, emissiveMap: crateTex, emissiveIntensity: 0.9 }),
  );
}

export function buildBlaster() {
  const g = new THREE.Group();
  const add = adder(g);
  add(new THREE.BoxGeometry(0.035, 0.11, 0.05), M.dark, 0, -0.05, 0.02, 0.3);
  add(new THREE.BoxGeometry(0.05, 0.05, 0.2), std(0xff2e88), 0, 0, -0.06);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), M.dark, 0, 0.01, -0.2, Math.PI / 2);
  add(new THREE.SphereGeometry(0.015, 8, 6), basic(0x39ff14), 0, 0.01, -0.24);
  return g;
}
