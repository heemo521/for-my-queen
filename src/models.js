// Procedural detailed models: ships (fighter / hauler, civ / police / pirate liveries),
// cockpit interior, astronaut, droids, cash crates, blaster.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullTextures, glowTexture, canvas, toTexture } from './textures.js';

export const PAINT = [0xd8dde6, 0xffb000, 0x2b7bff, 0x22c55e, 0xe11d48, 0x9b5de5, 0xf15bb5, 0x00bbf9, 0xff6b35, 0x8a9199];

const V2 = THREE.Vector2;
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o });
const additive = color => basic(color, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

let glowTex;
const glowSprite = (color, scale) => {
  glowTex ||= glowTexture();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  s.scale.setScalar(scale);
  return s;
};

function hullMat(color, o = {}) {
  const t = hullTextures();
  return new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 1, map: t.map, roughnessMap: t.roughnessMap, bumpMap: t.bumpMap, bumpScale: 0.6, ...o });
}

function scaleUV(geo, s, sy = s) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * sy);
  return geo;
}

const adder = g => (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
};

function decal(text, fg, bg) {
  const c = canvas(256, 128), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.font = 'bold 54px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 66);
  return toTexture(c);
}

// ---------- shared geometry ----------
const G = {};
function geos() {
  if (G.ready) return G;
  const prof = [[0, -5], [0.9, -4.9], [1.25, -4], [1.35, -2], [1.3, 0], [1.1, 1.5], [0.8, 3], [0.45, 4.2], [0.15, 4.9], [0, 5.1]].map(([r, y]) => new V2(r, y));
  G.fus = scaleUV(new THREE.LatheGeometry(prof, 18).rotateX(-Math.PI / 2).scale(1.1, 0.75, 1), 4, 3);
  const wing = new THREE.Shape([new V2(0.9, 0.8), new V2(6.2, -1.6), new V2(6.2, -2.6), new V2(0.9, -2.8)]);
  G.wing = scaleUV(new THREE.ExtrudeGeometry(wing, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.06, bevelSegments: 1 }).translate(0, 0, -0.11).rotateX(-Math.PI / 2), 0.45);
  const fin = new THREE.Shape([new V2(0, 0), new V2(1.9, 0), new V2(1.5, 1.7), new V2(0.9, 1.75)]);
  G.fin = scaleUV(new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false }).translate(-0.6, 0, -0.06).rotateY(-Math.PI / 2), 0.4);
  G.canopy = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  G.arch = new THREE.TorusGeometry(1, 0.05, 6, 20, Math.PI);
  G.cannon = new THREE.CylinderGeometry(0.2, 0.22, 3.2, 10).rotateX(Math.PI / 2);
  G.barrel = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8).rotateX(Math.PI / 2);
  G.nacelle = new THREE.CylinderGeometry(0.62, 0.55, 3.2, 16).rotateX(Math.PI / 2);
  G.intake = new THREE.TorusGeometry(0.6, 0.09, 8, 20);
  G.nozzle = new THREE.CylinderGeometry(0.45, 0.6, 0.7, 16, 1, true).rotateX(Math.PI / 2);
  G.glowDisk = new THREE.CircleGeometry(0.44, 16);
  G.flame = new THREE.ConeGeometry(0.42, 1, 12, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.strut = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
  G.foot = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10);
  G.nav = new THREE.SphereGeometry(0.12, 8, 6);
  G.antenna = new THREE.CylinderGeometry(0.025, 0.025, 1.4, 4);
  G.cabin = new THREE.BoxGeometry(3.4, 2.4, 3.6);
  G.ready = true;
  return G;
}

