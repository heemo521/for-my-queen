import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { buildWorld, DECK_R, rand, pick } from './world.js';
import { buildShipMesh, buildAvatar, buildDroid, buildCrate, buildBlaster, PAINT } from './models.js';
import { Input } from './input.js';
import { drawHUD } from './hud.js';
import { Sound } from './audio.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0), ORIGIN = new V3();
const tA = new V3(), tB = new V3(), tC = new V3(), tQ = new THREE.Quaternion(), tM = new THREE.Matrix4(), tE = new THREE.Euler();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const xzLen = p => Math.hypot(p.x, p.z);
const randUnit = () => {
  const v = new V3();
  do v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)); while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
  return v.normalize();
};

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('app').appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 40000);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const world = buildWorld(scene);
const input = new Input(renderer.domElement);
const sound = new Sound();

// VR controllers: right hand holds the blaster
const controllers = [0, 1].map(i => {
  const c = renderer.xr.getController(i);
  c.addEventListener('connected', e => {
    c.userData.hand = e.data.handedness;
    if (e.data.handedness === 'right' && !c.userData.gun) {
      c.userData.gun = buildBlaster();
      c.add(c.userData.gun);
    }
  });
  c.addEventListener('disconnected', () => { c.userData.hand = null; });
  rig.add(c);
  return c;
});
// Show the real Quest Touch controllers in your hands.
const controllerModels = new XRControllerModelFactory();
for (const i of [0, 1]) {
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModels.createControllerModel(grip));
  rig.add(grip);
}
const rightController = () => controllers.find(c => c.userData.hand === 'right');

// HUD: DOM canvas on desktop, lazy-follow panel in VR
const hudCanvas = document.getElementById('hud');
const hudCtx = hudCanvas.getContext('2d');
const vrCanvas = document.createElement('canvas');
vrCanvas.width = 1024;
vrCanvas.height = 640;
const vrCtx = vrCanvas.getContext('2d');
const vrTex = new THREE.CanvasTexture(vrCanvas);
vrTex.colorSpace = THREE.SRGBColorSpace;
const vrHud = new THREE.Mesh(
  new THREE.PlaneGeometry(0.8, 0.5),
  new THREE.MeshBasicMaterial({ map: vrTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
);
vrHud.renderOrder = 999;
vrHud.visible = false;
rig.add(vrHud);

const arrow = new THREE.Mesh(
  new THREE.ConeGeometry(0.06, 0.2, 12),
  new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false, toneMapped: false, transparent: true }),
);
arrow.renderOrder = 998;
arrow.visible = false;
rig.add(arrow);

