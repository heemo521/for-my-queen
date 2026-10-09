import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { buildWorld, DECK_R, rand, pick } from './world.js';
import { buildShipMesh, buildCockpit, buildAvatar, animateAvatar, buildDroid, buildCrate, PAINT } from './models.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { drawHUD } from './hud.js';
import { Sound } from './audio.js';
import { glowTexture, canvas, toTexture } from './textures.js';
import { Wallet } from './wallet.js';
import { WEAPONS, weaponById, buildGun, createArsenal } from './weapons.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0), ORIGIN = new V3();
const tA = new V3(), tB = new V3(), tC = new V3(), tD = new V3(), tQ = new THREE.Quaternion(), tM = new THREE.Matrix4(), tE = new THREE.Euler();
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
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.getElementById('app').appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 40000);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const world = buildWorld(scene, renderer);
const fx = new FX(scene);
const input = new Input(renderer.domElement);
const sound = new Sound();

// VR controllers: right hand holds the blaster
const controllers = [0, 1].map(i => {
  const c = renderer.xr.getController(i);
  c.addEventListener('connected', e => {
    c.userData.hand = e.data.handedness;
    c.userData.source = e.data;
    if (e.data.handedness === 'right' && !c.userData.gun) {
      c.userData.gun = buildGun(S.weapon);
      c.add(c.userData.gun);
    }
  });
  c.addEventListener('disconnected', () => { c.userData.hand = null; c.userData.source = null; });
  rig.add(c);
  return c;
});
const controllerModels = new XRControllerModelFactory();
// "In Time"-style glowing life balance on your left wrist
const wristCanvas = canvas(256, 128);
const wristTex = toTexture(wristCanvas);
const wrist = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ map: wristTex, toneMapped: false, transparent: true }));
wrist.position.set(0, 0.04, 0.085);
wrist.rotation.x = -Math.PI / 2 + 0.35;
for (const i of [0, 1]) {
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModels.createControllerModel(grip));
  grip.addEventListener('connected', e => { if (e.data.handedness === 'left') grip.add(wrist); });
  rig.add(grip);
}
function drawWrist() {
  const g = wristCanvas.getContext('2d');
  const low = wallet.balance / Math.max(0.1, S.drainRate) < 60;
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(0,8,4,0.85)';
  g.fillRect(0, 0, 256, 128);
  g.shadowColor = low ? '#ff3355' : '#22ff88';
  g.shadowBlur = 16;
  g.fillStyle = low ? '#ff5577' : '#5dffa8';
  g.font = 'bold 54px Bungee, Impact, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(wallet.balance.toFixed(2), 128, 56, 240);
  g.shadowBlur = 0;
  g.font = 'bold 18px Inter, sans-serif';
  g.fillText('NVC · LIFE', 128, 106);
  wristTex.needsUpdate = true;
}
const rightController = () => controllers.find(c => c.userData.hand === 'right');

// Controller vibration (VR) — the VR stand-in for camera shake.
function haptic(hand, intensity, ms) {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const src of session.inputSources) {
    if (hand !== 'both' && src.handedness !== hand) continue;
    const act = src.gamepad?.hapticActuators?.[0];
    if (act?.pulse) act.pulse(clamp(intensity, 0, 1), ms).catch?.(() => {});
    else src.gamepad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity })?.catch?.(() => {});
  }
}

// HUD: DOM canvas on desktop; in VR a lazy-follow panel on foot and the cockpit screen in a ship.
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

// Lock-on bracket drawn in the world around the target
const bracket = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1, 4, 1),
  new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, depthTest: false, toneMapped: false, side: THREE.DoubleSide }),
);
bracket.renderOrder = 997;
bracket.visible = false;
scene.add(bracket);

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
  started: false, mode: 'foot', ship: null, wanted: 0, evade: 0, drainRate: 1, deltas: [],
  weapon: 'pulse', owned: new Set(['pulse']), fireCd: 0,
  deadT: 0, deathPos: new V3(), view: 'third', msg: '', msgT: 0, big: '', bigSub: '', bigColor: '#fff', bigT: 0,
  mission: null, nextMission: 0, radioName: '', radioT: 0, dmg: 0, spray: 0, sprayDone: false, prompt: '',
  stickX: 0, stickY: 0, snapLatch: false, camOff: new V3(), upkeepT: 0, time: 0, hudOn: true, frame: 0,
  heat: 0, overheat: false, missiles: 6, flares: 8, lockTarget: null, lockT: 0, hitT: 0, kill: false,
  shake: 0, aimT: 0, warning: false, cockpit: null, stepPhase: 0, fov: 70,
};
const wallet = new Wallet(300);
wallet.onChange((type, amount, reason) => {
  if (reason === 'life' || amount < 1) return;
  S.deltas.unshift({ text: (type === 'earn' ? '+' : '−') + amount.toFixed(0), color: type === 'earn' ? '#7dffb0' : '#ff6b81', age: 0 });
  if (S.deltas.length > 4) S.deltas.pop();
});
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

// Camera shake on desktop, controller rumble in VR, scaled by distance.
function impact(pos, strength) {
  const d = pos.distanceTo(playerPos());
  const k = clamp(strength * (1 - d / 400), 0, 1);
  if (k <= 0.02) return;
  S.shake = Math.max(S.shake, k);
  haptic('both', k, 80 + k * 200);
}

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
    this.maxHull = team === 'police' ? 140 : team === 'pirate' ? 220 : kind === 'hauler' ? 180 : 100;
    this.hull = this.maxHull;
    this.radius = kind === 'hauler' ? 8 : 5;
    this.hover = this.mesh.userData.hover;
    this.pilot = opts.pilot === undefined ? 'npc' : opts.pilot;
    this.owner = opts.owner ?? team;
    this.parked = !!opts.parked;
    this.fireCd = 0;
    this.missileCd = rand(6, 12);
    this.coins = team === 'police' ? 90 : team === 'pirate' ? 300 : kind === 'hauler' ? rand(120, 200) : rand(40, 120);
    this.gear = 1;
    this.alive = true;
    this.ai = { dest: null, flee: 0, state: 'cruise', home: null, aggro: false };
    ships.push(this);
  }
  get pos() { return this.mesh.position; }
  fwd(out = new V3()) { return out.set(0, 0, -1).applyQuaternion(this.mesh.quaternion); }
  up(out = new V3()) { return out.set(0, 1, 0).applyQuaternion(this.mesh.quaternion); }
  right(out = new V3()) { return out.set(1, 0, 0).applyQuaternion(this.mesh.quaternion); }
  local(v, out = new V3()) { return out.copy(v).applyQuaternion(this.mesh.quaternion).add(this.pos); }
}

function faceToward(s, target) {
  tM.lookAt(s.pos, target, UP);
  s.mesh.quaternion.setFromRotationMatrix(tM);
}

function removeShip(s) {
  s.alive = false;
  scene.remove(s.mesh);
  if (S.lockTarget === s) { S.lockTarget = null; S.lockT = 0; }
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
  s.gear = 0;
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
  s.gear = 0;
  faceToward(s, s.ai.dest);
}

function spawnPursuer() {
  const tgt = playerPos();
  const s = new Ship('police', S.wanted >= 5 && Math.random() < 0.3 ? 'hauler' : 'fighter');
  s.ai.state = 'pursue';
  s.gear = 0;
  s.pos.copy(tgt).add(randUnit().multiplyScalar(rand(600, 850)));
  if (world.planets.some(p => s.pos.distanceTo(p.pos) < p.r + 40)) s.pos.y += 1000;
  faceToward(s, tgt);
  s.vel.copy(s.fwd(tA)).multiplyScalar(120);
}

