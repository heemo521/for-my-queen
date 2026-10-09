// Futuristic arsenal: weapon definitions, hand-held models, and all firing behaviours.
// Works on foot and ship-mounted (ship mode = bigger damage, range and speed).
import * as THREE from 'three';
import { glowTexture } from './textures.js';

export const WEAPONS = [
  { id: 'pulse', name: 'Pulse Blaster', price: 0, cost: 0, cd: 0.2, heat: 0.05, color: 0x39ff14, desc: 'reliable plasma bolts' },
  { id: 'scatter', name: 'Scatter Nova', price: 350, cost: 2, cd: 0.75, heat: 0.15, color: 0xff7a00, desc: '7-bolt plasma shotgun' },
  { id: 'arc', name: 'Arc Caster', price: 500, cost: 3, cd: 0.45, heat: 0.12, color: 0xb18cff, desc: 'lightning that chains between targets' },
  { id: 'rail', name: 'Rail Lance', price: 650, cost: 6, cd: 1.1, heat: 0.25, color: 0x5ad1ff, desc: 'hypersonic beam that pierces everything' },
  { id: 'siphon', name: 'Chrono Siphon', price: 800, cost: 0, cd: 0.1, heat: 0.02, color: 0x22ff88, desc: 'beam that steals NVC from its target' },
  { id: 'swarm', name: 'Hornet Swarm', price: 900, cost: 10, cd: 1.6, heat: 0.3, color: 0xff3b6b, desc: '6 homing micro-rockets' },
  { id: 'mortar', name: 'Sun Mortar', price: 1000, cost: 8, cd: 1.2, heat: 0.22, color: 0xffd23f, desc: 'lobs a tiny star — huge blast' },
  { id: 'gravity', name: 'Singularity Gun', price: 1500, cost: 20, cd: 3, heat: 0.4, color: 0x9b5de5, desc: 'black hole pulls everything in, then collapses' },
];
export const weaponById = id => WEAPONS.find(w => w.id === id);

const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
const randDir = (out = new V3()) => {
  do out.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); while (out.lengthSq() > 1 || out.lengthSq() < 0.01);
  return out.normalize();
};

// ---------- gun models (barrel along -Z, ~25cm long in VR) ----------
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.35, ...o });
const glowMat = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });

export function buildGun(id) {
  const w = weaponById(id);
  const g = new THREE.Group();
  const dark = mat(0x23262d), metal = mat(0x8a9099, { metalness: 1, roughness: 0.25 }), accent = mat(w.color, { emissive: w.color, emissiveIntensity: 0.35 });
  const glow = glowMat(w.color);
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    g.add(mesh);
    return mesh;
  };
  const cyl = (r, l, seg = 10) => new THREE.CylinderGeometry(r, r, l, seg).rotateX(Math.PI / 2);
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  add(box(0.035, 0.11, 0.05), dark, 0, -0.06, 0.03, 0.3); // grip
  let muzzleZ = -0.25;
  switch (id) {
    case 'scatter':
      add(box(0.08, 0.06, 0.2), accent, 0, 0, -0.05);
      for (const x of [-0.025, 0, 0.025]) add(cyl(0.012, 0.12), metal, x, 0.01, -0.2);
      add(box(0.09, 0.015, 0.05), dark, 0, 0.04, -0.02);
      muzzleZ = -0.27;
      break;
    case 'arc':
      add(box(0.05, 0.06, 0.16), dark, 0, 0, -0.04);
      add(box(0.008, 0.008, 0.16), metal, -0.022, 0.015, -0.18);
      add(box(0.008, 0.008, 0.16), metal, 0.022, 0.015, -0.18);
      add(new THREE.SphereGeometry(0.018, 10, 8), glow, 0, 0.015, -0.2);
      add(new THREE.TorusGeometry(0.03, 0.006, 6, 16), accent, 0, 0.01, -0.08);
      muzzleZ = -0.27;
      break;
    case 'rail':
      add(box(0.045, 0.055, 0.18), dark, 0, 0, -0.03);
      add(cyl(0.009, 0.32), metal, 0, 0.01, -0.25);
      for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.02, 0.005, 6, 16), accent, 0, 0.01, -0.14 - i * 0.05);
      add(box(0.01, 0.03, 0.08), dark, 0, 0.05, -0.02);
      muzzleZ = -0.42;
      break;
    case 'siphon':
      add(box(0.045, 0.05, 0.14), dark, 0, 0, -0.03);
      add(cyl(0.022, 0.12, 14), new THREE.MeshStandardMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 0.8, transparent: true, opacity: 0.7 }), 0, 0.01, -0.15);
      add(new THREE.TorusGeometry(0.026, 0.004, 6, 16), metal, 0, 0.01, -0.1);
      add(new THREE.TorusGeometry(0.026, 0.004, 6, 16), metal, 0, 0.01, -0.2);
      add(new THREE.ConeGeometry(0.02, 0.05, 10).rotateX(-Math.PI / 2), metal, 0, 0.01, -0.235);
      muzzleZ = -0.27;
      break;
    case 'swarm':
      add(box(0.09, 0.08, 0.16), dark, 0, 0.01, -0.06);
      for (let i = 0; i < 6; i++) add(cyl(0.01, 0.02), accent, -0.025 + (i % 3) * 0.025, -0.005 + Math.floor(i / 3) * 0.03, -0.145);
      add(box(0.02, 0.02, 0.06), metal, 0.05, 0.05, -0.02);
      muzzleZ = -0.17;
      break;
    case 'mortar':
      add(cyl(0.035, 0.18, 14), dark, 0, 0.015, -0.1);
      add(new THREE.TorusGeometry(0.036, 0.008, 8, 18), accent, 0, 0.015, -0.19);
      add(new THREE.CircleGeometry(0.03, 14).rotateY(Math.PI), glow, 0, 0.015, -0.19);
      muzzleZ = -0.22;
      break;
    case 'gravity':
      add(box(0.04, 0.05, 0.12), dark, 0, 0, 0);
      add(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshStandardMaterial({ color: 0x050008, metalness: 1, roughness: 0.05 }), 0, 0.015, -0.12);
      g.userData.ring = add(new THREE.TorusGeometry(0.055, 0.006, 6, 24), glow, 0, 0.015, -0.12, Math.PI / 2.5);
      add(cyl(0.012, 0.06), metal, 0, 0.015, -0.19);
      muzzleZ = -0.23;
      break;
    default: // pulse
      add(box(0.05, 0.055, 0.2), accent, 0, 0, -0.06);
      add(box(0.03, 0.02, 0.12), dark, 0, 0.035, -0.04);
      add(cyl(0.013, 0.1), dark, 0, 0.01, -0.2);
      add(new THREE.SphereGeometry(0.012, 8, 6), glow, 0, 0.01, -0.25);
      muzzleZ = -0.27;
  }
  g.userData.muzzle = new V3(0, 0.01, muzzleZ);
  g.userData.id = id;
  return g;
}