const M = {};
function mats() {
  if (M.ready) return M;
  M.glass = new THREE.MeshStandardMaterial({ color: 0x0a1a28, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.45, envMapIntensity: 2 });
  M.dark = hullMat(0x2a2d34, { metalness: 0.75 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.6, roughness: 0.6 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xbfc4cc, metalness: 1, roughness: 0.25 });
  M.white = hullMat(0xe8ebf0);
  M.flameBlue = additive(0x66ccff);
  M.flameRed = additive(0xff6633);
  M.diskBlue = basic(0x9fe4ff);
  M.diskRed = basic(0xffa070);
  M.red = basic(0xff1133);
  M.blue = basic(0x1166ff);
  M.navR = basic(0xff2222);
  M.navG = basic(0x22ff44);
  M.navW = basic(0xffffff);
  M.police = new THREE.MeshStandardMaterial({ map: decal('POLICE', '#ffffff', '#14213d'), metalness: 0.4, roughness: 0.5 });
  M.pirate = new THREE.MeshStandardMaterial({ map: decal('☠', '#ff3333', '#120606'), metalness: 0.4, roughness: 0.6 });
  {
    const c = canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 8) { g.fillStyle = '#9a9a9a'; g.fillRect(x, 0, 3, 128); }
    g.fillStyle = 'rgba(60,40,20,0.35)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 128, Math.random() * 128, Math.random() * 10, Math.random() * 30);
    M.containerTex = toTexture(c);
  }
  M.ready = true;
  return M;
}

// Collapse a ship's static parts into one mesh per material (huge draw-call saving on Quest).
function mergeStatic(g, keep) {
  const byMat = new Map();
  for (const child of [...g.children]) {
    if (!child.isMesh || keep.has(child)) continue;
    child.updateMatrix();
    let geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    geo.applyMatrix4(child.matrix);
    if (child.matrix.determinant() < 0) {
      // mirrored part: restore triangle winding
      for (const attr of Object.values(geo.attributes)) {
        const a = attr.array, n = attr.itemSize;
        for (let t = 0; t < attr.count; t += 3) {
          for (let k = 0; k < n; k++) {
            const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k;
            [a[i1], a[i2]] = [a[i2], a[i1]];
          }
        }
      }
    }
    if (!byMat.has(child.material)) byMat.set(child.material, []);
    byMat.get(child.material).push(geo);
    g.remove(child);
  }
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
}

// Ships face -Z. userData: flames, canopy, lights (police), hull material, guns, nozzles, gear, strobes.
export function buildShipMesh(kind, color, team) {
  geos(); mats();
  return kind === 'hauler' ? buildHauler(color, team) : buildFighter(color, team);
}

function buildFighter(color, team) {
  const g = new THREE.Group();
  const add = adder(g);
  const hull = hullMat(color);
  const wingMat = team === 'police' ? M.white : team === 'pirate' ? M.dark : hull;
  add(G.fus, hull);
  const canopy = add(G.canopy, M.glass, 0, 0.62, -1.4);
  canopy.scale.set(0.72, 0.6, 1.7);
  canopy.castShadow = false;
  for (const z of [-2.3, -1.0]) {
    const a = add(G.arch, M.black, 0, 0.62, z);
    a.scale.set(0.7 * Math.sqrt(1 - ((z + 1.4) / 1.7) ** 2), 0.58 * Math.sqrt(1 - ((z + 1.4) / 1.7) ** 2), 1);
  }
  add(G.box, M.black, 0, 1.18, -1.4).scale.set(0.06, 0.05, 2.6);

  add(G.wing, wingMat, 0, -0.25, 0.8);
  add(G.wing, wingMat, 0, -0.25, 0.8).scale.x = -1;
  const guns = [];
  for (const s of [-1, 1]) {
    add(G.cannon, M.dark, s * 6.2, -0.25, 0.1);
    add(G.barrel, M.chrome, s * 6.2, -0.25, -2.2);
    guns.push(new THREE.Vector3(s * 6.2, -0.25, -3.1));
    add(G.fin, team === 'police' ? M.police : team === 'pirate' ? M.pirate : wingMat, s * 0.75, 0.55, 3.6, 0, 0, -s * 0.3);
  }

  const flames = [], nozzles = [];
  for (const s of [-1, 1]) {
    const x = s * 1.55;
    add(G.nacelle, M.dark, x, -0.1, 3.7);
    add(G.intake, M.chrome, x, -0.1, 2.1);
    add(G.nozzle, M.black, x, -0.1, 5.55);
    add(G.glowDisk, team === 'pirate' ? M.diskRed : M.diskBlue, x, -0.1, 5.5);
    const f = add(G.flame, team === 'pirate' ? M.flameRed : M.flameBlue, x, -0.1, 5.6);
    f.castShadow = false;
    flames.push(f);
    nozzles.push(new THREE.Vector3(x, -0.1, 6));
  }
  // greebles
  add(G.box, M.dark, 0, 0.75, 0.8).scale.set(0.9, 0.25, 1.4);
  add(G.box, M.dark, 0.5, 0.7, 2.2).scale.set(0.3, 0.2, 0.8);
  add(G.box, M.dark, -0.5, 0.7, 2.2).scale.set(0.3, 0.2, 0.8);
  add(G.antenna, M.chrome, 0.3, 1.3, 3.0);
  if (team === 'pirate') {
    const spike = new THREE.ConeGeometry(0.25, 2.4, 6);
    add(spike, M.black, 0, 0, -6.2, -Math.PI / 2);
    add(spike, M.black, -3.5, -0.2, -0.8, -Math.PI / 2);
    add(spike, M.black, 3.5, -0.2, -0.8, -Math.PI / 2);
  }

  const gear = gearGroup([[0, -2.6], [-1.5, 1.8], [1.5, 1.8]], 1.0, -0.85);
  g.add(gear);

  const strobes = navLights(g, add, 6.2, -0.25, -0.5, [0.3, 2.0, 3.0]);
  const lights = [];
  if (team === 'police') lights.push(...lightBar(g, add, 0, 1.0, 0.3));

  mergeStatic(g, new Set([...flames, canopy, ...lights]));
  g.userData = { flames, canopy, lights, hull, guns, nozzles, gear, strobes, seat: new THREE.Vector3(0, 0.62, -1.15), hover: 1.95 };
  return g;
}