// Shared flight model for player and AI: arcade 6DOF with inertia, drag and lateral grip.
function stepShip(s, dt) {
  const c = s.ctrl;
  // heavily damaged engines sputter
  const sputter = s.hull < s.maxHull * 0.25 && Math.random() < 0.08 ? 0.2 : 1;
  tQ.setFromEuler(tE.set(c.pitch * 1.5 * dt, c.yaw * 1.3 * dt, c.roll * 2.4 * dt));
  s.mesh.quaternion.multiply(tQ).normalize();
  const f = s.fwd(tA), u = s.up(tB);
  const accel = (s.kind === 'hauler' ? 55 : 70) * (c.boost ? 2.4 : 1) * sputter;
  s.vel.addScaledVector(f, c.throttle * accel * dt).addScaledVector(u, c.lift * 40 * dt);
  s.vel.multiplyScalar(Math.exp(-0.55 * dt));
  const fs = s.vel.dot(f);
  tC.copy(s.vel).addScaledVector(f, -fs).multiplyScalar(Math.exp(-1.2 * dt));
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
  let impactV = 0;
  const pushSphere = (center, rad) => {
    tA.copy(p).sub(center);
    const d = tA.length();
    if (d >= rad + r || d < 1e-4) return;
    tA.divideScalar(d);
    const vn = s.vel.dot(tA);
    if (vn < 0) { impactV = Math.max(impactV, -vn); s.vel.addScaledVector(tA, -vn * 1.4); }
    p.copy(center).addScaledVector(tA, rad + r);
  };
  for (const pl of world.planets) pushSphere(pl.pos, pl.r);
  for (const o of world.spheres) pushSphere(o.pos, o.r);
  if (p.distanceTo(world.sun.pos) < world.sun.r + 250 && s === S.ship) damageShip(s, 999, 'env');
  if (p.distanceTo(world.field.center) < world.field.radius + 60) for (const a of world.asteroids) pushSphere(a.pos, a.r);

  const rx = xzLen(p);
  s.landed = false;
  if (rx < DECK_R + r * 0.5 && p.y < s.hover && p.y > -4 - s.hover) {
    if (p.y > -2) {
      p.y = s.hover;
      s.landed = true;
      if (s.vel.y < 0) { impactV = Math.max(impactV, -s.vel.y); s.vel.y = 0; }
      const f = Math.exp(-2.5 * dt);
      s.vel.x *= f;
      s.vel.z *= f;
      if (s === S.ship && Math.abs(s.ctrl.pitch) < 0.2 && Math.abs(s.ctrl.roll) < 0.2) {
        const fw = s.fwd(tB);
        tQ.setFromAxisAngle(UP, Math.atan2(-fw.x, -fw.z));
        s.mesh.quaternion.slerp(tQ, damp(3, dt));
      }
      if (s === S.ship && s.vel.length() > 12 && Math.random() < 0.5) fx.sparks(tD.set(p.x, 0.1, p.z), 3, 12);
    } else {
      p.y = -4 - s.hover;
      if (s.vel.y > 0) { impactV = Math.max(impactV, s.vel.y); s.vel.y = 0; }
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
      impactV = Math.max(impactV, s.vel.length() * 0.5);
      s.vel.multiplyScalar(0.5);
    }
  }
  for (const b of world.buildings) {
    const pen = pushOutBox(p, b, r * 0.6);
    if (pen) {
      const v = s.vel[pen[2]];
      if (v * pen[1] < 0) { impactV = Math.max(impactV, Math.abs(v)); s.vel[pen[2]] = 0; }
    }
  }
  if (impactV > 22 && s === S.ship) {
    damageShip(s, (impactV - 22) * 1.2, 'env');
    fx.sparks(p.clone().addScaledVector(s.vel.clone().normalize(), r * 0.8), 20, 25);
    sound.clang();
    impact(p, Math.min(1, impactV / 60));
  }
  const d0 = p.length();
  if (d0 > 9000) {
    s.vel.addScaledVector(p, (-60 * dt) / d0);
    if (s === S.ship) message('Leaving the sector — turn back', 1);
  }
}

function shipVsShips(me) {
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
        const hitPos = me.pos.clone().addScaledVector(n, -me.radius);
        damageShip(me, (-rel - 20) * 0.8, 'env');
        damageShip(o, (-rel - 20) * 0.8, 'player');
        fx.sparks(hitPos, 25, 30);
        sound.clang();
        impact(hitPos, Math.min(1, -rel / 50));
      }
    }
  }
}