function resize() {
  hudCanvas.width = innerWidth;
  hudCanvas.height = innerHeight;
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

// ---------- game state ----------
const S = {
  started: false, mode: 'foot', ship: null, credits: 250, wanted: 0, evade: 0, health: 100,
  deadT: 0, deathPos: new V3(), view: 'third', msg: '', msgT: 0, big: '', bigSub: '', bigColor: '#fff', bigT: 0,
  mission: null, nextMission: 0, radioName: '', radioT: 0, dmg: 0, spray: 0, sprayDone: false, prompt: '',
  stickX: 0, stickY: 0, snapLatch: false, camOff: new V3(), upkeepT: 0, time: 0, hudOn: true, frame: 0,
};
const player = { pos: world.spawn.clone(), vel: new V3(), yaw: 0, pitch: -0.1, onGround: true, fireCd: 0, avatar: buildAvatar() };
player.yaw = Math.atan2(player.pos.x, player.pos.z); // face the plaza
scene.add(player.avatar);

const message = (text, t = 3) => { S.msg = text; S.msgT = t; };
const bigText = (text, sub = '', color = '#fff', t = 3) => { S.big = text; S.bigSub = sub; S.bigColor = color; S.bigT = t; };

function addWanted(add, min = 0) {
  const prev = S.wanted;
  S.wanted = clamp(Math.max(S.wanted + add, min), 0, 5);
  S.evade = 0;
  if (S.wanted > prev) message('Wanted level ' + '★'.repeat(S.wanted), 2);
}

function playerPos() {
  if (S.mode === 'ship' && S.ship) return S.ship.pos.clone();
  if (S.mode === 'dead') return S.deathPos.clone();
  return player.pos.clone().add(tA.set(0, 1, 0));
}
const playerVel = () => (S.mode === 'ship' && S.ship ? S.ship.vel : player.vel);
const volAt = p => clamp(1 - p.distanceTo(playerPos()) / 900, 0, 1);

// ---------- ships ----------
let ships = [];
let shipId = 0;
class Ship {
  constructor(team, kind, opts = {}) {
    this.id = shipId++;
    this.team = team;
    this.kind = kind;
    const color = opts.color ?? (team === 'police' ? 0x1b2a4a : team === 'pirate' ? 0x3a0d0d : pick(PAINT));
    this.mesh = buildShipMesh(kind, color, team);
    scene.add(this.mesh);
    this.vel = new V3();
    this.ctrl = { throttle: 0, pitch: 0, yaw: 0, roll: 0, lift: 0, boost: false };
    this.maxHull = team === 'police' ? 140 : team === 'pirate' ? 220 : kind === 'hauler' ? 160 : 100;
    this.hull = this.maxHull;
    this.radius = kind === 'hauler' ? 7 : 5;
    this.hover = kind === 'hauler' ? 2.6 : 1.8;
    this.pilot = opts.pilot === undefined ? 'npc' : opts.pilot;
    this.owner = opts.owner ?? team;
    this.parked = !!opts.parked;
    this.fireCd = 0;
    this.alive = true;
    this.ai = { dest: null, flee: 0, state: 'cruise', home: null, aggro: false };
    ships.push(this);
  }
  get pos() { return this.mesh.position; }
  fwd(out = new V3()) { return out.set(0, 0, -1).applyQuaternion(this.mesh.quaternion); }
  up(out = new V3()) { return out.set(0, 1, 0).applyQuaternion(this.mesh.quaternion); }
  right(out = new V3()) { return out.set(1, 0, 0).applyQuaternion(this.mesh.quaternion); }
}

function faceToward(s, target) {
  tM.lookAt(s.pos, target, UP);
  s.mesh.quaternion.setFromRotationMatrix(tM);
}

function removeShip(s) {
  s.alive = false;
  scene.remove(s.mesh);
}

function parkShip(pad, owner) {
  const mine = owner === 'player';
  const s = new Ship('civ', mine || Math.random() < 0.7 ? 'fighter' : 'hauler', {
    color: mine ? 0xffc23d : undefined, parked: true, owner,
    pilot: mine ? null : Math.random() < 0.6 ? 'npc' : null,
  });
  s.pos.copy(pad.pos).setY(s.hover);
  s.mesh.rotation.set(0, Math.atan2(-pad.pos.x, -pad.pos.z), 0);
  return s;
}

const padFree = pad => !ships.some(s => s.alive && s.pos.distanceTo(pad.pos) < 10);

function pickDest() {
  if (Math.random() < 0.35) return new V3(rand(-60, 60), rand(50, 90), rand(-60, 60));
  return pick(world.beacons).pos.clone().add(randUnit().multiplyScalar(60));
}

function spawnCivilian() {
  const from = pick(world.beacons);
  const s = new Ship('civ', Math.random() < 0.3 ? 'hauler' : 'fighter');
  s.pos.copy(from.pos).add(randUnit().multiplyScalar(rand(60, 200)));
  s.ai.dest = pickDest();
  faceToward(s, s.ai.dest);
  s.vel.copy(s.fwd(tA)).multiplyScalar(60);
}

function patrolPoint() {
  const a = rand(0, Math.PI * 2), r = rand(150, 450);
  return new V3(Math.cos(a) * r, rand(40, 180), Math.sin(a) * r);
}

function spawnPatrol() {
  const s = new Ship('police', 'fighter');
  s.ai.state = 'patrol';
  s.pos.copy(patrolPoint());
  s.ai.dest = patrolPoint();
  faceToward(s, s.ai.dest);
}

function spawnPursuer() {
  const tgt = playerPos();
  const s = new Ship('police', 'fighter');
  s.ai.state = 'pursue';
  s.pos.copy(tgt).add(randUnit().multiplyScalar(rand(600, 850)));
  if (world.planets.some(p => s.pos.distanceTo(p.pos) < p.r + 40)) s.pos.y += 1000;
  faceToward(s, tgt);
  s.vel.copy(s.fwd(tA)).multiplyScalar(120);
}

// Shared flight model for player and AI: arcade 6DOF with drag and lateral grip.
function stepShip(s, dt) {
  const c = s.ctrl;
  tQ.setFromEuler(tE.set(c.pitch * 1.5 * dt, c.yaw * 1.3 * dt, c.roll * 2.4 * dt));
  s.mesh.quaternion.multiply(tQ).normalize();
  const f = s.fwd(tA), u = s.up(tB);
  const accel = 70 * (c.boost ? 2.4 : 1);
  s.vel.addScaledVector(f, c.throttle * accel * dt).addScaledVector(u, c.lift * 40 * dt);
  s.vel.multiplyScalar(Math.exp(-0.55 * dt));
  const fs = s.vel.dot(f);
  tC.copy(s.vel).addScaledVector(f, -fs).multiplyScalar(Math.exp(-1.5 * dt));
  s.vel.copy(f).multiplyScalar(fs).add(tC);
  s.pos.addScaledVector(s.vel, dt);
}

function pushOutBox(p, b, r) {
  if (p.x < b.min.x - r || p.x > b.max.x + r || p.y < b.min.y - r || p.y > b.max.y + r || p.z < b.min.z - r || p.z > b.max.z + r) return null;
  const pen = [
    [p.x - (b.min.x - r), -1, 'x'], [b.max.x + r - p.x, 1, 'x'],
    [p.y - (b.min.y - r), -1, 'y'], [b.max.y + r - p.y, 1, 'y'],
    [p.z - (b.min.z - r), -1, 'z'], [b.max.z + r - p.z, 1, 'z'],
  ].sort((a, c) => a[0] - c[0])[0];
  p[pen[2]] += pen[0] * pen[1];
  return pen;
}

function collideShip(s, dt) {
  const p = s.pos, r = s.radius;
  let impact = 0;
  const pushSphere = (center, rad) => {
    tA.copy(p).sub(center);
    const d = tA.length();
    if (d >= rad + r || d < 1e-4) return;
    tA.divideScalar(d);
    const vn = s.vel.dot(tA);
    if (vn < 0) { impact = Math.max(impact, -vn); s.vel.addScaledVector(tA, -vn * 1.4); }
    p.copy(center).addScaledVector(tA, rad + r);
  };
  for (const pl of world.planets) pushSphere(pl.pos, pl.r);
  for (const o of world.spheres) pushSphere(o.pos, o.r);
  if (p.distanceTo(world.sun.pos) < world.sun.r + 250 && s === S.ship) damageShip(s, 999, 'env');
  if (p.distanceTo(world.field.center) < world.field.radius + 60) for (const a of world.asteroids) pushSphere(a.pos, a.r);

  // station deck slab (top y=0, bottom y=-4)
  const rx = xzLen(p);
  if (rx < DECK_R + r * 0.5 && p.y < s.hover && p.y > -4 - s.hover) {
    if (p.y > -2) {
      p.y = s.hover;
      if (s.vel.y < 0) { impact = Math.max(impact, -s.vel.y); s.vel.y = 0; }
      const f = Math.exp(-2.5 * dt);
      s.vel.x *= f;
      s.vel.z *= f;
      if (s === S.ship && Math.abs(s.ctrl.pitch) < 0.2 && Math.abs(s.ctrl.roll) < 0.2) {
        const fw = s.fwd(tB);
        tQ.setFromAxisAngle(UP, Math.atan2(-fw.x, -fw.z));
        s.mesh.quaternion.slerp(tQ, damp(3, dt));
      }
    } else {
      p.y = -4 - s.hover;
      if (s.vel.y > 0) { impact = Math.max(impact, s.vel.y); s.vel.y = 0; }
    }
  }
  if (p.y < -4 && p.y > -66 && rx < 30 + r && rx > 1e-3) {
    const k = (30 + r) / rx;
    p.x *= k;
    p.z *= k;
  }
  {
    const q = rx - 140, qy = p.y + 20, d = Math.hypot(q, qy);
    if (d < 6 + r && d > 1e-3 && rx > 1e-3) {
      const nr = q / d, ny = qy / d, R = 140 + nr * (6 + r);
      p.x *= R / rx;
      p.z *= R / rx;
      p.y = -20 + ny * (6 + r);
      impact = Math.max(impact, s.vel.length() * 0.5);
      s.vel.multiplyScalar(0.5);
    }
  }
  for (const b of world.buildings) {
    const pen = pushOutBox(p, b, r * 0.6);
    if (pen) {
      const v = s.vel[pen[2]];
      if (v * pen[1] < 0) { impact = Math.max(impact, Math.abs(v)); s.vel[pen[2]] = 0; }
    }
  }
  if (impact > 22 && s === S.ship) {
    damageShip(s, (impact - 22) * 1.2, 'env');
    sound.hit();
  }
  const d0 = p.length();
  if (d0 > 9000) {
    s.vel.addScaledVector(p, (-60 * dt) / d0);
    if (s === S.ship) message('Leaving the sector — turn back', 1);
  }
}

function shipVsShips(me, dt) {
  for (const o of ships) {
    if (o === me || !o.alive) continue;
    const min = me.radius + o.radius;
    const d = me.pos.distanceTo(o.pos);
    if (d >= min || d < 1e-3) continue;
    const n = tA.copy(me.pos).sub(o.pos).divideScalar(d);
    const rel = tB.copy(me.vel).sub(o.vel).dot(n);
    if (o.parked) me.pos.addScaledVector(n, min - d);
    else { me.pos.addScaledVector(n, (min - d) * 0.5); o.pos.addScaledVector(n, -(min - d) * 0.5); }
    if (rel < 0) {
      me.vel.addScaledVector(n, -rel * 1.2);
      if (!o.parked) o.vel.addScaledVector(n, rel * 0.6);
      if (-rel > 20) {
        damageShip(me, (-rel - 20) * 0.8, 'env');
        damageShip(o, (-rel - 20) * 0.8, 'player');
        sound.hit();
      }
    }
  }
}

function updateShipFx(s) {
  const c = s.ctrl;
  const len = s.parked || s.pilot === null ? 0.05 : 0.6 + Math.max(0, c.throttle) * (c.boost ? 4.5 : 2.2);
  for (const f of s.mesh.userData.flames) f.scale.set(1, len, 1);
  const L = s.mesh.userData.lights;
  if (L.length) {
    const on = s.pilot === 'npc' && (s.ai.state === 'pursue' || S.wanted > 0);
    const ph = Math.floor(S.time * 6 + s.id) % 2;
    L[0].visible = !on || ph === 0;
    L[1].visible = !on || ph === 1;
  }
}

// ---------- AI ----------
function steer(s, target, throttle, boost = false) {
  const c = s.ctrl;
  const local = tA.copy(target).sub(s.pos).applyQuaternion(tQ.copy(s.mesh.quaternion).invert());
  const yawA = Math.atan2(-local.x, -local.z);
  const pitchA = Math.atan2(local.y, Math.hypot(local.x, local.z));
  c.yaw = clamp(yawA * 2, -1, 1);
  c.pitch = clamp(pitchA * 2, -1, 1);
  c.roll = clamp(-s.right(tB).y * 2, -1, 1);
  c.throttle = throttle * (local.z < 0 ? 1 : 0.4);
  c.boost = boost;
  c.lift = 0;
}

// Keep AI from flying through the station deck unless it is chasing the player there.
function avoidStation(s, target) {
  const r = xzLen(s.pos);
  if (r < DECK_R + 60 && s.pos.y > -70 && s.pos.y < 25 && xzLen(target) > DECK_R) return new V3(s.pos.x, 80, s.pos.z);
  return target;
}

function attack(s, dt) {
  const tgt = playerPos();
  const d = s.pos.distanceTo(tgt);
  const lead = tgt.clone().addScaledVector(playerVel(), Math.min(d / 450, 1.5));
  if (d < 35) {
    steer(s, s.pos.clone().addScaledVector(s.right(tB), 60).addScaledVector(s.up(tC), 30), 0.8);
    return;
  }
  let thr = d > 300 ? 1 : d > 90 ? 0.7 : 0.2;
  if (S.mode !== 'ship' && d < 160) thr = 0.12;
  steer(s, lead, thr, d > 900);
  const dir = lead.sub(s.pos).normalize();
  if (S.mode !== 'dead' && d < 520 && s.fwd(tB).dot(dir) > 0.97 && s.fireCd <= 0) {
    dir.add(randUnit().multiplyScalar(0.025)).normalize();
    shipFire(s, s.team, s.team === 'pirate' ? 8 : 6, 420, dir);
    s.fireCd = s.team === 'pirate' ? 0.35 : 0.6 + rand(0, 0.5);
  }
}

function updateAI(s, dt) {
  const c = s.ctrl;
  if (s.parked || s.pilot !== 'npc') {
    if (s.pilot === null) { c.throttle = c.pitch = c.yaw = c.roll = c.lift = 0; c.boost = false; }
    return;
  }
  const tgt = playerPos();
  if (s.team === 'civ') {
    if (s.ai.flee > 0) {
      s.ai.flee -= dt;
      steer(s, s.pos.clone().multiplyScalar(2).sub(tgt), 1, true);
      return;
    }
    if (!s.ai.dest || s.pos.distanceTo(s.ai.dest) < 80) s.ai.dest = pickDest();
    steer(s, avoidStation(s, s.ai.dest), 0.6);
  } else if (s.team === 'police') {
    if (s.ai.state === 'patrol') {
      if (S.wanted > 0 && s.pos.distanceTo(tgt) < 2000) s.ai.state = 'pursue';
      else {
        if (!s.ai.dest || s.pos.distanceTo(s.ai.dest) < 60) s.ai.dest = patrolPoint();
        steer(s, avoidStation(s, s.ai.dest), 0.5);
        return;
      }
    }
    if (s.ai.state === 'leave') {
      steer(s, s.pos.clone().multiplyScalar(2).sub(tgt).add(tA.set(0, 300, 0)), 1, true);
      return;
    }
    if (S.wanted === 0) { s.ai.state = 'leave'; return; }
    attack(s, dt);
  } else if (s.team === 'pirate') {
    if (s.ai.aggro || s.pos.distanceTo(tgt) < 900) {
      s.ai.aggro = true;
      attack(s, dt);
    } else {
      if (!s.ai.dest || s.pos.distanceTo(s.ai.dest) < 50) s.ai.dest = s.ai.home.clone().add(randUnit().multiplyScalar(200));
      steer(s, s.ai.dest, 0.5);
    }
  }
}

// ---------- combat ----------
const laserGeo = new THREE.BoxGeometry(0.18, 0.18, 5);
const laserMat = team => new THREE.MeshBasicMaterial({
  color: { player: 0x39ff14, police: 0xff3344, pirate: 0xff9900 }[team],
  toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
});
const LASER_MATS = { player: laserMat('player'), police: laserMat('police'), pirate: laserMat('pirate') };
const lasers = [];

function spawnLaser(origin, dir, speed, team, dmg, owner, baseVel) {
  const vel = dir.clone().multiplyScalar(speed);
  if (baseVel) vel.add(baseVel);
  const m = new THREE.Mesh(laserGeo, LASER_MATS[team]);
  m.position.copy(origin);
  m.quaternion.setFromUnitVectors(tA.set(0, 0, 1), tB.copy(vel).normalize());
  scene.add(m);
  lasers.push({ m, vel, team, dmg, owner, life: 1.6 });
}

function shipFire(s, team, dmg, speed, dir = null) {
  const f = s.fwd(new V3()), r = s.right(new V3());
  const span = s.kind === 'hauler' ? 2.5 : 4.6;
  const d = dir || f;
  for (const side of [-1, 1]) {
    const o = s.pos.clone().addScaledVector(r, side * span).addScaledVector(f, 2);
    spawnLaser(o, d, speed, team, dmg, s, s.vel);
  }
  sound.zap(team === 'player' ? 1 : 0.7, s === S.ship ? 0.8 : volAt(s.pos));
}

function footFire(a) {
  let origin, dir;
  const rc = rightController();
  if (a.vr && rc) {
    origin = rc.getWorldPosition(new V3());
    dir = new V3(0, 0, -1).applyQuaternion(rc.getWorldQuaternion(new THREE.Quaternion()));
  } else {
    const cdir = camera.getWorldDirection(new V3());
    const aim = camera.getWorldPosition(new V3()).addScaledVector(cdir, 300);
    const right = new V3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    origin = player.pos.clone().add(tA.set(0, 1.3, 0)).addScaledVector(right, 0.35);
    dir = aim.sub(origin).normalize();
  }
  spawnLaser(origin, dir, 420, 'player', 12, null, null);
  sound.zap(1.5, 0.7);
}

function segSphere(a, b, c, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1e-6;
  const t = clamp(((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2, 0, 1);
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz < r * r;
}

function solidAt(p) {
  if (xzLen(p) < DECK_R && p.y < 0 && p.y > -4) return true;
  for (const b of world.buildings) if (b.containsPoint(p)) return true;
  if (p.distanceToSquared(world.field.center) < (world.field.radius + 50) ** 2) {
    for (const a of world.asteroids) if (p.distanceToSquared(a.pos) < a.r * a.r) return true;
  }
  for (const pl of world.planets) if (p.distanceToSquared(pl.pos) < pl.r * pl.r) return true;
  return false;
}

const prevPos = new V3();
function updateLasers(dt) {
  const footCenter = player.pos.clone().add(tC.set(0, 1, 0));
  for (let i = lasers.length - 1; i >= 0; i--) {
    const L = lasers[i];
    L.life -= dt;
    prevPos.copy(L.m.position);
    L.m.position.addScaledVector(L.vel, dt);
    const p = L.m.position;
    let hit = false;
    if (L.team === 'player') {
      for (const s of ships) {
        if (!s.alive || s === S.ship) continue;
        if (segSphere(prevPos, p, s.pos, s.radius)) { damageShip(s, L.dmg, 'player'); hit = true; break; }
      }
      if (!hit) {
        for (const d of droids) {
          if (d.alive && segSphere(prevPos, p, tA.copy(d.m.position).setY(d.m.position.y + 0.6), 0.7)) { killDroid(d); hit = true; break; }
        }
      }
    } else if (S.mode === 'ship' && S.ship && segSphere(prevPos, p, S.ship.pos, S.ship.radius)) {
      damageShip(S.ship, L.dmg, L.team);
      hit = true;
    } else if (S.mode === 'foot' && segSphere(prevPos, p, footCenter, 1.0)) {
      hurtPlayer(L.dmg);
      hit = true;
    }
    if (!hit && solidAt(p)) hit = true;
    if (hit) spark(p);
    if (hit || L.life <= 0) {
      scene.remove(L.m);
      lasers.splice(i, 1);
    }
  }
}

function damageShip(s, amt, by) {
  if (!s.alive) return;
  s.hull -= amt;
  if (s === S.ship) S.dmg = Math.min(0.6, S.dmg + amt / 60);
  if (by === 'player' && s !== S.ship) {
    if (s.team === 'civ' && s.owner !== 'player') {
      addWanted(0, 1);
      if (s.pilot === 'npc') s.ai.flee = 8;
    } else if (s.team === 'police') addWanted(0, 2);
    else if (s.team === 'pirate') s.ai.aggro = true;
  }
  if (s.hull <= 0) destroyShip(s, by);
}

function destroyShip(s, by) {
  removeShip(s);
  explosion(s.pos, s.radius * 2.4);
  if (by === 'player') {
    if (s.team === 'civ' && s.owner !== 'player') addWanted(1, 1);
    else if (s.team === 'police') addWanted(1, 3);
    else if (s.team === 'pirate' && !s.isTarget) { S.credits += 250; message('Pirate bounty +$250'); }
  }
  if (s === S.ship) {
    S.ship = null;
    playerDie();
  }
}

function hurtPlayer(d) {
  if (S.mode !== 'foot') return;
  S.health -= d;
  S.dmg = Math.min(0.6, S.dmg + d / 40);
  sound.hit();
  if (S.health <= 0) {
    explosion(player.pos.clone().add(tA.set(0, 1, 0)), 2);
    playerDie();
  }
}

// ---------- effects ----------
const effects = [];
const fxSphere = new THREE.SphereGeometry(1, 16, 12), fxBox = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const fxMat = color => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

function explosion(pos, size) {
  const m = new THREE.Mesh(fxSphere, fxMat(0xffb347));
  m.position.copy(pos);
  scene.add(m);
  effects.push({ m, t: 0, dur: 0.8, size, type: 'boom' });
  const n = Math.min(16, Math.round(4 + size));
  for (let i = 0; i < n; i++) {
    const dm = new THREE.Mesh(fxBox, fxMat(pick([0xff6a00, 0xffd000, 0x999999])));
    dm.position.copy(pos);
    dm.scale.setScalar(rand(0.5, 1.5) * Math.max(0.4, size / 8));
    scene.add(dm);
    effects.push({ m: dm, t: 0, dur: rand(0.8, 1.6), vel: randUnit().multiplyScalar(rand(10, 40) * size / 8 + 4), type: 'debris' });
  }
  sound.boom(clamp(size / 10, 0.3, 1.2) * volAt(pos));
}

function spark(pos) {
  const m = new THREE.Mesh(fxSphere, fxMat(0xffffaa));
  m.position.copy(pos);
  scene.add(m);
  effects.push({ m, t: 0, dur: 0.2, size: 1.2, type: 'boom' });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    const k = e.t / e.dur;
    if (k >= 1) {
      scene.remove(e.m);
      e.m.material.dispose();
      effects.splice(i, 1);
      continue;
    }
    if (e.type === 'boom') {
      e.m.scale.setScalar(e.size * (0.25 + 1.1 * k));
      e.m.material.color.setHSL(0.1 - 0.08 * k, 1, 0.6 - 0.3 * k);
    } else {
      e.m.position.addScaledVector(e.vel, dt);
      e.m.rotation.x += dt * 5;
      e.m.rotation.y += dt * 3;
    }
    e.m.material.opacity = 1 - k;
  }
}

// ---------- droids (pedestrians) ----------
const droids = [];
function randomDeckPoint() {
  for (let i = 0; i < 30; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (DECK_R - 8);
    const p = new V3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (!world.buildings.some(b => p.x > b.min.x - 2 && p.x < b.max.x + 2 && p.z > b.min.z - 2 && p.z < b.max.z + 2)) return p;
  }
  return new V3(10, 0, 10);
}

function spawnDroid(pos) {
  const m = buildDroid();
  m.position.copy(pos || randomDeckPoint());
  scene.add(m);
  droids.push({ m, target: randomDeckPoint(), speed: rand(1.2, 2.2), alive: true, wait: 0, flee: 0 });
}

function killDroid(d) {
  d.alive = false;
  scene.remove(d.m);
  explosion(d.m.position.clone().setY(0.8), 1.5);
  addWanted(1, 1);
}

function pushOutXZ(p, b, r, height) {
  if (p.y > b.max.y || p.y + height < b.min.y) return false;
  if (p.x < b.min.x - r || p.x > b.max.x + r || p.z < b.min.z - r || p.z > b.max.z + r) return false;
  const opts = [[p.x - (b.min.x - r), 'x', -1], [b.max.x + r - p.x, 'x', 1], [p.z - (b.min.z - r), 'z', -1], [b.max.z + r - p.z, 'z', 1]];
  opts.sort((a, c) => a[0] - c[0]);
  p[opts[0][1]] += opts[0][0] * opts[0][2];
  return true;
}

function updateDroids(dt) {
  for (const d of droids) {
    if (!d.alive) continue;
    const p = d.m.position;
    if (d.wait > 0) { d.wait -= dt; continue; }
    const fleeing = d.flee > 0;
    if (fleeing) d.flee -= dt;
    const dx = d.target.x - p.x, dz = d.target.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      d.target = randomDeckPoint();
      d.wait = fleeing ? 0 : rand(0.5, 4);
      continue;
    }
    const sp = d.speed * (fleeing ? 3 : 1);
    const before = p.clone();
    p.x += (dx / dist) * sp * dt;
    p.z += (dz / dist) * sp * dt;
    for (const b of world.buildings) pushOutXZ(p, b, 0.4, 1.4);
    if (p.distanceTo(before) < sp * dt * 0.3) d.target = randomDeckPoint();
    if (xzLen(p) > DECK_R - 3) d.target = randomDeckPoint();
    d.m.rotation.y = Math.atan2(-dx, -dz);
    d.m.position.y = Math.abs(Math.sin(S.time * 8 * sp)) * 0.05;
    if (S.mode === 'ship' && S.ship && S.ship.vel.length() > 8 && S.ship.pos.distanceTo(p) < S.ship.radius) killDroid(d);
  }
  for (let i = droids.length - 1; i >= 0; i--) if (!droids[i].alive) droids.splice(i, 1);
}

// ---------- cash crates ----------
const crates = [];
function placeCrate(m) {
  const r = Math.random();
  if (r < 0.15) m.position.copy(randomDeckPoint()).setY(1.4);
  else if (r < 0.65) {
    const v = randUnit().multiplyScalar(rand(150, world.field.radius));
    v.y *= 0.45;
    m.position.copy(world.field.center).add(v);
  } else m.position.copy(pick(world.beacons).pos).add(randUnit().multiplyScalar(rand(60, 220)));
}
function spawnCrate() {
  const m = buildCrate();
  placeCrate(m);
  scene.add(m);
  crates.push(m);
}
function updateCrates(dt) {
  if (S.mode === 'dead' || !S.started) return;
  const p = playerPos();
  const reach = S.mode === 'ship' ? 10 : 2.5;
  for (const c of crates) {
    c.rotation.y += dt;
    c.rotation.x += dt * 0.5;
    if (c.position.distanceTo(p) < reach) {
      const amt = Math.round(rand(5, 20)) * 10;
      S.credits += amt;
      message(`+$${amt}`, 1.5);
      sound.coin();
      placeCrate(c);
    }
  }
}

// ---------- player: on foot ----------
const FOOT_GRAVITY_H = 35;
function updateFoot(dt, a) {
  const vr = a.vr;
  if (!vr) {
    player.yaw += a.keyYaw * 2 * dt - a.lookX * 0.0025;
    player.pitch = clamp(player.pitch - a.lookY * 0.0025 + a.keyPitch * 1.5 * dt, -1.3, 1.3);
  } else if (Math.abs(a.rx) > 0.6) {
    if (!S.snapLatch) { player.yaw -= Math.sign(a.rx) * (Math.PI / 6); S.snapLatch = true; }
  } else S.snapLatch = false;

  let heading;
  const look = new V3();
  if (vr) {
    camera.getWorldDirection(look);
    heading = Math.atan2(-look.x, -look.z);
  } else {
    heading = player.yaw;
    look.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
  }
  const fwd = new V3(-Math.sin(heading), 0, -Math.cos(heading));
  const right = new V3(Math.cos(heading), 0, -Math.sin(heading));
  const p = player.pos, v = player.vel;
  const gravityZone = xzLen(p) < DECK_R + 1 && p.y > -1 && p.y < FOOT_GRAVITY_H;
  let jet = false;

  if (gravityZone) {
    const sp = a.boost ? 10 : 5.5;
    const wish = fwd.clone().multiplyScalar(a.moveY).addScaledVector(right, a.moveX);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(sp);
    const k = damp(player.onGround ? 12 : 2, dt);
    v.x += (wish.x - v.x) * k;
    v.z += (wish.z - v.z) * k;
    v.y -= 22 * dt;
    if (a.lift > 0) {
      if (player.onGround) v.y = 8;
      else { v.y += 32 * dt; jet = true; }
    }
    p.addScaledVector(v, dt);
    player.onGround = false;
    if (xzLen(p) < DECK_R && p.y < 0 && p.y > -2.5) {
      p.y = 0;
      if (v.y < 0) v.y = 0;
      player.onGround = true;
    }
  } else {
    // zero-g: the jetpack thrusts where you look
    const acc = look.clone().multiplyScalar(a.moveY).addScaledVector(right, a.moveX).addScaledVector(UP, a.lift).multiplyScalar(a.boost ? 30 : 12);
    jet = acc.lengthSq() > 0;
    v.addScaledVector(acc, dt).multiplyScalar(Math.exp(-0.6 * dt));
    p.addScaledVector(v, dt);
    player.onGround = false;
    if (xzLen(p) < DECK_R && p.y <= -1 && p.y > -6) { p.y = -6; v.y = Math.min(v.y, 0); }
  }

  for (const b of world.buildings) {
    if (p.y < b.max.y && p.y > b.max.y - 0.8 && v.y <= 0 && p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z) {
      p.y = b.max.y; // stand on rooftops
      v.y = 0;
      player.onGround = true;
    } else if (pushOutXZ(p, b, 0.45, 1.8)) {
      // pushed out of the wall
    }
  }
  if (p.distanceTo(world.field.center) < world.field.radius + 50) {
    for (const ast of world.asteroids) {
      tA.copy(p).sub(ast.pos);
      const d = tA.length();
      if (d < ast.r + 1) { p.copy(ast.pos).addScaledVector(tA.divideScalar(d), ast.r + 1); v.multiplyScalar(0.3); }
    }
  }
  for (const pl of world.planets) {
    tA.copy(p).sub(pl.pos);
    const d = tA.length();
    if (d < pl.r + 1) p.copy(pl.pos).addScaledVector(tA.divideScalar(d), pl.r + 1);
  }
  if (p.length() > 9000) v.addScaledVector(p, (-20 * dt) / p.length());

  const av = player.avatar;
  av.position.copy(p);
  const hs = Math.hypot(v.x, v.z);
  if (hs > 0.5) {
    const target = Math.atan2(-v.x, -v.z);
    let diff = target - av.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    av.rotation.y += diff * damp(12, dt);
  }
  for (const j of av.userData.jets) j.visible = jet;

  if (a.fire && player.fireCd <= 0) {
    footFire(a);
    player.fireCd = 0.22;
  }
}

// ---------- player: flying ----------
function updatePlayerShip(dt, a) {
  const s = S.ship, c = s.ctrl;
  if (a.vr) {
    c.throttle = a.moveY;
    c.roll = -a.moveX;
    c.yaw = -a.rx;
    c.pitch = a.ry;
  } else {
    S.stickX = clamp(S.stickX * Math.exp(-4 * dt) + a.lookX * 0.004, -1, 1);
    S.stickY = clamp(S.stickY * Math.exp(-4 * dt) + a.lookY * 0.004, -1, 1);
    c.yaw = clamp(-S.stickX + a.keyYaw, -1, 1);
    c.pitch = clamp(-S.stickY + a.keyPitch, -1, 1);
    c.roll = -a.moveX;
    c.throttle = a.moveY;
  }
  c.lift = a.lift;
  c.boost = a.boost;
  if (a.fire && s.fireCd <= 0) {
    shipFire(s, 'player', 18, 650);
    s.fireCd = 0.14;
  }
}

function enterShip(s, boarding = false) {
  if (s.owner !== 'player') {
    if (s.team === 'police') { addWanted(2, 2); message('You stole a police cruiser!'); }
    else if (s.pilot === 'npc') {
      addWanted(1, 1);
      message(boarding ? 'Boarded and hijacked!' : 'Hijacked! The pilot droid runs off.');
      if (!boarding && xzLen(s.pos) < DECK_R) {
        spawnDroid(s.pos.clone().setY(0).addScaledVector(s.right(tA), 7));
        droids[droids.length - 1].flee = 6;
      }
    } else message('Ship acquired.');
  }
  if (S.ship) {
    S.ship.pilot = null;
    S.ship.ctrl.throttle = 0;
  }
  s.pilot = 'player';
  s.parked = false;
  s.ai.flee = 0;
  S.ship = s;
  S.mode = 'ship';
  S.stickX = S.stickY = 0;
  S.camOff.set(0, 4.5, 17).applyQuaternion(s.mesh.quaternion);
  player.avatar.visible = false;
}

function exitShip() {
  const s = S.ship;
  s.pilot = null;
  s.ctrl.throttle = 0;
  const onDeck = xzLen(s.pos) < DECK_R && s.pos.y < 8 && s.pos.y > -1;
  player.pos.copy(s.pos).addScaledVector(s.right(tA), s.radius + 2);
  if (onDeck) {
    player.pos.y = 0.2;
    player.vel.set(0, 0, 0);
  } else player.vel.copy(s.vel);
  const f = s.fwd(tA);
  player.yaw = Math.atan2(-f.x, -f.z);
  player.pitch = 0;
  S.ship = null;
  S.mode = 'foot';
}

function nearestShip(from, range, exclude) {
  let best = null, bd = range;
  for (const s of ships) {
    if (!s.alive || s === exclude || s.pilot === 'player') continue;
    const d = s.pos.distanceTo(from);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function handleInteract(a) {
  const key = a.vr ? 'A' : 'E';
  S.prompt = '';
  if (S.mode === 'foot') {
    const near = nearestShip(player.pos, 9);
    const atMarker = !S.mission && player.pos.distanceTo(world.marker.pos) < 4;
    if (near) {
      S.prompt = near.owner === 'player' ? `${key}: Enter your ship`
        : near.team === 'police' ? `${key}: Steal police ship ★★`
        : near.pilot === 'npc' ? `${key}: Hijack ship ★` : `${key}: Steal ship`;
      if (a.interact) enterShip(near);
    } else if (atMarker) {
      S.prompt = `${key}: Start mission — ${MTYPES[S.nextMission % MTYPES.length].name}`;
      if (a.interact) startMission();
    }
  } else if (S.mode === 'ship') {
    const s = S.ship;
    const near = nearestShip(s.pos, 30, s);
    if (near && tA.copy(near.vel).sub(s.vel).length() < 60 && near.team !== 'pirate') {
      S.prompt = `${key}: Board ship${near.pilot === 'npc' ? ' ★' : ''}`;
      if (a.interact) enterShip(near, true);
    } else {
      if (s.vel.length() < 15) S.prompt = `${key}: Exit ship`;
      if (a.interact) exitShip();
    }
    if (S.sprayPrompt) S.prompt = S.sprayPrompt;
  }
}

function playerDie() {
  if (S.mode === 'dead') return;
  S.deathPos.copy(playerPos());
  if (S.ship) { S.ship.pilot = null; S.ship = null; }
  S.mode = 'dead';
  S.deadT = 4.5;
  S.health = 0;
  player.avatar.visible = false;
  if (S.mission) failMission('You died.', true);
  bigText('WASTED', '', '#ff3355', 4.5);
  sound.chime(false);
}

function respawn() {
  player.pos.copy(world.spawn);
  player.vel.set(0, 0, 0);
  player.yaw = Math.atan2(player.pos.x, player.pos.z);
  player.pitch = -0.1;
  S.health = 100;
  S.mode = 'foot';
  S.wanted = 0;
  const bill = Math.min(S.credits, 100);
  S.credits -= bill;
  message(bill ? `Med Bay bill: -$${bill}` : 'Med Bay patched you up for free.', 4);
  ensurePlayerShip();
}

function ensurePlayerShip() {
  if (ships.some(s => s.alive && s.owner === 'player')) return;
  const pad = world.pads[0];
  if (!padFree(pad)) return;
  parkShip(pad, 'player');
  message('Insurance delivered a new ship to Pad 1.', 4);
}

// ---------- police / wanted ----------
let policeSpawnT = 0;
function updatePolice(dt) {
  const tgt = playerPos();
  const pursuers = ships.filter(s => s.alive && s.team === 'police' && s.pilot === 'npc' && s.ai.state === 'pursue');
  const want = [0, 2, 3, 4, 6, 8][S.wanted];
  policeSpawnT -= dt;
  if (S.mode !== 'dead' && S.wanted > 0 && pursuers.length < want && policeSpawnT <= 0) {
    policeSpawnT = 2.5;
    spawnPursuer();
  }
  if (S.wanted > 0 && S.mode !== 'dead') {
    const seen = pursuers.some(s => s.pos.distanceTo(tgt) < 400);
    if (seen) S.evade = 0;
    else {
      S.evade += dt;
      if (S.evade > 8 + 3 * S.wanted) {
        S.wanted = 0;
        S.evade = 0;
        message('You lost the cops.', 3);
      }
    }
  }
  const nearest = pursuers.reduce((m, s) => Math.min(m, s.pos.distanceTo(tgt)), Infinity);
  sound.setSiren(S.wanted > 0 ? clamp(1 - nearest / 700, 0, 1) : 0);
}

function updatePaySpray(dt) {
  S.sprayPrompt = '';
  const inZone = S.mode === 'ship' && world.spray.containsPoint(S.ship.pos);
  world.sprayFloor.material.opacity = inZone ? 0.5 + Math.sin(S.time * 10) * 0.2 : 0.25;
  if (!inZone) { S.spray = 0; S.sprayDone = false; return; }
  if (S.sprayDone) return;
  const s = S.ship;
  if (S.wanted === 0 && s.hull >= s.maxHull) { S.sprayPrompt = "Pay 'n' Spray: nothing to fix"; return; }
  S.sprayPrompt = "Pay 'n' Spray: hold still...";
  S.spray += dt;
  if (S.spray < 1.5) return;
  S.sprayDone = true;
  if (S.credits < 100) { message("Pay 'n' Spray: $100 needed. Come back with cash.", 3); return; }
  S.credits -= 100;
  S.wanted = 0;
  S.evade = 0;
  s.hull = s.maxHull;
  s.mesh.userData.hull.color.setHex(pick(PAINT));
  bigText('NEW PAINT JOB', '-$100 · the cops lost your trail', '#ff7ad9', 3);
  sound.chime(true);
}

// ---------- missions ----------
const MTYPES = [
  { id: 'delivery', name: 'Hot Cargo' },
  { id: 'race', name: 'Ring Rush' },
  { id: 'bounty', name: 'Pirate Bounty' },
];
const missionRing = new THREE.Mesh(
  new THREE.TorusGeometry(26, 1.4, 10, 48),
  new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
);
missionRing.visible = false;
scene.add(missionRing);
const pillar = new THREE.Mesh(
  new THREE.CylinderGeometry(3, 3, 4000, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
);
pillar.visible = false;
scene.add(pillar);

function startMission() {
  const type = MTYPES[S.nextMission % MTYPES.length];
  S.nextMission++;
  const m = { type: type.id, name: type.name };
  if (type.id === 'delivery') {
    const b = pick(world.beacons);
    const d = b.pos.length();
    Object.assign(m, { title: `Deliver hot cargo to ${b.name}`, pos: b.pos.clone(), timer: Math.round(d / 90 + 50), reward: 300 + Math.round(d / 100) * 50 });
  } else if (type.id === 'race') {
    const pts = [];
    let p = new V3(0, 90, -180);
    const dir = new V3(0, 0, -1);
    while (pts.length < 8) {
      dir.add(randUnit().multiplyScalar(0.7));
      dir.y *= 0.4;
      dir.normalize();
      const next = p.clone().addScaledVector(dir, 380);
      if (world.planets.some(pl => next.distanceTo(pl.pos) < pl.r + 150) || next.distanceTo(world.field.center) < 200) { dir.negate(); continue; }
      pts.push(next);
      p = next;
    }
    Object.assign(m, { title: 'Ring Rush: fly through all 8 rings', pts, idx: 0, timer: 45, reward: 900 });
  } else {
    const b = pick(world.beacons);
    const home = b.pos.clone().add(randUnit().multiplyScalar(250));
    const s = new Ship('pirate', 'fighter');
    s.pos.copy(home);
    s.ai.home = home;
    s.isTarget = true;
    Object.assign(m, { title: `Take down the pirate "Red Viper" near ${b.name}`, ship: s, timer: 300, reward: 1500 });
  }
  S.mission = m;
  bigText(m.name.toUpperCase(), m.title, '#ffd23f', 3.5);
  sound.chime(true);
}

function completeMission() {
  const m = S.mission;
  S.mission = null;
  S.credits += m.reward;
  bigText('MISSION PASSED', `+$${m.reward}`, '#ffd23f', 4);
  sound.chime(true);
}

function failMission(reason, quiet = false) {
  const m = S.mission;
  S.mission = null;
  if (m.ship) m.ship.isTarget = false;
  if (!quiet) { bigText('MISSION FAILED', reason, '#ff3355', 3.5); sound.chime(false); }
  else message(`Mission failed: ${reason}`, 4);
}

function missionTarget() {
  const m = S.mission;
  if (!m) return null;
  if (m.type === 'delivery') return m.pos;
  if (m.type === 'race') return m.pts[m.idx];
  return m.ship.alive ? m.ship.pos : null;
}

function updateMission(dt) {
  const m = S.mission;
  missionRing.visible = pillar.visible = false;
  world.marker.group.visible = !m;
  if (!m) return;
  m.timer -= dt;
  if (m.timer <= 0) { failMission('Out of time.'); return; }
  const p = playerPos();
  if (m.type === 'delivery') {
    if (S.mode === 'ship' && p.distanceTo(m.pos) < 45) { completeMission(); return; }
    m.extra = S.mode === 'ship' ? '' : 'Get a ship!';
  } else if (m.type === 'race') {
    if (p.distanceTo(m.pts[m.idx]) < 30) {
      m.idx++;
      m.timer += 10;
      sound.coin();
      if (m.idx >= m.pts.length) { completeMission(); return; }
      message(`Checkpoint ${m.idx}/${m.pts.length}  +10s`, 1.5);
    }
    m.extra = `Ring ${m.idx + 1}/${m.pts.length}`;
  } else if (!m.ship.alive) { completeMission(); return; }
  const tgt = missionTarget();
  m.dist = p.distanceTo(tgt);
  pillar.visible = true;
  pillar.position.copy(tgt);
  if (m.type !== 'bounty') {
    missionRing.visible = true;
    missionRing.position.copy(tgt);
    const look = m.type === 'race' ? (m.pts[m.idx + 1] || tgt.clone().add(tgt.clone().sub(m.pts[m.idx - 1] || ORIGIN))) : ORIGIN;
    missionRing.lookAt(look);
  }
}

// ---------- upkeep: keep the world populated ----------
function upkeep() {
  const tgt = playerPos();
  const civs = ships.filter(s => s.alive && s.team === 'civ' && s.pilot === 'npc' && !s.parked).length;
  if (civs < 14) spawnCivilian();
  const patrols = ships.filter(s => s.alive && s.team === 'police' && s.ai.state === 'patrol').length;
  if (patrols < 2) spawnPatrol();
  for (const s of ships) {
    if (!s.alive || s.pilot === 'player' || s.owner === 'player' || s.parked || s.isTarget) continue;
    const d = s.pos.distanceTo(tgt);
    if (d > 6000 || (s.ai.state === 'leave' && d > 2500) || (s.pilot === null && d > 3000)) removeShip(s);
  }
  for (let i = 1; i < world.pads.length; i++) if (padFree(world.pads[i]) && Math.random() < 0.05) parkShip(world.pads[i], 'civ');
  if (droids.length < 12) spawnDroid();
  ensurePlayerShip();
}

// ---------- camera ----------
function setLook(obj, eye, target) {
  tM.lookAt(eye, target, UP);
  obj.position.copy(eye);
  obj.quaternion.setFromRotationMatrix(tM);
}

function placeCamera(dt, vr) {
  const showAvatar = !vr && S.started && S.mode === 'foot' && S.view === 'third';
  player.avatar.visible = showAvatar;
  for (const s of ships) s.mesh.userData.canopy.visible = !(s === S.ship && (vr || S.view === 'first'));
  const rc = rightController();
  if (rc?.userData.gun) rc.userData.gun.visible = S.mode === 'foot';

  if (!S.started) {
    const t = S.time * 0.05;
    setLook(rig, tA.set(Math.cos(t) * 230, 70, Math.sin(t) * 230), tB.set(0, 10, 0));
    return;
  }
  if (vr) {
    if (S.mode === 'ship' && S.ship) {
      const s = S.ship;
      const seat = tA.set(0, s.kind === 'hauler' ? 1.4 : 0.6, s.kind === 'hauler' ? -2.6 : -1.0).applyQuaternion(s.mesh.quaternion).add(s.pos);
      rig.quaternion.copy(s.mesh.quaternion);
      rig.position.copy(seat).sub(tB.set(0, camera.position.y, 0).applyQuaternion(rig.quaternion));
    } else {
      rig.position.copy(S.mode === 'dead' ? S.deathPos : player.pos);
      rig.quaternion.setFromAxisAngle(UP, player.yaw);
    }
    return;
  }
  camera.position.set(0, 0, 0);
  camera.quaternion.identity();
  if (S.mode === 'ship' && S.ship) {
    const s = S.ship;
    if (S.view === 'first') {
      rig.position.copy(tA.set(0, 0.7, -1.0).applyQuaternion(s.mesh.quaternion).add(s.pos));
      rig.quaternion.copy(s.mesh.quaternion);
    } else {
      const back = (s.kind === 'hauler' ? 22 : 16) + s.vel.length() * 0.02;
      const off = tA.set(0, s.kind === 'hauler' ? 6 : 4.5, back).applyQuaternion(s.mesh.quaternion);
      S.camOff.lerp(off, damp(6, dt));
      rig.position.copy(s.pos).add(S.camOff);
      rig.quaternion.slerp(s.mesh.quaternion, damp(7, dt));
    }
  } else if (S.mode === 'dead') {
    const t = S.time * 0.3;
    setLook(rig, tA.set(Math.cos(t) * 14, 7, Math.sin(t) * 14).add(S.deathPos), S.deathPos);
  } else {
    const dir = tB.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
    const head = tA.copy(player.pos).add(tC.set(0, 1.65, 0));
    if (S.view === 'third') {
      const right = tC.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      head.addScaledVector(right, 0.7).addScaledVector(dir, -5).add(tC.set(0, 0.5, 0));
    }
    const eye = head.clone();
    setLook(rig, eye, eye.clone().add(dir));
  }
}

// VR HUD panel + mission arrow live in rig space so they ride along with the cockpit.
const hudPos = new V3(), hudQuat = new THREE.Quaternion();
function placeOverlays(dt, vr) {
  rig.updateMatrixWorld(true);
  if (vr) {
    const target = tA.set(0, -0.3, -1.2).applyQuaternion(camera.quaternion).add(camera.position);
    hudPos.lerp(target, damp(5, dt));
    hudQuat.slerp(camera.quaternion, damp(5, dt));
    vrHud.position.copy(hudPos);
    vrHud.quaternion.copy(hudQuat);
    vrHud.visible = S.hudOn && S.started;
  } else vrHud.visible = false;

  const tgt = S.started && S.mode !== 'dead' ? missionTarget() : null;
  arrow.visible = !!tgt;
  if (!tgt) return;
  const local = vr ? tB.set(0, 0.22, -1.2) : tB.set(0, 2.3, -6);
  local.applyQuaternion(camera.quaternion).add(camera.position);
  arrow.position.copy(local);
  arrow.scale.setScalar(vr ? 1 : 2.5);
  const tl = rig.worldToLocal(tC.copy(tgt)).sub(local).normalize();
  arrow.quaternion.setFromUnitVectors(UP, tl);
}

// ---------- HUD data ----------
function hudData(vr) {
  const p = playerPos();
  const inShip = S.mode === 'ship' && S.ship;
  camera.getWorldDirection(tA);
  const heading = Math.atan2(-tA.x, -tA.z);
  const blips = [];
  const add = (pos, color, size, edge = false, shape) => blips.push({ dx: pos.x - p.x, dz: pos.z - p.z, dy: pos.y - p.y, color, size, edge, shape });
  add(ORIGIN, '#4ade80', 6, true, 'sq');
  if (!S.mission) add(world.marker.pos, '#ffd23f', 4, !inShip, 'sq');
  for (const s of ships) {
    if (!s.alive || s === S.ship) continue;
    if (s.team === 'police') add(s.pos, Math.floor(S.time * 4 + s.id) % 2 ? '#ff2244' : '#3b82f6', 4.5, s.ai.state === 'pursue');
    else if (s.team === 'pirate') add(s.pos, '#ff4d4d', 5, !!s.isTarget);
    else if (s.owner === 'player') add(s.pos, '#ffc23d', 5, true, 'sq');
    else add(s.pos, 'rgba(255,255,255,0.75)', 2.5);
  }
  for (const c of crates) add(c.position, '#22ff88', 2);
  if (!inShip) for (const d of droids) add(d.m.position, '#94a3b8', 2);
  const tgt = missionTarget();
  if (tgt) add(tgt, '#ffd23f', 6, true);
  const m = S.mission;
  return {
    vr, time: S.time, credits: S.credits, wanted: S.wanted, evading: S.wanted > 0 && S.evade > 2,
    mode: S.mode, health: Math.max(0, S.health), hull: inShip ? S.ship.hull / S.ship.maxHull : 0,
    speed: inShip ? Math.round(S.ship.vel.length()) : 0, boost: inShip && S.ship.ctrl.boost,
    prompt: S.mode === 'dead' ? '' : S.prompt, msg: S.msgT > 0 ? S.msg : '', big: S.bigT > 0 ? S.big : '', bigSub: S.bigSub, bigColor: S.bigColor,
    mission: m && { title: m.title, timer: m.timer, dist: m.dist, extra: m.extra },
    radio: S.radioT > 0 ? S.radioName : '', dmg: S.dmg,
    crosshair: !vr && S.mode !== 'dead',
    radar: { heading, range: inShip ? 1600 : 260, blips },
  };
}

// ---------- start / loop ----------
const titleEl = document.getElementById('title');
const hintEl = document.getElementById('hint');
function startGame() {
  if (!S.started) {
    S.started = true;
    bigText('NOVA SANTOS', 'Steal a ship. Make some money. Stay off the radar.', '#29f0ff', 4);
  }
  titleEl.hidden = true;
  titleEl.style.display = 'none';
  sound.init();
}
document.getElementById('play').addEventListener('click', () => { startGame(); input.lock(); });
document.getElementById('VRButton')?.addEventListener('click', () => sound.init());
renderer.domElement.addEventListener('mousedown', () => { if (S.started && !renderer.xr.isPresenting) input.lock(); });
renderer.xr.addEventListener('sessionstart', () => { startGame(); S.view = 'first'; });
renderer.xr.addEventListener('sessionend', () => { S.view = 'third'; });

parkShip(world.pads[0], 'player');
for (let i = 1; i < world.pads.length; i++) parkShip(world.pads[i], 'civ');
for (let i = 0; i < 14; i++) spawnCivilian();
for (let i = 0; i < 2; i++) spawnPatrol();
for (let i = 0; i < 12; i++) spawnDroid();
for (let i = 0; i < 28; i++) spawnCrate();

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  S.time += dt;
  S.frame++;
  const vr = renderer.xr.isPresenting;
  const a = input.read(vr ? renderer.xr.getSession() : null);

  if (S.started) {
    if (a.radio) { S.radioName = sound.nextStation(); S.radioT = 3; }
    if (a.view) {
      if (vr) S.hudOn = !S.hudOn;
      else S.view = S.view === 'third' ? 'first' : 'third';
    }
    if (S.mode === 'foot') updateFoot(dt, a);
    else if (S.mode === 'ship') updatePlayerShip(dt, a);
    else if (S.mode === 'dead' && (S.deadT -= dt) <= 0) respawn();
    player.fireCd -= dt;
    handleInteract(a);
  }

  for (const s of ships) {
    if (!s.alive) continue;
    s.fireCd -= dt;
    updateAI(s, dt);
    if (!s.parked) { stepShip(s, dt); collideShip(s, dt); }
    updateShipFx(s);
  }
  if (S.mode === 'ship' && S.ship) shipVsShips(S.ship, dt);
  ships = ships.filter(s => s.alive);

  updateLasers(dt);
  updateEffects(dt);
  updateDroids(dt);
  updateCrates(dt);
  if (S.started) {
    updatePolice(dt);
    updateMission(dt);
    updatePaySpray(dt);
    if ((S.upkeepT -= dt) <= 0) { S.upkeepT = 1; upkeep(); }
  } else world.marker.group.visible = true;
  world.update(dt, S.time);

  S.msgT -= dt;
  S.bigT -= dt;
  S.radioT -= dt;
  S.dmg = Math.max(0, S.dmg - dt * 0.8);
  sound.setEngine(S.mode === 'ship' && S.ship ? Math.min(1.5, Math.abs(S.ship.ctrl.throttle) * (S.ship.ctrl.boost ? 1.5 : 1) + 0.15) : 0);
  sound.update();

  placeCamera(dt, vr);
  placeOverlays(dt, vr);

  if (S.started) {
    const d = hudData(vr);
    if (vr) {
      hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
      if (S.frame % 3 === 0) { drawHUD(vrCtx, vrCanvas.width, vrCanvas.height, d); vrTex.needsUpdate = true; }
    } else drawHUD(hudCtx, hudCanvas.width, hudCanvas.height, d);
    hintEl.hidden = vr || input.locked || S.mode === 'dead';
  }
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

// Debug handle for automated testing in the browser console.
window.__game = { S, player, world, ships: () => ships, startGame, enterShip, startMission, damageShip, hurtPlayer };