function buildHauler(color, team) {
  const g = new THREE.Group();
  const add = adder(g);
  const hull = hullMat(color);
  add(G.cabin, hull, 0, 0.6, -6.2);
  const nose = add(G.box, hull, 0, 0.2, -8.4);
  nose.scale.set(3, 1.6, 1);
  nose.rotation.x = 0.35;
  const canopy = add(G.box, M.glass, 0, 1.55, -7.7);
  canopy.scale.set(2.8, 0.7, 1.5);
  canopy.rotation.x = -0.5;
  canopy.castShadow = false;
  add(G.box, M.dark, 0, 0.2, 0.5).scale.set(1.5, 1.4, 11);
  const cmat = new THREE.MeshStandardMaterial({ map: M.containerTex, color: pickOne([0xc0392b, 0x2980b9, 0x27ae60, 0xd35400, 0x8e44ad, 0x7f8c8d]), metalness: 0.4, roughness: 0.7 });
  for (const z of [-2.5, 2.0]) {
    add(G.box, cmat, -1.55, 0.5, z).scale.set(1.5, 2.4, 4.2);
    add(G.box, cmat, 1.55, 0.5, z).scale.set(1.5, 2.4, 4.2);
  }
  add(G.box, hull, 0, -0.4, 4).scale.set(10, 0.3, 2.2);
  const flames = [], nozzles = [];
  for (const [x, y] of [[-1.2, 1.1], [1.2, 1.1], [-1.2, -0.7], [1.2, -0.7]]) {
    add(G.nacelle, M.dark, x, y, 6.7);
    add(G.nozzle, M.black, x, y, 8.55);
    add(G.glowDisk, M.diskBlue, x, y, 8.5);
    const f = add(G.flame, M.flameBlue, x, y, 8.6);
    f.castShadow = false;
    flames.push(f);
    nozzles.push(new THREE.Vector3(x, y, 9));
  }
  add(G.antenna, M.chrome, 0.8, 2.4, -5.5);
  const gear = gearGroup([[-1.4, -6], [1.4, -6], [-1.6, 4], [1.6, 4]], 1.4, -0.9);
  g.add(gear);
  const strobes = navLights(g, add, 5, -0.4, 4, [0.3, 2.6, -5.2]);
  const lights = [];
  if (team === 'police') lights.push(...lightBar(g, add, 0, 1.95, -6.2));
  mergeStatic(g, new Set([...flames, canopy, ...lights]));
  g.userData = {
    flames, canopy, lights, hull, guns: [new THREE.Vector3(-1.8, -0.2, -7.5), new THREE.Vector3(1.8, -0.2, -7.5)],
    nozzles, gear, strobes, seat: new THREE.Vector3(0, 1.0, -6.6), hover: 2.75,
  };
  return g;
}