const camPosNow = new V3();
function updateShipFx(s, dt) {
  const ud = s.mesh.userData, c = s.ctrl;
  const flying = !s.parked && s.pilot !== null;
  const thrust = flying ? Math.max(0, c.throttle) * (c.boost ? 2 : 1) : 0;
  const len = flying ? 0.6 + thrust * 2.2 + (c.boost ? 1.2 : 0) : 0.01;
  for (const f of ud.flames) {
    f.scale.set(1, 1, len * (0.9 + Math.random() * 0.2));
    f.visible = flying;
  }
  // exhaust particles for ships near the camera
  const near = s.pos.distanceTo(camPosNow) < 450;
  if (near && flying && thrust > 0.05) {
    const back = tA.set(0, 0, 1).applyQuaternion(s.mesh.quaternion);
    for (const n of ud.nozzles) if (Math.random() < 0.5 + thrust * 0.3) fx.exhaust(s.local(n, tB), back, s.vel, thrust, s.team !== 'pirate');
  }
  // damage smoke and fire
  const dmg = 1 - s.hull / s.maxHull;
  if (near && dmg > 0.5 && Math.random() < dmg * 0.9) fx.damageSmoke(s.local(tC.set(rand(-1.5, 1.5), 0.5, rand(0, 3)), tB), s.vel, dmg);
  // landing gear: deploy when slow and near the deck
  const wantGear = s.parked || s.landed || (xzLen(s.pos) < DECK_R + 20 && s.pos.y < 25 && s.vel.length() < 25);
  s.gear += ((wantGear ? 1 : 0) - s.gear) * damp(4, dt);
  ud.gear.visible = s.gear > 0.05;
  ud.gear.scale.y = s.gear;
  // lights
  const blink = Math.floor(S.time * 1.2 + s.id * 0.37) % 2 === 0 && (S.time * 1.2 + s.id * 0.37) % 1 < 0.12;
  for (const st of ud.strobes) st.visible = blink;
  if (ud.lights.length) {
    const on = s.pilot === 'npc' && (s.ai.state === 'pursue' || S.wanted > 0);
    const ph = Math.floor(S.time * 6 + s.id) % 2;
    ud.lights[0].visible = ud.lights[0].userData.glow.visible = !on || ph === 0;
    ud.lights[1].visible = ud.lights[1].userData.glow.visible = !on || ph === 1;
    ud.lights[0].userData.glow.scale.setScalar(on ? 7 : 3);
    ud.lights[1].userData.glow.scale.setScalar(on ? 7 : 3);
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
  // bank into turns like a real pilot, otherwise level out
  c.roll = clamp(-s.right(tB).y * 2 - c.yaw * 0.6, -1, 1);
  c.throttle = throttle * (local.z < 0 ? 1 : 0.4);
  c.boost = boost;
  c.lift = 0;
}

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
  // evasive jinking when the player is behind them
  const toMe = tD.copy(tgt).sub(s.pos).normalize();
  if (s.fwd(tB).dot(toMe) < -0.5 && d < 250 && Math.sin(S.time * 2 + s.id) > 0) {
    steer(s, s.pos.clone().addScaledVector(s.right(tC), Math.sin(S.time * 3 + s.id) * 120).addScaledVector(s.fwd(tB), 100), 1, true);
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
  // heavier response: homing missiles from 3 stars, and always from pirates
  s.missileCd -= dt;
  const allowed = s.team === 'pirate' || S.wanted >= 3;
  if (allowed && s.missileCd <= 0 && d > 180 && d < 1200 && S.mode !== 'dead' && enemyMissilesOnPlayer() < 2) {
    s.missileCd = s.team === 'pirate' ? rand(7, 11) : rand(9, 15) - S.wanted;
    launchMissile(s, s.team, 'player');
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

// ---------- lasers ----------
const laserCore = new THREE.BoxGeometry(0.1, 0.1, 6);
const laserGlow = new THREE.BoxGeometry(0.5, 0.5, 7.5);
const TEAM_COL = { player: 0x39ff14, police: 0xff3344, pirate: 0xff9900, civ: 0x39ff14 };
const addMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const LASER = {};
TEAM_COL.scatter = 0xff7a00;
for (const t of ['player', 'police', 'pirate', 'scatter']) LASER[t] = { core: addMat(new THREE.Color(TEAM_COL[t]).lerp(new THREE.Color(1, 1, 1), 0.6), 1), glow: addMat(TEAM_COL[t], 0.35) };
const lasers = [];

function spawnLaser(origin, dir, speed, team, dmg, owner, baseVel, life = 1.6, style = team) {
  const vel = dir.clone().multiplyScalar(speed);
  if (baseVel) vel.add(baseVel);
  const m = new THREE.Mesh(laserCore, LASER[style].core);
  m.add(new THREE.Mesh(laserGlow, LASER[style].glow));
  m.position.copy(origin);
  m.quaternion.setFromUnitVectors(tA.set(0, 0, 1), tB.copy(vel).normalize());
  scene.add(m);
  lasers.push({ m, vel, team, dmg, owner, life });
  fx.muzzle(origin, dir, team === 'player' ? 'green' : 'red', baseVel);
}

function shipFire(s, team, dmg, speed, dir = null) {
  const d = dir || s.fwd(new V3());
  for (const g of s.mesh.userData.guns) spawnLaser(s.local(g), d, speed, team, dmg, s, s.vel);
  sound.zap(team === 'player' ? 1 : 0.7, s === S.ship ? null : s.pos.clone(), s === S.ship ? 0.7 : 1);
  if (s === S.ship) {
    fx.flashLight(s.local(s.mesh.userData.guns[0]), 40, 0.06, 0x66ff66, 20);
    haptic('right', 0.25, 30);
  }
}

// Where your gun points: right controller in VR, crosshair on desktop.
function footAim(a) {
  const rc = rightController();
  if (a.vr && rc) {
    rc.updateWorldMatrix(true, true);
    const origin = rc.userData.gun ? rc.userData.gun.localToWorld(rc.userData.gun.userData.muzzle.clone()) : rc.getWorldPosition(new V3());
    const dir = new V3(0, 0, -1).applyQuaternion(rc.getWorldQuaternion(new THREE.Quaternion()));
    return { origin, dir };
  }
  const cdir = camera.getWorldDirection(new V3());
  const aim = camera.getWorldPosition(new V3()).addScaledVector(cdir, 300);
  const right = new V3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const origin = player.pos.clone().add(tA.set(0, 1.45, 0)).addScaledVector(right, 0.38).addScaledVector(cdir, 0.7);
  return { origin, dir: aim.sub(origin).normalize() };
}

// Fire the equipped weapon. Every shot of a paid weapon spends life (NVC).
function fireWeapon(a, origins, dir, baseVel, ship, dt) {
  const w = weaponById(S.weapon);
  const center = origins.reduce((acc, o) => acc.add(o), new V3()).divideScalar(origins.length);
  if (w.id === 'siphon') {
    if (!a.fire || S.overheat) return;
    arsenal.siphon(center, dir, ship, dt);
    S.heat += w.heat * dt * 10;
    S.aimT = 1.2;
    if (Math.random() < 0.3) haptic('right', 0.15, 20);
  } else {
    if (!a.fire || S.fireCd > 0 || S.overheat) return;
    if (w.cost && !wallet.spend(w.cost, w.name)) {
      message(`Can't afford ${w.name} — that shot would end your life`, 1.5);
      S.fireCd = 0.5;
      return;
    }
    arsenal.fire(w.id, { origins, dir, baseVel, ship });
    S.fireCd = w.cd * (ship && w.id === 'pulse' ? 0.65 : 1);
    S.heat += w.heat;
    S.aimT = 1.2;
    fx.flashLight(center, ship ? 40 : 25, 0.06, w.color, ship ? 20 : 12);
    haptic('right', 0.3 + w.heat, 40 + w.heat * 200);
    if (!ship) {
      S.shake = Math.max(S.shake, 0.08 + w.heat * 0.6);
      const rc = rightController();
      if (rc?.userData.gun) rc.userData.gun.position.z = 0.04 + w.heat * 0.1; // recoil kick
    }
  }
  if (S.heat >= 1) { S.heat = 1; S.overheat = true; message('Weapon overheated!', 1.2); }
  if (!ship) panicDroids(player.pos, 35);
}

function setWeapon(id, quiet = false) {
  if (!S.owned.has(id)) return;
  S.weapon = id;
  const w = weaponById(id);
  const rc = rightController();
  if (rc) {
    if (rc.userData.gun) rc.remove(rc.userData.gun);
    rc.userData.gun = buildGun(id);
    rc.add(rc.userData.gun);
  }
  const av = player.avatar.userData;
  if (av.gun) av.hand.remove(av.gun);
  av.gun = buildGun(id);
  av.gun.scale.setScalar(1.6);
  av.gun.position.set(0, -0.42, -0.05);
  av.gun.rotation.x = -Math.PI / 2;
  av.hand.add(av.gun);
  if (!quiet) message(`${w.name} — ${w.desc}`, 1.6);
}

function cycleWeapon(step) {
  const owned = WEAPONS.filter(w => S.owned.has(w.id));
  const i = owned.findIndex(w => w.id === S.weapon);
  setWeapon(owned[(i + step + owned.length) % owned.length].id);
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
    let hit = false, hitShip = null;
    if (L.team === 'player') {
      for (const s of ships) {
        if (!s.alive || s === S.ship) continue;
        if (segSphere(prevPos, p, s.pos, s.radius)) { hitShip = s; hit = true; break; }
      }
      if (!hit) {
        for (const d of droids) {
          if (d.alive && segSphere(prevPos, p, tA.copy(d.m.position).setY(d.m.position.y + 0.6), 0.7)) { damageDroid(d, L.dmg); hit = true; S.hitT = 0.25; S.kill = !d.alive; break; }
        }
      }
    } else if (S.mode === 'ship' && S.ship && segSphere(prevPos, p, S.ship.pos, S.ship.radius)) {
      hitShip = S.ship;
      hit = true;
    } else if (S.mode === 'foot' && segSphere(prevPos, p, footCenter, 1.0)) {
      hurtPlayer(L.dmg);
      hit = true;
    }
    if (!hit && solidAt(p)) hit = true;
    if (hit) {
      const hp = hitShip ? hitShip.pos.clone().add(prevPos.clone().sub(hitShip.pos).setLength(hitShip.radius * 0.7)) : p.clone();
      fx.sparks(hp, 10, 25, undefined, hitShip ? hitShip.vel : null);
      if (hitShip) {
        sound.hit(hitShip === S.ship ? null : hp);
        if (L.team === 'player') { S.hitT = 0.25; S.kill = false; }
        damageShip(hitShip, L.dmg, L.team === 'player' ? 'player' : L.team);
        if (hitShip === S.ship) { impact(hp, 0.35); }
      }
    }
    if (hit || L.life <= 0) {
      scene.remove(L.m);
      lasers.splice(i, 1);
    }
  }
}

// ---------- missiles & flares ----------
const missiles = [];
const decoys = [];
const missileGlowTex = glowTexture();
function missileMesh(team) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.6, roughness: 0.4 }));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: team === 'player' ? 0x22c55e : 0xff3344, metalness: 0.4, roughness: 0.4 }));
  nose.position.z = -1.4;
  const fins = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.4), body.material);
  fins.position.z = 0.9;
  const fins2 = fins.clone();
  fins2.rotation.z = Math.PI / 2;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: missileGlowTex, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.scale.setScalar(4);
  glow.position.z = 1.3;
  g.add(body, nose, fins, fins2, glow);
  return g;
}