// ---------- the arsenal ----------
// ctx: scene, fx, sound, targets(), damage(t, amt), steal(t, amt), solidAt(p), spawnLaser(...),
//      impact(pos, k), splashSelf(pos, radius, dmg), pullables(), pullPlayer(center, radius, strength, dt), hit(kill)
export function createArsenal(ctx) {
  const { scene, fx, sound } = ctx;
  const glowTex = glowTexture();
  const spriteMats = {};
  const spriteMat = color => (spriteMats[color] ||= new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const effects = [];
  const projectiles = [];
  const wells = [];
  const tA = new V3(), tB = new V3(), tC = new V3();
  const COLOR = c => new THREE.Color(c);

  function beam(a, b, color, width, life) {
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), tA.copy(b).sub(a).normalize());
    const meshes = [];
    for (const [w, c, o] of [[width, color, 0.45], [width * 0.3, 0xffffff, 1]]) {
      const m = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.position.copy(mid);
      m.quaternion.copy(q);
      m.scale.set(w, len, w);
      scene.add(m);
      meshes.push(m);
    }
    effects.push({ meshes, t: 0, life, base: meshes.map(m => m.material.opacity), width });
  }

  function lightning(a, b, color, life, amp = 0.1) {
    const len = a.distanceTo(b);
    const n = Math.max(6, Math.min(30, Math.round(len / 3)));
    const dir = tA.copy(b).sub(a);
    const side = new V3().crossVectors(dir, new V3(0.3, 1, 0.2)).normalize();
    const up = new V3().crossVectors(dir, side).normalize();
    const meshes = [];
    for (const [c, op, k] of [[color, 0.7, 1], [0xffffff, 1, 0.5]]) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n, j = i === 0 || i === n ? 0 : len * amp * k;
        pts.push(a.clone().lerp(b, f).addScaledVector(side, rnd(-j, j)).addScaledVector(up, rnd(-j, j)));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      line.frustumCulled = false;
      scene.add(line);
      meshes.push(line);
    }
    effects.push({ meshes, t: 0, life, base: [0.7, 1], dispose: true });
  }

  function targetsInCone(origin, dir, range, cosA, exclude = []) {
    const out = [];
    for (const t of ctx.targets()) {
      if (exclude.includes(t.ref)) continue;
      const to = tB.copy(t.pos).sub(origin);
      const d = to.length();
      if (d > range || d < 0.5) continue;
      const c = to.divideScalar(d).dot(dir);
      if (c > cosA) out.push({ t, d, c });
    }
    return out.sort((x, y) => y.c - x.c).map(o => o.t);
  }

  function rayHits(origin, dir, range, tol) {
    const out = [];
    for (const t of ctx.targets()) {
      const to = tB.copy(t.pos).sub(origin);
      const along = to.dot(dir);
      if (along < 0 || along > range) continue;
      const perp = to.addScaledVector(dir, -along).length();
      if (perp < t.radius + tol) out.push({ t, along });
    }
    return out.sort((a, b) => a.along - b.along);
  }

  function rayEnd(origin, dir, range, step = 3) {
    for (let d = step; d < range; d += step) if (ctx.solidAt(tC.copy(origin).addScaledVector(dir, d))) return d;
    return range;
  }

  function explode(pos, size, radius, dmg, vel = null) {
    fx.explosion(pos, size, vel, size > 3);
    sound.boom(Math.min(1.2, size / 6), pos.clone());
    ctx.impact(pos, Math.min(1, size / 6));
    for (const t of ctx.targets()) {
      const d = t.pos.distanceTo(pos);
      if (d < radius + t.radius) ctx.damage(t, dmg * (1 - Math.min(1, d / (radius + t.radius))) + dmg * 0.2);
    }
    ctx.splashSelf(pos, radius * 0.8, dmg * 0.5);
  }

  const center = list => list.reduce((s, v) => s.add(v), new V3()).divideScalar(list.length);

  // opts: { origins: [V3], dir, baseVel, ship }
  function fire(id, opts) {
    const { origins, dir, baseVel, ship } = opts;
    const S = ship ? 1.6 : 1;
    const origin = center(origins);
    const w = weaponById(id);
    switch (id) {
      case 'pulse':
        for (const o of origins) ctx.spawnLaser(o, dir, ship ? 650 : 420, ship ? 18 : 12, baseVel, 1.6, 'player');
        sound.zap(ship ? 1 : 1.5, null, 0.6);
        break;
      case 'scatter':
        for (const o of origins) {
          for (let i = 0; i < 7; i++) {
            const d = dir.clone().add(randDir(tA).multiplyScalar(ship ? 0.045 : 0.07)).normalize();
            ctx.spawnLaser(o, d, ship ? 700 : 480, ship ? 13 : 9, baseVel, ship ? 0.9 : 0.35, 'scatter');
          }
        }
        sound.weapon('scatter');
        ctx.impact(origin, 0.25);
        break;
      case 'rail': {
        const range = ship ? 1800 : 500;
        const end = rayEnd(origin, dir, range);
        const hits = rayHits(origin, dir, end, ship ? 2 : 0.5);
        for (const h of hits) {
          ctx.damage(h.t, 75 * S);
          fx.sparks(h.t.pos, 18, 30, COLOR(w.color));
        }
        if (hits.length) ctx.hit(false);
        const endPos = origin.clone().addScaledVector(dir, end);
        beam(origin, endPos, w.color, ship ? 0.6 : 0.12, 0.45);
        fx.sparks(endPos, 12, 20, COLOR(w.color));
        for (let i = 0; i < 25; i++) {
          const p = origin.clone().addScaledVector(dir, Math.random() * end);
          fx.add.emit(p, randDir(tA).multiplyScalar(2), 0.6, ship ? 1.2 : 0.3, 0.05, COLOR(w.color), COLOR(0x1f3bff), 0.7, 1);
        }
        fx.flashLight(origin, 60, 0.12, w.color, 30);
        sound.weapon('rail');
        ctx.impact(origin, 0.45);
        break;
      }
      case 'arc': {
        const range = ship ? 450 : 120, jump = ship ? 180 : 45;
        const first = targetsInCone(origin, dir, range, Math.cos(0.3))[0];
        if (!first) {
          const p = origin.clone().addScaledVector(dir, range * 0.4).add(randDir(tA).multiplyScalar(range * 0.05));
          lightning(origin, p, w.color, 0.12, 0.12);
          sound.weapon('arc');
          break;
        }
        const chain = [first];
        while (chain.length < 4) {
          const last = chain[chain.length - 1];
          let best = null, bd = jump;
          for (const t of ctx.targets()) {
            if (chain.includes(t) || chain.some(c => c.ref === t.ref)) continue;
            const d = t.pos.distanceTo(last.pos);
            if (d < bd) { bd = d; best = t; }
          }
          if (!best) break;
          chain.push(best);
        }
        let from = origin;
        chain.forEach((t, i) => {
          lightning(from, t.pos.clone(), w.color, 0.18, 0.09);
          ctx.damage(t, 28 * S * 0.8 ** i);
          fx.sparks(t.pos, 10, 15, COLOR(w.color));
          from = t.pos.clone();
        });
        ctx.hit(false);
        fx.flashLight(origin, 40, 0.15, w.color, 25);
        sound.weapon('arc');
        break;
      }
      case 'mortar': {
        const vel = dir.clone().multiplyScalar(ship ? 260 : 32).add(baseVel || tA.set(0, 0, 0));
        if (!ship) vel.y += 7;
        const m = new THREE.Sprite(spriteMat(w.color));
        m.scale.setScalar(ship ? 6 : 1.4);
        m.position.copy(origin);
        scene.add(m);
        projectiles.push({ kind: 'mortar', m, vel, life: 6, ship, gravity: ship ? 0 : 16 });
        sound.weapon('mortar');
        ctx.impact(origin, 0.35);
        break;
      }
      case 'gravity': {
        const vel = dir.clone().multiplyScalar(ship ? 170 : 30).add(baseVel || tA.set(0, 0, 0));
        const m = new THREE.Group();
        m.add(new THREE.Mesh(new THREE.SphereGeometry(ship ? 1.6 : 0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 })));
        const s = new THREE.Sprite(spriteMat(w.color));
        s.scale.setScalar(ship ? 9 : 1.8);
        m.add(s);
        m.position.copy(origin);
        scene.add(m);
        projectiles.push({ kind: 'gravity', m, vel, life: ship ? 1.6 : 1.4, ship });
        sound.weapon('gravity');
        break;
      }
      case 'swarm': {
        const range = ship ? 1200 : 200;
        const targets = targetsInCone(origin, dir, range, Math.cos(0.6));
        for (let i = 0; i < 6; i++) {
          const m = new THREE.Sprite(spriteMat(w.color));
          m.scale.setScalar(ship ? 3 : 0.8);
          m.position.copy(origin);
          scene.add(m);
          const vel = dir.clone().multiplyScalar(ship ? 120 : 25).add(randDir(tA).multiplyScalar(ship ? 50 : 10));
          if (baseVel) vel.add(baseVel);
          projectiles.push({ kind: 'swarm', m, vel, life: 4, ship, target: targets.length ? targets[i % targets.length] : null, speed: vel.length(), delay: i * 0.05 });
        }
        sound.weapon('swarm');
        break;
      }
    }
  }

  // Continuous beam while the trigger is held.
  let siphonCd = 0;
  function siphon(origin, dir, ship, dt) {
    const w = weaponById('siphon');
    const range = ship ? 260 : 70;
    const hit = rayHits(origin, dir, range, ship ? 3 : 1)[0];
    const end = hit ? hit.t.pos.clone() : origin.clone().addScaledVector(dir, rayEnd(origin, dir, range));
    lightning(origin, end, w.color, 0.05, hit ? 0.03 : 0.015);
    siphonCd -= dt;
    if (siphonCd > 0) return;
    siphonCd = 0.1;
    sound.weapon('siphon');
    if (!hit) return;
    const got = ctx.steal(hit.t, ship ? 6 : 3);
    ctx.damage(hit.t, ship ? 6 : 3);
    ctx.hit(false);
    // stolen life flows back to you
    const n = got > 0 ? 6 : 2;
    for (let i = 0; i < n; i++) {
      const p = end.clone().add(randDir(tA).multiplyScalar(hit.t.radius * 0.6));
      fx.add.emit(p, tB.copy(origin).sub(p).multiplyScalar(2.2), 0.45, ship ? 1.6 : 0.35, 0.1, COLOR(0x9dffc8), COLOR(w.color), 1, 0);
    }
  }

  function update(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += dt;
      const k = e.t / e.life;
      if (k >= 1) {
        for (const m of e.meshes) {
          scene.remove(m);
          m.material.dispose();
          if (e.dispose) m.geometry.dispose();
        }
        effects.splice(i, 1);
        continue;
      }
      e.meshes.forEach((m, j) => {
        m.material.opacity = e.base[j] * (1 - k);
        if (e.width) { m.scale.x = m.scale.z = (j ? e.width * 0.3 : e.width) * (1 + k * 2); }
      });
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      const pos = p.m.position;
      let boom = false;
      if (p.kind === 'swarm') {
        if ((p.delay -= dt) > 0) { pos.addScaledVector(p.vel, dt); continue; }
        p.speed = Math.min(p.ship ? 340 : 120, p.speed + (p.ship ? 300 : 90) * dt);
        const dir = tA.copy(p.vel).normalize();
        if (p.target && p.target.alive()) {
          const want = tB.copy(p.target.pos).sub(pos).normalize();
          const ang = dir.angleTo(want);
          if (ang > 1e-4) dir.lerp(want, Math.min(1, (4 * dt) / ang)).normalize();
          if (pos.distanceTo(p.target.pos) < p.target.radius + (p.ship ? 3 : 1)) boom = true;
        }
        p.vel.copy(dir).multiplyScalar(p.speed);
        pos.addScaledVector(p.vel, dt);
        fx.add.emit(pos, tB.copy(dir).multiplyScalar(-10), 0.25, p.ship ? 1.6 : 0.4, 0.1, COLOR(0xffd0a0), COLOR(0xff3b6b), 0.9, 1);
        if (Math.random() < 0.5) fx.smoke.emit(pos, tB.set(0, 0, 0), 0.8, p.ship ? 1 : 0.25, p.ship ? 3 : 0.8, COLOR(0x9a9aa0), COLOR(0x55555a), 0.35, 0.5);
        if (!boom && (ctx.solidAt(pos) || p.life <= 0)) boom = true;
        if (boom) explode(pos.clone(), p.ship ? 2.5 : 0.8, p.ship ? 12 : 4, p.ship ? 45 : 30);
      } else if (p.kind === 'mortar') {
        p.vel.y -= p.gravity * dt;
        pos.addScaledVector(p.vel, dt);
        p.m.scale.setScalar((p.ship ? 6 : 1.4) * (1 + Math.sin(p.life * 30) * 0.15));
        fx.add.emit(pos, tB.set(0, 0, 0), 0.3, p.ship ? 4 : 1, 0.2, COLOR(0xfff2b0), COLOR(0xff6a00), 0.8, 0);
        for (const t of ctx.targets()) if (pos.distanceTo(t.pos) < t.radius + (p.ship ? 3 : 1)) { boom = true; break; }
        if (!boom && (ctx.solidAt(pos) || p.life <= 0)) boom = true;
        if (boom) explode(pos.clone(), p.ship ? 9 : 4.5, p.ship ? 40 : 14, p.ship ? 160 : 100);
      } else if (p.kind === 'gravity') {
        pos.addScaledVector(p.vel, dt);
        p.m.rotation.z += dt * 4;
        for (const t of ctx.targets()) if (pos.distanceTo(t.pos) < t.radius + 1) { p.life = 0; break; }
        if (ctx.solidAt(pos)) p.life = 0;
        if (p.life <= 0) spawnWell(pos.clone(), p.ship);
      }
      if (boom || p.life <= 0) {
        scene.remove(p.m);
        projectiles.splice(i, 1);
      }
    }

    for (let i = wells.length - 1; i >= 0; i--) {
      const w = wells[i];
      w.t += dt;
      const k = w.t / w.dur;
      const c = w.group.position;
      w.ring.rotation.z += dt * 5;
      w.ring2.rotation.z -= dt * 3;
      w.group.scale.setScalar(Math.min(1, w.t * 3) * (k > 0.9 ? 1 - (k - 0.9) * 8 : 1));
      // particles spiralling inward
      for (let j = 0; j < 6; j++) {
        const p = c.clone().add(randDir(tA).multiplyScalar(w.radius * rnd(0.4, 0.9)));
        const toC = tB.copy(c).sub(p);
        const tang = tC.crossVectors(toC, new V3(0, 1, 0)).normalize().multiplyScalar(toC.length() * 1.5);
        fx.add.emit(p, toC.multiplyScalar(1.4).add(tang), 0.7, w.ship ? 2 : 0.5, 0.05, COLOR(0xd9b8ff), COLOR(0x6a00ff), 0.8, 0);
      }
      const pull = (w.ship ? 140 : 30) * (1 - k * 0.3);
      for (const t of ctx.targets()) {
        const d = t.pos.distanceTo(c);
        if (d > w.radius || d < 0.01) continue;
        const dirIn = tA.copy(c).sub(t.pos).divideScalar(d);
        t.pull(dirIn, pull * (1 - d / w.radius) + pull * 0.3, dt, c);
        if (d < w.radius * 0.2) ctx.damage(t, (w.ship ? 45 : 25) * dt);
      }
      for (const obj of ctx.pullables()) {
        const d = obj.position.distanceTo(c);
        if (d < w.radius && d > 0.5) obj.position.addScaledVector(tA.copy(c).sub(obj.position).normalize(), Math.min(d, pull * dt));
      }
      ctx.pullPlayer(c, w.radius * 0.7, pull * 0.6, dt);
      if (w.t >= w.dur) {
        scene.remove(w.group);
        wells.splice(i, 1);
        explode(c.clone(), w.ship ? 10 : 5, w.radius * 0.45, w.ship ? 180 : 120);
      }
    }
  }

  function spawnWell(pos, ship) {
    const group = new THREE.Group();
    const r = ship ? 6 : 1.5;
    group.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })));
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xb18cff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.3, r * 2.6, 48), ringMat);
    ring.rotation.x = Math.PI / 2.3;
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(r * 1.1, r * 1.5, 48), ringMat);
    ring2.rotation.x = -Math.PI / 3;
    const halo = new THREE.Sprite(spriteMat(0x9b5de5));
    halo.scale.setScalar(r * 8);
    group.add(ring, ring2, halo);
    group.position.copy(pos);
    scene.add(group);
    wells.push({ group, ring, ring2, t: 0, dur: 3.2, radius: ship ? 170 : 40, ship });
    fx.flashLight(pos, 80, 0.4, 0x9b5de5, ship ? 120 : 40);
    sound.weapon('wellOpen', pos.clone());
  }

  return { fire, siphon, update, projectiles, wells };
}