function gearGroup(points, len, top) {
  const gear = new THREE.Group();
  for (const [x, z] of points) {
    const s = new THREE.Mesh(G.strut, M.chrome);
    s.scale.y = len;
    s.position.set(x, top - len / 2, z);
    const f = new THREE.Mesh(G.foot, M.black);
    f.position.set(x, top - len, z);
    s.castShadow = f.castShadow = true;
    gear.add(s, f);
  }
  return gear;
}

function navLights(g, add, tipX, y, z, tail) {
  const l = add(G.nav, M.navR, -tipX, y, z), r = add(G.nav, M.navG, tipX, y, z), t = add(G.nav, M.navW, ...tail);
  const sl = glowSprite(0xff3333, 1.6), sr = glowSprite(0x33ff55, 1.6), st = glowSprite(0xffffff, 2.6);
  sl.position.copy(l.position); sr.position.copy(r.position); st.position.copy(t.position);
  g.add(sl, sr, st);
  return [st];
}

function lightBar(g, add, x, y, z) {
  add(G.box, M.black, x, y - 0.08, z).scale.set(1.1, 0.12, 0.35);
  const r = add(G.box, M.red, x - 0.32, y, z), b = add(G.box, M.blue, x + 0.32, y, z);
  r.scale.set(0.42, 0.2, 0.3);
  b.scale.set(0.42, 0.2, 0.3);
  const gr = glowSprite(0xff2233, 5), gb = glowSprite(0x2255ff, 5);
  gr.position.copy(r.position); gb.position.copy(b.position);
  g.add(gr, gb);
  r.userData.glow = gr;
  b.userData.glow = gb;
  return [r, b];
}

// Interior for the ship you're flying (visible in VR / first person).
export function buildCockpit(ship, screenTex) {
  geos(); mats();
  const ud = ship.userData;
  const g = new THREE.Group();
  const seat = ud.seat;
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, metalness: 0.5, roughness: 0.6 });
  const dash = new THREE.Mesh(G.box, dashMat);
  dash.scale.set(1.2, 0.08, 0.55);
  dash.position.set(seat.x, seat.y - 0.38, seat.z - 0.72);
  dash.rotation.x = 0.55;
  g.add(dash);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3125), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(seat.x, seat.y - 0.3, seat.z - 0.66);
  screen.rotation.x = -0.6;
  g.add(screen);
  const sideTex = (() => {
    const c = canvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#031014'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#29f0ff'; x.lineWidth = 2;
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(8, 20 + i * 18); x.lineTo(8 + Math.random() * 110, 20 + i * 18); x.stroke(); }
    return toTexture(c);
  })();
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), new THREE.MeshBasicMaterial({ map: sideTex, toneMapped: false }));
    p.position.set(seat.x + s * 0.4, seat.y - 0.32, seat.z - 0.6);
    p.rotation.set(-0.6, -s * 0.4, 0);
    g.add(p);
    const rail = new THREE.Mesh(G.box, M.black);
    rail.scale.set(0.05, 0.05, 2.2);
    rail.position.set(seat.x + s * 0.68, seat.y - 0.02, seat.z - 0.3);
    g.add(rail);
  }
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.35, 8), M.black);
  stick.position.set(seat.x + 0.18, seat.y - 0.65, seat.z - 0.3);
  stick.rotation.x = -0.3;
  g.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.red);
  knob.position.set(seat.x + 0.18, seat.y - 0.48, seat.z - 0.36);
  g.add(knob);
  const throttle = new THREE.Mesh(G.box, M.chrome);
  throttle.scale.set(0.04, 0.2, 0.04);
  throttle.position.set(seat.x - 0.3, seat.y - 0.55, seat.z - 0.3);
  g.add(throttle);
  g.userData = { stick, throttle };
  return g;
}