function enemyMissilesOnPlayer() {
  return missiles.filter(m => m.target === 'player').length;
}

function launchMissile(s, team, target) {
  const m = missileMesh(team);
  const f = s.fwd(new V3());
  m.position.copy(s.pos).addScaledVector(s.up(tA), -1.2).addScaledVector(f, 3);
  m.quaternion.copy(s.mesh.quaternion);
  scene.add(m);
  missiles.push({ m, vel: s.vel.clone().addScaledVector(f, 40), team, target, life: 9, speed: s.vel.length() + 40, owner: s });
  sound.missile(s === S.ship ? null : m.position.clone());
  if (team !== 'player') message(team === 'police' ? 'Police missile launched!' : 'Pirate missile!', 1.5);
}

function missileTargetPos(mi) {
  const t = mi.target;
  if (t === 'player') return S.mode === 'dead' ? null : playerPos();
  if (t && t.decoy) return t.life > 0 ? t.pos : null;
  if (t && t.alive) return t.pos.clone();
  return null;
}

function detonate(mi, at) {
  fx.explosion(at, 4, mi.vel, true);
  sound.boom(0.8, at);
  impact(at, 0.8);
  // splash damage
  const by = mi.team === 'player' ? 'player' : mi.team;
  for (const s of ships) {
    if (!s.alive) continue;
    if (mi.team === 'player' && s === S.ship) continue;
    if (mi.team !== 'player' && s !== S.ship) continue;
    const d = s.pos.distanceTo(at);
    if (d < 24 + s.radius) damageShip(s, 80 * (1 - d / (24 + s.radius)) + 40, by);
  }
  if (mi.team !== 'player' && S.mode === 'foot') {
    const d = playerPos().distanceTo(at);
    if (d < 20) hurtPlayer(80 * (1 - d / 20));
  }
  if (mi.team === 'player') { S.hitT = 0.35; S.kill = false; }
  panicDroids(at, 60);
}

function updateMissiles(dt) {
  S.warning = false;
  for (let i = missiles.length - 1; i >= 0; i--) {
    const mi = missiles[i];
    mi.life -= dt;
    const pos = mi.m.position;
    mi.speed = Math.min(mi.team === 'player' ? 420 : 340, mi.speed + 220 * dt);
    const dir = tA.copy(mi.vel).normalize();
    const tp = missileTargetPos(mi);
    if (tp) {
      const want = tB.copy(tp).sub(pos).normalize();
      const ang = dir.angleTo(want);
      const maxTurn = (mi.team === 'player' ? 2.4 : 1.6) * dt;
      if (ang > 1e-4) dir.lerp(want, Math.min(1, maxTurn / ang)).normalize();
      if (mi.target === 'player' && pos.distanceTo(tp) < 1500) S.warning = true;
    }
    mi.vel.copy(dir).multiplyScalar(mi.speed);
    prevPos.copy(pos);
    pos.addScaledVector(mi.vel, dt);
    mi.m.quaternion.setFromUnitVectors(tC.set(0, 0, -1), dir);
    if (pos.distanceTo(camPosNow) < 800) fx.missileTrail(tD.copy(pos).addScaledVector(dir, -1.3), tC.copy(dir).negate(), mi.vel.clone().multiplyScalar(0.2));
    // proximity fuse
    let boom = null;
    if (tp) {
      const rad = mi.target === 'player' ? (S.mode === 'ship' ? S.ship.radius + 3 : 3) : mi.target.decoy ? 4 : mi.target.radius + 4;
      if (segSphere(prevPos, pos, tp, rad)) boom = pos.clone();
    }
    if (!boom && (solidAt(pos) || mi.life <= 0)) boom = pos.clone();
    if (boom) {
      detonate(mi, boom);
      scene.remove(mi.m);
      missiles.splice(i, 1);
    }
  }
  for (let i = decoys.length - 1; i >= 0; i--) {
    const d = decoys[i];
    d.life -= dt;
    d.vel.multiplyScalar(Math.exp(-0.8 * dt));
    d.pos.addScaledVector(d.vel, dt);
    if (Math.random() < 0.7) fx.flare(d.pos, d.vel.clone().multiplyScalar(0.3));
    if (d.life <= 0) decoys.splice(i, 1);
  }
}

function dropFlares() {
  if (S.flares <= 0) { message('Out of flares', 1.2); return; }
  S.flares--;
  const p = playerPos(), v = playerVel();
  for (let k = 0; k < 4; k++) {
    const d = { decoy: true, pos: p.clone(), vel: v.clone().multiplyScalar(0.6).add(randUnit().multiplyScalar(40)), life: 3 };
    decoys.push(d);
  }
  for (const mi of missiles) {
    if (mi.target === 'player' && mi.m.position.distanceTo(p) < 700 && Math.random() < 0.8) mi.target = pick(decoys.slice(-4));
  }
  sound.flare();
  haptic('left', 0.3, 60);
}

// Lock-on: hold the nose on a ship for ~1s.
function updateLock(dt) {
  bracket.visible = false;
  if (S.mode !== 'ship' || !S.ship) { S.lockTarget = null; S.lockT = 0; return 0; }
  const s = S.ship, f = s.fwd(tA);
  let best = null, bestDot = Math.cos(THREE.MathUtils.degToRad(12));
  for (const o of ships) {
    if (!o.alive || o === s || o.parked) continue;
    const to = tB.copy(o.pos).sub(s.pos);
    const d = to.length();
    if (d > 1500 || d < 20) continue;
    const dot = to.divideScalar(d).dot(f);
    if (dot > bestDot) { bestDot = dot; best = o; }
  }
  if (best !== S.lockTarget) { S.lockTarget = best; S.lockT = 0; }
  if (!best) return 0;
  S.lockT += dt;
  const locked = S.lockT > 1;
  const d = best.pos.distanceTo(camPosNow);
  bracket.visible = true;
  bracket.position.copy(best.pos);
  bracket.quaternion.copy(camera.getWorldQuaternion(tQ));
  bracket.rotateZ(Math.PI / 4 + (locked ? 0 : S.time * 3));
  bracket.scale.setScalar(Math.max(best.radius * 1.6, d * 0.03) * (locked ? 1 : 1.3 - Math.min(0.3, S.lockT * 0.3)));
  bracket.material.color.setHex(locked ? 0xff3355 : 0xffd23f);
  return locked ? 2 : 1;
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
  const size = s.kind === 'hauler' ? 9 : 6;
  fx.explosion(s.pos, size, s.vel, true);
  // secondary blasts
  for (let k = 1; k <= 2; k++) {
    const at = s.pos.clone().add(randUnit().multiplyScalar(s.radius));
    const v = s.vel.clone();
    setTimeout(() => { fx.explosion(at.addScaledVector(v, 0.15 * k), size * 0.5, v, false); sound.boom(0.5, at); }, 150 * k);
  }
  sound.boom(1.2, s === S.ship ? null : s.pos.clone());
  impact(s.pos, s === S.ship ? 1 : 1.2);
  if (by === 'player') {
    S.hitT = 0.4;
    S.kill = true;
    if (s.team === 'civ' && s.owner !== 'player') addWanted(1, 1);
    else if (s.team === 'police') addWanted(1, 3);
    else if (s.team === 'pirate') message('Pirate down — grab the NVC!', 2);
  }
  panicDroids(s.pos, 80);
  if (s === S.ship) ejectFromWreck(s);
  else if (s.coins > 0) dropCoins(s.pos, s.coins, s.vel);
}

// Your ship blew up: you survive in your suit if you can afford it.
function ejectFromWreck(s) {
  S.ship = null;
  if (S.cockpit) { S.cockpit.parent?.remove(S.cockpit); S.cockpit = null; }
  S.mode = 'foot';
  player.pos.copy(s.pos).add(randUnit().multiplyScalar(s.radius + 4));
  player.vel.copy(s.vel).multiplyScalar(0.3).add(randUnit().multiplyScalar(12));
  player.onGround = false;
  wallet.drain(150, 'ship destroyed', true);
  bigText('EJECTED', 'Ship destroyed · −150 NVC', '#ff7a00', 3);
  if (wallet.empty) playerDie('Blown up with an empty wallet');
}

// On foot there is no health bar: every hit drains your NVC.
function hurtPlayer(d) {
  if (S.mode !== 'foot') return;
  wallet.drain(d * 1.5, 'damage', true);
  S.dmg = Math.min(0.6, S.dmg + d / 40);
  sound.hit();
  haptic('both', 0.5, 80);
  if (wallet.empty) {
    fx.explosion(player.pos.clone().add(tA.set(0, 1, 0)), 1.5, null, false);
    playerDie('Shot down to zero NVC');
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
  droids.push({ m, target: randomDeckPoint(), speed: rand(1.2, 2.2), alive: true, wait: 0, flee: 0, hp: 20, coins: Math.round(rand(15, 50)), pulled: 0, center: new V3() });
}

function panicDroids(from, radius) {
  if (xzLen(from) > DECK_R + radius) return;
  for (const d of droids) {
    if (!d.alive || d.m.position.distanceTo(from) > radius) continue;
    d.flee = rand(4, 7);
    d.wait = 0;
    const away = d.m.position.clone().sub(from).setY(0).normalize().multiplyScalar(rand(20, 40)).add(d.m.position);
    if (xzLen(away) > DECK_R - 8) away.setLength(DECK_R - 10);
    d.target = away;
  }
}

function damageDroid(d, amt) {
  if (!d.alive) return;
  d.hp -= amt;
  if (d.hp <= 0) killDroid(d);
}

function killDroid(d) {
  d.alive = false;
  scene.remove(d.m);
  fx.explosion(d.m.position.clone().setY(0.8), 1.4, null, false);
  sound.boom(0.4, d.m.position.clone());
  addWanted(1, 1);
  panicDroids(d.m.position, 40);
  if (d.coins > 0) dropCoins(d.m.position.clone().setY(1), d.coins, null);
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
    if (d.pulled > 0) { d.pulled -= dt; d.m.rotation.x += dt * 6; d.m.rotation.z += dt * 4; continue; }
    if (p.y > 0.06) { p.y = Math.max(0, p.y - 9 * dt); d.m.rotation.x *= 0.9; d.m.rotation.z *= 0.9; if (p.y > 0.06) continue; }
    if (xzLen(p) > DECK_R - 3) p.setLength(DECK_R - 4).setY(p.y);
    if (d.wait > 0) { d.wait -= dt; continue; }
    const fleeing = d.flee > 0;
    if (fleeing) d.flee -= dt;
    const dx = d.target.x - p.x, dz = d.target.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      d.target = randomDeckPoint();
      d.wait = fleeing ? 0 : rand(0.5, 4);
      continue;
    }
    const sp = d.speed * (fleeing ? 3.2 : 1);
    const before = p.clone();
    p.x += (dx / dist) * sp * dt;
    p.z += (dz / dist) * sp * dt;
    for (const b of world.buildings) pushOutXZ(p, b, 0.4, 1.4);
    if (p.distanceTo(before) < sp * dt * 0.3) d.target = randomDeckPoint();
    if (xzLen(p) > DECK_R - 3) d.target = randomDeckPoint();
    d.m.rotation.y = Math.atan2(-dx, -dz);
    d.m.rotation.x = fleeing ? -0.2 : 0;
    d.m.position.y = Math.abs(Math.sin(S.time * 8 * sp)) * 0.05 + 0.001;
    d.m.rotation.z = 0;
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
      wallet.earn(amt, 'crate');
      let extra = '';
      if (Math.random() < 0.35 && S.missiles < 6) { S.missiles = Math.min(6, S.missiles + 2); extra = ' + 2 missiles'; }
      message(`+${amt} NVC${extra}`, 1.5);
      sound.coin();
      fx.sparks(c.position, 20, 15, new THREE.Color(0x7dff6b));
      placeCrate(c);
    }
  }
}

// ---------- NVC coin orbs (dropped by anything you destroy) ----------
const orbs = [];
const orbGeo = new THREE.OctahedronGeometry(0.35);
const orbMat = new THREE.MeshStandardMaterial({ color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.2 });
const orbSprite = new THREE.SpriteMaterial({ map: missileGlowTex, color: 0x22ff88, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
function dropCoins(pos, amount, vel) {
  amount = Math.round(amount);
  if (amount <= 0) return;
  const n = clamp(Math.ceil(amount / 40), 1, 6);
  const inSpace = !(xzLen(pos) < DECK_R + 10 && pos.y < 35 && pos.y > -10);
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(orbGeo, orbMat));
    const sp = new THREE.Sprite(orbSprite);
    sp.scale.setScalar(2.2);
    g.add(sp);
    g.position.copy(pos);
    g.scale.setScalar(inSpace ? 3 : 1);
    scene.add(g);
    const v = randUnit().multiplyScalar(inSpace ? 15 : 4).add(tA.set(0, inSpace ? 0 : 4, 0));
    if (vel) v.addScaledVector(vel, 0.3);
    orbs.push({ m: g, value: amount / n, vel: v, life: 45 });
  }
}
function updateOrbs(dt) {
  const p = playerPos(), inShip = S.mode === 'ship';
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i], m = o.m;
    o.life -= dt;
    const onDeck = xzLen(m.position) < DECK_R && m.position.y > -1 && m.position.y < 35;
    if (onDeck) o.vel.y -= 12 * dt;
    o.vel.multiplyScalar(Math.exp(-(onDeck ? 1 : 0.6) * dt));
    m.position.addScaledVector(o.vel, dt);
    if (onDeck && m.position.y < 0.5) { m.position.y = 0.5; o.vel.y = Math.abs(o.vel.y) * 0.4; }
    m.rotation.y += dt * 3;
    const d = m.position.distanceTo(p);
    const magnet = inShip ? 60 : 8;
    if (S.mode !== 'dead' && d < magnet) m.position.lerp(p, Math.min(1, dt * 4 * (1.3 - d / magnet)));
    if (S.mode !== 'dead' && d < (inShip ? 10 : 1.6)) {
      wallet.earn(o.value, 'pickup');
      sound.coin();
      fx.sparks(m.position, 10, 8, new THREE.Color(0x7dffb0));
      o.life = 0;
    }
    if (o.life <= 0) { scene.remove(m); orbs.splice(i, 1); }
    else if (o.life < 5) m.visible = Math.floor(o.life * 6) % 2 === 0;
  }
}