// ---------- astronaut with walk animation ----------
export function buildAvatar() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xeef0f3, metalness: 0.05, roughness: 0.75 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff2e88, metalness: 0.2, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e35, metalness: 0.4, roughness: 0.5 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xffb000, metalness: 1, roughness: 0.05, envMapIntensity: 2.5 });
  const mk = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const limb = (parent, x, y, upper, lower, r) => {
    const hip = new THREE.Group();
    hip.position.set(x, y, 0);
    parent.add(hip);
    mk(new THREE.CapsuleGeometry(r, upper, 4, 10), suit, hip, 0, -upper / 2 - r * 0.5, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -upper - r, 0);
    hip.add(knee);
    mk(new THREE.CapsuleGeometry(r * 0.92, lower, 4, 10), suit, knee, 0, -lower / 2 - r * 0.4, 0);
    return { hip, knee };
  };
  const body = new THREE.Group();
  g.add(body);
  const legL = limb(body, -0.14, 0.95, 0.36, 0.34, 0.11);
  const legR = limb(body, 0.14, 0.95, 0.36, 0.34, 0.11);
  for (const leg of [legL, legR]) mk(new THREE.BoxGeometry(0.2, 0.12, 0.32), dark, leg.knee, 0, -0.48, -0.04);
  mk(new THREE.CapsuleGeometry(0.27, 0.36, 4, 12), suit, body, 0, 1.22, 0);
  mk(new THREE.BoxGeometry(0.6, 0.11, 0.42), pink, body, 0, 0.98, 0);
  mk(new THREE.BoxGeometry(0.26, 0.18, 0.06), dark, body, 0, 1.3, -0.27);
  const chestLight = mk(new THREE.BoxGeometry(0.05, 0.03, 0.01), basic(0x39ff14), body, -0.06, 1.33, -0.305);
  const armL = limb(body, -0.38, 1.46, 0.26, 0.24, 0.085);
  const armR = limb(body, 0.38, 1.46, 0.26, 0.24, 0.085);
  for (const arm of [armL, armR]) mk(new THREE.SphereGeometry(0.09, 10, 8), dark, arm.knee, 0, -0.36, 0);
  armL.hip.rotation.z = 0.12;
  armR.hip.rotation.z = -0.12;
  mk(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 16), dark, body, 0, 1.58, 0);
  mk(new THREE.SphereGeometry(0.27, 20, 16), suit, body, 0, 1.78, 0);
  const v = mk(new THREE.SphereGeometry(0.2, 20, 14), visor, body, 0, 1.79, -0.12);
  v.scale.set(1.05, 0.75, 0.75);
  mk(new THREE.BoxGeometry(0.46, 0.58, 0.26), pink, body, 0, 1.25, 0.3);
  mk(new THREE.BoxGeometry(0.36, 0.16, 0.06), dark, body, 0, 1.4, 0.44);
  const gun = buildBlaster();
  gun.scale.setScalar(1.6);
  gun.position.set(0, -0.42, -0.05);
  gun.rotation.x = -Math.PI / 2;
  armR.knee.add(gun);
  // glowing life-balance strip on the left forearm
  const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), basic(0x22ff88));
  wrist.position.set(0.07, -0.2, -0.02);
  wrist.rotation.y = 0.6;
  armL.knee.add(wrist);
  const jets = [];
  for (const x of [-0.12, 0.12]) {
    const j = mk(new THREE.ConeGeometry(0.07, 0.5, 8, 1, true).translate(0, -0.25, 0), additive(0x66ccff), body, x, 0.95, 0.36);
    j.castShadow = false;
    jets.push(j);
  }
  g.userData = { jets, legL, legR, armL, armR, body, chestLight, phase: 0, hand: armR.knee, gun, wrist };
  return g;
}