// ---------- arsenal wiring ----------
function shipTarget(s) {
  return (s.tgt ||= {
    kind: 'ship', ref: s, alive: () => s.alive,
    get pos() { return s.pos; },
    get radius() { return s.radius; },
    pull(dirIn, k, dt) { if (s.parked) s.parked = false; s.vel.addScaledVector(dirIn, k * dt); },
  });
}
function droidTarget(d) {
  return (d.tgt ||= {
    kind: 'droid', ref: d, radius: 0.7, alive: () => d.alive,
    get pos() { return d.center.copy(d.m.position).setY(d.m.position.y + 0.7); },
    pull(dirIn, k, dt) { d.pulled = 0.3; d.m.position.addScaledVector(dirIn, Math.min(k * dt * 0.5, 2)); },
  });
}
const arsenal = createArsenal({
  scene, fx, sound, solidAt, impact,
  targets: () => {
    const out = [];
    for (const s of ships) if (s.alive && s !== S.ship) out.push(shipTarget(s));
    for (const d of droids) if (d.alive) out.push(droidTarget(d));
    return out;
  },
  damage: (t, amt) => (t.kind === 'ship' ? damageShip(t.ref, amt, 'player') : damageDroid(t.ref, amt)),
  steal: (t, amt) => {
    const r = t.ref, k = Math.min(r.coins || 0, amt);
    if (k <= 0) return 0;
    r.coins -= k;
    wallet.earn(k, 'siphon');
    if (!r.robbed) {
      r.robbed = true;
      if (t.kind === 'droid') addWanted(0, 1);
      else if (r.team === 'police') addWanted(0, 2);
      else if (r.team === 'pirate') r.ai.aggro = true;
      else if (r.owner !== 'player') { addWanted(0, 1); if (r.pilot === 'npc') r.ai.flee = 8; }
    }
    if (t.kind === 'droid' && r.coins <= 0) killDroid(r);
    return k;
  },
  spawnLaser: (o, d, speed, dmg, baseVel, life, style) => spawnLaser(o, d, speed, 'player', dmg, null, baseVel, life, style),
  splashSelf: (pos, radius, dmg) => {
    if (S.mode === 'foot') {
      const d = playerPos().distanceTo(pos);
      if (d < radius) hurtPlayer(dmg * (1 - d / radius));
    } else if (S.mode === 'ship' && S.ship) {
      const d = S.ship.pos.distanceTo(pos);
      if (d < radius) damageShip(S.ship, dmg * 0.4 * (1 - d / radius), 'env');
    }
  },
  pullables: () => [...crates, ...orbs.map(o => o.m)],
  pullPlayer: (c, r, k, dt) => {
    const p = playerPos(), d = p.distanceTo(c);
    if (d > r || d < 0.5) return;
    const dirIn = c.clone().sub(p).divideScalar(d);
    if (S.mode === 'foot') { player.vel.addScaledVector(dirIn, k * dt * 0.6); player.onGround = false; }
    else if (S.mode === 'ship') S.ship.vel.addScaledVector(dirIn, k * dt * 0.4);
  },
  hit: kill => { S.hitT = 0.25; S.kill = kill; },
});

// ---------- Arms Lab: weapon holograms you can buy ----------
const hex = c => '#' + c.toString(16).padStart(6, '0');
function labelTexture(w, owned) {
  const c = canvas(512, 160), g = c.getContext('2d');
  g.fillStyle = 'rgba(4,10,8,0.8)';
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = hex(w.color);
  g.lineWidth = 4;
  g.strokeRect(4, 4, 504, 152);
  g.textAlign = 'center';
  g.fillStyle = hex(w.color);
  g.font = 'bold 46px Bungee, Impact, sans-serif';
  g.fillText(w.name.toUpperCase(), 256, 54, 490);
  g.fillStyle = owned ? '#7dffb0' : '#ffffff';
  g.font = 'bold 36px Inter, sans-serif';
  g.fillText(owned ? 'OWNED' : `◈ ${w.price} NVC`, 256, 102);
  g.fillStyle = '#cbd5e1';
  g.font = '24px Inter, sans-serif';
  g.fillText(w.desc + (w.cost ? ` · ${w.cost}/shot` : ''), 256, 140, 490);
  return toTexture(c);
}
const labItems = WEAPONS.slice(1).map((w, i) => {
  const slot = world.armsLab.slots[i];
  const g = buildGun(w.id);
  g.scale.setScalar(5);
  g.position.copy(slot);
  scene.add(g);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(w, false), toneMapped: false, depthWrite: false }));
  label.scale.set(3.4, 1.06, 1);
  label.position.copy(slot).add(tA.set(0, 1.5, 0));
  scene.add(label);
  return { w, g, label, slot };
});
function buyWeapon(item) {
  const w = item.w;
  if (S.owned.has(w.id)) { setWeapon(w.id); return; }
  if (!wallet.spend(w.price, 'buy ' + w.name)) {
    message(`You need more than ${w.price} NVC — buying it would end your life`, 2);
    sound.chime(false);
    return;
  }
  S.owned.add(w.id);
  setWeapon(w.id, true);
  sound.buy();
  bigText('NEW WEAPON', `${w.name} — ${w.desc}`, hex(w.color), 2.5);
  item.label.material.map = labelTexture(w, true);
  item.label.material.needsUpdate = true;
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
      if (v.y < -14) { hurtPlayer((-v.y - 14) * 3); S.shake = Math.max(S.shake, 0.3); }
      p.y = 0;
      if (v.y < 0) v.y = 0;
      player.onGround = true;
    }
    // railing at the deck edge
    const r = xzLen(p);
    if (r > DECK_R - 1.6 && r < DECK_R + 0.5 && p.y < 1.1) {
      p.x *= (DECK_R - 1.6) / r;
      p.z *= (DECK_R - 1.6) / r;
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
      p.y = b.max.y;
      v.y = 0;
      player.onGround = true;
    } else pushOutXZ(p, b, 0.45, 1.8);
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
  const faceTarget = S.aimT > 0 ? player.yaw : hs > 0.5 ? Math.atan2(-v.x, -v.z) : null;
  if (faceTarget !== null) {
    let diff = faceTarget - av.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    av.rotation.y += diff * damp(12, dt);
  }
  animateAvatar(av, dt, hs, !player.onGround, S.aimT > 0);
  for (const j of av.userData.jets) j.visible = jet;
  S.jetting = jet;
  if (jet && Math.random() < 0.6) {
    const back = av.localToWorld(tA.set(0, 0.9, 0.38));
    fx.exhaust(back, tB.set(0, -1, 0), v, 0.2, true);
  }
  // footsteps
  if (player.onGround && hs > 1) {
    const ph = Math.floor(av.userData.phase / Math.PI);
    if (ph !== S.stepPhase) { S.stepPhase = ph; sound.footstep(); }
  }

  const aim = footAim(a);
  fireWeapon(a, [aim.origin], aim.dir, null, false, dt);
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
  fireWeapon(a, s.mesh.userData.guns.map(g => s.local(g)), s.fwd(new V3()), s.vel, true, dt);
  if (a.missile) {
    if (S.missiles <= 0) message('No missiles — grab $ crates or visit the Pay \'n\' Spray', 1.5);
    else {
      S.missiles--;
      launchMissile(s, 'player', S.lockT > 1 ? S.lockTarget : null);
      haptic('right', 0.6, 120);
    }
  }
  // cockpit stick follows your inputs
  const ck = S.cockpit?.userData;
  if (ck) {
    ck.stick.rotation.set(-0.3 - c.pitch * 0.35, 0, -c.roll * 0.35);
    ck.throttle.position.z = s.mesh.userData.seat.z - 0.3 - c.throttle * 0.08;
  }
}

function attachCockpit(s) {
  if (S.cockpit) S.cockpit.parent?.remove(S.cockpit);
  S.cockpit = buildCockpit(s.mesh, vrTex);
  s.mesh.add(S.cockpit);
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
  attachCockpit(s);
  sound.clang();
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
  if (S.cockpit) { s.mesh.remove(S.cockpit); S.cockpit = null; }
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
    const item = labItems.find(it => Math.hypot(it.slot.x - player.pos.x, it.slot.z - player.pos.z) < 2.6 && player.pos.y < 3);
    if (item) {
      const w = item.w;
      S.prompt = S.owned.has(w.id) ? `${key}: Equip ${w.name}` : `${key}: Buy ${w.name} — ${w.price} NVC`;
      if (a.interact) buyWeapon(item);
      return;
    }
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

function playerDie(reason = 'Your NVC ran out') {
  if (S.mode === 'dead') return;
  S.deathPos.copy(playerPos());
  if (S.ship) { S.ship.pilot = null; S.ship = null; }
  if (S.cockpit) { S.cockpit.parent?.remove(S.cockpit); S.cockpit = null; }
  S.mode = 'dead';
  S.deadT = 4.5;
  player.avatar.visible = false;
  if (S.mission) failMission('You died.', true);
  bigText('WASTED', reason, '#ff3355', 4.5);
  sound.chime(false);
  haptic('both', 1, 400);
}

function respawn() {
  player.pos.copy(world.spawn);
  player.vel.set(0, 0, 0);
  player.yaw = Math.atan2(player.pos.x, player.pos.z);
  player.pitch = -0.1;
  S.mode = 'foot';
  S.wanted = 0;
  S.missiles = Math.max(S.missiles, 4);
  S.flares = Math.max(S.flares, 6);
  S.heat = 0;
  S.overheat = false;
  wallet.earn(150, 'emergency life loan');
  message('Med Bay revived you with an emergency loan: +150 NVC. The clock is ticking.', 5);
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
  if (S.wanted === 0 && s.hull >= s.maxHull && S.missiles >= 6) { S.sprayPrompt = "Pay 'n' Spray: nothing to fix"; return; }
  S.sprayPrompt = "Pay 'n' Spray: hold still...";
  S.spray += dt;
  // paint mist
  const mist = new THREE.Color().setHSL((S.time * 0.3) % 1, 0.8, 0.6);
  for (let k = 0; k < 3; k++) {
    fx.smoke.emit(world.sprayCenter.clone().add(tA.set(rand(-6, 6), 0, rand(-6, 6))), tB.set(rand(-1, 1), -6, rand(-1, 1)), 1.5, 1, 5, mist, mist, 0.5, 0.5);
  }
  if (S.spray < 2) return;
  S.sprayDone = true;
  if (!wallet.spend(100, "Pay 'n' Spray")) { message("Pay 'n' Spray: you need more than 100 NVC.", 3); return; }
  S.wanted = 0;
  S.evade = 0;
  s.hull = s.maxHull;
  S.missiles = 6;
  S.flares = 8;
  s.mesh.userData.hull.color.setHex(pick(PAINT));
  bigText('NEW PAINT JOB', '−100 NVC · repaired, rearmed, record cleared', '#ff7ad9', 3);
  sound.chime(true);
}

// ---------- missions ----------
const MTYPES = [
  { id: 'delivery', name: 'Hot Cargo' },
  { id: 'race', name: 'Ring Rush' },
  { id: 'bounty', name: 'Pirate Bounty' },
];
const missionRing = new THREE.Mesh(
  new THREE.TorusGeometry(26, 1.4, 10, 64),
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
    s.gear = 0;
    Object.assign(m, { title: `Take down the pirate "Red Viper" near ${b.name}`, ship: s, timer: 300, reward: 1500 });
  }
  S.mission = m;
  bigText(m.name.toUpperCase(), m.title, '#ffd23f', 3.5);
  sound.chime(true);
}