// speed: horizontal speed in m/s; airborne skips the walk cycle.
export function animateAvatar(av, dt, speed, airborne, aiming) {
  const u = av.userData;
  u.phase += dt * (2 + speed * 1.6);
  const amp = airborne ? 0 : Math.min(1, speed / 6) * 0.7;
  const s = Math.sin(u.phase);
  const lerp = (cur, target) => cur + (target - cur) * Math.min(1, dt * 12);
  u.legL.hip.rotation.x = lerp(u.legL.hip.rotation.x, airborne ? 0.3 : s * amp);
  u.legR.hip.rotation.x = lerp(u.legR.hip.rotation.x, airborne ? -0.2 : -s * amp);
  u.legL.knee.rotation.x = lerp(u.legL.knee.rotation.x, airborne ? -0.5 : Math.max(0, -s) * amp * 1.2 * -1);
  u.legR.knee.rotation.x = lerp(u.legR.knee.rotation.x, airborne ? -0.3 : Math.max(0, s) * amp * 1.2 * -1);
  u.armL.hip.rotation.x = lerp(u.armL.hip.rotation.x, -s * amp * 0.8);
  u.armR.hip.rotation.x = lerp(u.armR.hip.rotation.x, aiming ? 1.45 : s * amp * 0.8);
  u.armR.knee.rotation.x = lerp(u.armR.knee.rotation.x, aiming ? 0 : -0.3);
  u.body.position.y = airborne ? 0 : Math.abs(Math.cos(u.phase)) * amp * 0.06;
  u.body.rotation.x = lerp(u.body.rotation.x, -Math.min(0.25, speed * 0.02));
}

export function buildDroid() {
  const g = new THREE.Group();
  const add = adder(g);
  const body = new THREE.MeshStandardMaterial({ color: pickOne(PAINT), metalness: 0.6, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262d, metalness: 0.7, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ebf0, metalness: 0.5, roughness: 0.3 });
  add(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 14), dark, 0, 0.07, 0);
  add(new THREE.CylinderGeometry(0.27, 0.31, 0.75, 16), body, 0, 0.52, 0);
  add(new THREE.CylinderGeometry(0.29, 0.29, 0.06, 16), dark, 0, 0.7, 0);
  add(new THREE.SphereGeometry(0.28, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 0.9, 0);
  add(new THREE.SphereGeometry(0.075, 10, 8), basic(0x29f0ff), 0, 1.02, -0.24);
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), dark, 0.12, 1.25, 0);
  add(new THREE.BoxGeometry(0.07, 0.4, 0.07), dark, -0.34, 0.55, 0, 0, 0, 0.2);
  add(new THREE.BoxGeometry(0.07, 0.4, 0.07), dark, 0.34, 0.55, 0, 0, 0, -0.2);
  add(new THREE.BoxGeometry(0.12, 0.08, 0.02), basic(0xff2e88), 0, 0.6, -0.3);
  return g;
}

let crateTex;
export function buildCrate() {
  if (!crateTex) {
    const c = canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = '#0b1a10'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#22ff88'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
    g.strokeStyle = 'rgba(34,255,136,0.4)'; g.lineWidth = 3; g.strokeRect(18, 18, 92, 92);
    g.fillStyle = '#8dff6b'; g.font = 'bold 80px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('$', 64, 70);
    crateTex = toTexture(c);
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), new THREE.MeshStandardMaterial({ map: crateTex, emissive: 0xffffff, emissiveMap: crateTex, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.4 }));
  m.add(glowSprite(0x22ff88, 9));
  return m;
}

export function buildBlaster() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272e, metalness: 0.8, roughness: 0.35 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff2e88, metalness: 0.4, roughness: 0.4 });
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  add(new THREE.BoxGeometry(0.035, 0.11, 0.05), dark, 0, -0.05, 0.02, 0.3);
  add(new THREE.BoxGeometry(0.05, 0.055, 0.2), pink, 0, 0, -0.06);
  add(new THREE.BoxGeometry(0.03, 0.02, 0.12), dark, 0, 0.035, -0.04);
  add(new THREE.CylinderGeometry(0.012, 0.014, 0.1, 8), dark, 0, 0.01, -0.2, Math.PI / 2);
  add(new THREE.SphereGeometry(0.012, 8, 6), basic(0x39ff14), 0, 0.01, -0.25);
  g.userData.muzzle = new THREE.Vector3(0, 0.01, -0.27);
  return g;
}