function completeMission() {
  const m = S.mission;
  S.mission = null;
  wallet.earn(m.reward, 'mission: ' + m.name);
  bigText('MISSION PASSED', `+${m.reward} NVC`, '#ffd23f', 4);
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
  const inside = vr || S.view === 'first';
  for (const s of ships) {
    const ud = s.mesh.userData;
    const mine = s === S.ship && inside;
    ud.canopy.visible = !mine;
  }
  if (S.cockpit) S.cockpit.visible = inside;
  const rc = rightController();
  if (rc?.userData.gun) {
    rc.userData.gun.visible = S.mode === 'foot';
    rc.userData.gun.position.z *= Math.exp(-20 * dt);
  }

  if (!S.started) {
    const t = S.time * 0.05;
    setLook(rig, tA.set(Math.cos(t) * 230, 70, Math.sin(t) * 230), tB.set(0, 10, 0));
    return;
  }
  if (vr) {
    if (S.mode === 'ship' && S.ship) {
      const s = S.ship;
      const seat = s.local(s.mesh.userData.seat, tA);
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
  // speed-based FOV kick when boosting
  const targetFov = S.mode === 'ship' && S.ship?.ctrl.boost ? 80 : 70;
  S.fov += (targetFov - S.fov) * damp(4, dt);
  if (Math.abs(camera.fov - S.fov) > 0.05) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
  if (S.mode === 'ship' && S.ship) {
    const s = S.ship;
    if (S.view === 'first') {
      rig.position.copy(s.local(s.mesh.userData.seat, tA));
      rig.quaternion.copy(s.mesh.quaternion);
    } else {
      const back = (s.kind === 'hauler' ? 24 : 16) + s.vel.length() * 0.02;
      const off = tA.set(0, s.kind === 'hauler' ? 6.5 : 4.5, back).applyQuaternion(s.mesh.quaternion);
      S.camOff.lerp(off, damp(6, dt));
      rig.position.copy(s.pos).add(S.camOff);
      rig.quaternion.slerp(s.mesh.quaternion, damp(7, dt));
    }
  } else if (S.mode === 'dead') {
    const t = S.time * 0.3;
    setLook(rig, tA.set(Math.cos(t) * 14, 7, Math.sin(t) * 14).add(S.deathPos), S.deathPos);
  } else {
    const dir = tB.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
    const head = tA.copy(player.pos).add(tC.set(0, 1.7, 0));
    if (S.view === 'third') {
      const right = tC.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      head.addScaledVector(right, 0.7).addScaledVector(dir, -4.5).add(tC.set(0, 0.4, 0));
    }
    // keep the third-person camera out of walls
    const pivot = player.pos.clone().add(tC.set(0, 1.7, 0));
    const eye = head.clone();
    if (S.view === 'third') {
      for (let k = 1; k <= 12; k++) {
        const pt = tD.copy(pivot).lerp(head, k / 12);
        if (world.buildings.some(b => b.distanceToPoint(pt) < 0.3)) { eye.copy(pivot).lerp(head, Math.max(0, (k - 1.5) / 12)); break; }
      }
    }
    setLook(rig, eye, eye.clone().add(dir));
  }
  // camera shake (desktop only — in VR this becomes controller rumble)
  if (S.shake > 0.001) {
    rig.position.add(tA.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(S.shake * 0.6));
    rig.rotateZ(rand(-1, 1) * S.shake * 0.02);
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
    // in a ship the cockpit screen carries the HUD instead
    vrHud.visible = S.hudOn && S.started && !(S.mode === 'ship' && S.cockpit);
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
function hudData(vr, lock) {
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
  for (const mi of missiles) add(mi.m.position, mi.team === 'player' ? '#7dff6b' : '#ff7a00', 2.5, mi.target === 'player');
  for (const c of crates) add(c.position, '#22ff88', 2);
  for (const o of orbs) add(o.m.position, '#7dffb0', 2.5);
  if (!inShip) add(world.armsLab.center, '#22ff88', 4, false, 'sq');
  if (!inShip) for (const d of droids) add(d.m.position, '#94a3b8', 2);
  const tgt = missionTarget();
  if (tgt) add(tgt, '#ffd23f', 6, true);
  const m = S.mission;
  return {
    vr, time: S.time, balance: wallet.balance, drainRate: S.drainRate, lifeSecs: wallet.balance / Math.max(0.1, S.drainRate),
    deltas: S.deltas, wanted: S.wanted, evading: S.wanted > 0 && S.evade > 2,
    weapon: (w => ({ id: w.id, name: w.name, cost: w.cost, css: hex(w.color) }))(weaponById(S.weapon)),
    slots: WEAPONS.map(w => ({ owned: S.owned.has(w.id), current: w.id === S.weapon, css: hex(w.color) })),
    mode: S.mode, hull: inShip ? S.ship.hull / S.ship.maxHull : 0,
    speed: inShip ? Math.round(S.ship.vel.length()) : 0, boost: inShip && S.ship.ctrl.boost,
    prompt: S.mode === 'dead' ? '' : S.prompt, msg: S.msgT > 0 ? S.msg : '', big: S.bigT > 0 ? S.big : '', bigSub: S.bigSub, bigColor: S.bigColor,
    mission: m && { title: m.title, timer: m.timer, dist: m.dist, extra: m.extra },
    radio: S.radioT > 0 ? S.radioName : '', dmg: S.dmg,
    crosshair: !vr && S.mode !== 'dead',
    heat: S.heat, overheat: S.overheat, missiles: S.missiles, flares: S.flares, lock, warning: S.warning && S.mode !== 'dead',
    hitT: S.hitT, kill: S.kill,
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
renderer.xr.addEventListener('sessionend', () => { S.view = 'third'; camera.fov = S.fov = 70; camera.updateProjectionMatrix(); });

setWeapon('pulse', true);
parkShip(world.pads[0], 'player');
for (let i = 1; i < world.pads.length; i++) parkShip(world.pads[i], 'civ');
for (let i = 0; i < 14; i++) spawnCivilian();
for (let i = 0; i < 2; i++) spawnPatrol();
for (let i = 0; i < 12; i++) spawnDroid();
for (let i = 0; i < 28; i++) spawnCrate();

const clock = new THREE.Clock();
const camFwd = new V3(), camUp = new V3(), zeroV = new V3();
const prof = { logic: 0, render: 0 };
function tick() {
  const t0 = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05);
  S.time += dt;
  S.frame++;
  const vr = renderer.xr.isPresenting;
  const a = input.read(vr ? renderer.xr.getSession() : null);
  camera.getWorldPosition(camPosNow);

  if (S.started) {
    if (a.radio) { S.radioName = sound.nextStation(); S.radioT = 3; }
    if (a.view) {
      if (vr) S.hudOn = !S.hudOn;
      else S.view = S.view === 'third' ? 'first' : 'third';
    }
    if (a.flare && S.mode !== 'dead') dropFlares();
    if (a.slot >= 0 && WEAPONS[a.slot]) {
      if (S.owned.has(WEAPONS[a.slot].id)) setWeapon(WEAPONS[a.slot].id);
      else message(`${WEAPONS[a.slot].name}: buy it at the Arms Lab (${WEAPONS[a.slot].price} NVC)`, 2);
    }
    if (a.weaponStep) cycleWeapon(a.weaponStep);
    S.fireCd -= dt;
    S.heat = Math.max(0, S.heat - dt * (S.overheat ? 0.45 : 0.32));
    if (S.overheat && S.heat < 0.35) S.overheat = false;
    if (S.mode === 'foot') updateFoot(dt, a);
    else if (S.mode === 'ship') updatePlayerShip(dt, a);
    else if (S.mode === 'dead' && (S.deadT -= dt) <= 0) respawn();
    // life drains every second; boosting and jetpacking burn it faster
    if (S.mode !== 'dead') {
      S.drainRate = 1 + (S.mode === 'ship' && S.ship?.ctrl.boost ? 0.6 : 0) + (S.mode === 'foot' && S.jetting ? 0.5 : 0);
      wallet.tick(dt, S.drainRate);
      if (wallet.empty) playerDie("Your NVC ran out — time's up");
    }
    for (const dl of S.deltas) dl.age += dt;
    S.deltas = S.deltas.filter(dl => dl.age < 1.6);
    S.aimT -= dt;
    handleInteract(a);
  }

  for (const s of ships) {
    if (!s.alive) continue;
    s.fireCd -= dt;
    updateAI(s, dt);
    if (!s.parked) { stepShip(s, dt); collideShip(s, dt); }
    updateShipFx(s, dt);
  }
  if (S.mode === 'ship' && S.ship) shipVsShips(S.ship);
  ships = ships.filter(s => s.alive);

  updateLasers(dt);
  updateMissiles(dt);
  arsenal.update(dt);
  updateOrbs(dt);
  for (const it of labItems) { it.g.rotation.y += dt * 0.8; it.g.position.y = it.slot.y + Math.sin(S.time * 2 + it.slot.x) * 0.1; }
  updateDroids(dt);
  updateCrates(dt);
  let lock = 0;
  if (S.started) {
    updatePolice(dt);
    updateMission(dt);
    updatePaySpray(dt);
    lock = updateLock(dt);
    sound.lockTone(lock, dt);
    if (S.warning && S.mode !== 'dead') sound.warning(dt);
    if ((S.upkeepT -= dt) <= 0) { S.upkeepT = 1; upkeep(); }
  } else world.marker.group.visible = true;
  world.update(dt, S.time, playerPos());

  S.msgT -= dt;
  S.bigT -= dt;
  S.radioT -= dt;
  S.hitT -= dt;
  S.dmg = Math.max(0, S.dmg - dt * 0.8);
  S.shake *= Math.exp(-6 * dt);
  const inShip = S.mode === 'ship' && S.ship;
  sound.setEngine(inShip ? Math.min(1.5, Math.abs(S.ship.ctrl.throttle) * (S.ship.ctrl.boost ? 1.5 : 1) + 0.15) : 0, inShip && S.ship.ctrl.boost);
  sound.update();

  placeCamera(dt, vr);
  placeOverlays(dt, vr);
  camera.getWorldPosition(camPosNow);
  camera.getWorldDirection(camFwd);
  camUp.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(tQ));
  sound.setListener(camPosNow, camFwd, camUp);
  fx.setScale(vr ? 900 : (renderer.domElement.height) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
  fx.update(dt, camPosNow, inShip ? S.ship.vel : zeroV);

  if (S.started) {
    const d = hudData(vr, lock);
    if (vr || (S.cockpit && S.view === 'first')) {
      if (S.frame % 3 === 0) { drawHUD(vrCtx, vrCanvas.width, vrCanvas.height, { ...d, crosshair: false }); vrTex.needsUpdate = true; }
    }
    if (vr && S.frame % 6 === 0) drawWrist();
    if (vr) hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    else drawHUD(hudCtx, hudCanvas.width, hudCanvas.height, d);
    hintEl.hidden = vr || input.locked || S.mode === 'dead';
  }
  const t1 = performance.now();
  renderer.render(scene, camera);
  prof.logic += (t1 - t0 - prof.logic) * 0.1;
  prof.render += (performance.now() - t1 - prof.render) * 0.1;
}
renderer.setAnimationLoop(tick);

// Debug handle for automated testing in the browser console.
window.__game = { prof, renderer, wallet, arsenal, setWeapon, labItems, buyWeapon, orbs, S, player, world, fx, ships: () => ships, missiles, startGame, enterShip, startMission, damageShip, hurtPlayer, launchMissile };
