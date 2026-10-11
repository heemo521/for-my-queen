// AI players: characters who live in the world like real players. Each has a persona,
// an NVC life clock, memories, moods and opinions. A brain (Claude via server/worker.js,
// or the offline personality engine) decides what they do; this module carries it out.
import * as THREE from 'three';
import { PERSONAS, ACTIONS, PLACES, MOODS } from './personas.js';
import { BrainClient } from './brain.js';
import { Wallet } from './wallet.js';
import { canvas, toTexture } from './textures.js';

const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
const pickW = list => {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
};
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hex = c => '#' + c.toString(16).padStart(6, '0');
const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createAIPlayers(ctx) {
  const { scene, world, fx, sound } = ctx;
  const brain = new BrainClient();
  const list = [];
  const events = []; // { t, text, pos }
  const feed = []; // chat/kill feed lines for the HUD
  let clock = 0;

  const PLACE_POS = {
    med_bay: world.spawn.clone(),
    neon_bar: new V3(33, 0, -20),
    casino: new V3(-35, 0, 40),
    sky_tower: new V3(10, 0, 47),
    arms_lab: world.armsLab.center.clone().add(new V3(0, 0, -4)),
    plaza: new V3(6, 0, 6),
    pads: new V3(0, 0, -48),
    pay_n_spray: new V3(62, 0, 30),
  };
  const spaceDest = name => {
    if (name === 'asteroid_field') return world.field.center.clone().add(new V3(0, 60, 0));
    const b = world.beacons.find(b => b.name.toLowerCase() === String(name).toLowerCase());
    return b ? b.pos.clone() : null;
  };
  const nameOf = t => (t === 'player' ? 'the player' : t);

  function emit(text, pos = null) {
    events.push({ t: clock, text, pos: pos ? pos.clone() : null });
    if (events.length > 60) events.shift();
  }
  function pushFeed(name, color, text) {
    feed.push({ name, color, text, t: clock });
    if (feed.length > 8) feed.shift();
  }

  // ---------- voice ----------
  let voices = [];
  const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch { voices = []; } };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function speakAloud(ai, text) {
    if (!('speechSynthesis' in window) || !ctx.S.started) return;
    const d = ai.worldPos().distanceTo(ctx.playerPos());
    if (d > 60) return;
    try {
      if (speechSynthesis.pending) return; // never pile up a queue of chatter
      const u = new SpeechSynthesisUtterance(text);
      const v = ai.p.voice;
      u.pitch = v.pitch;
      u.rate = v.rate;
      u.volume = clamp(1 - d / 60, 0.15, 1);
      const match = v.prefer.map(n => voices.find(x => x.name.includes(n) || (n === 'female' && /female/i.test(x.name)) || (n === 'male' && /\bmale/i.test(x.name)))).find(Boolean);
      if (match) u.voice = match;
      speechSynthesis.speak(u);
    } catch { /* speech not available */ }
  }

  // ---------- floating labels ----------
  function labelSprite(w, h, scale) {
    const c = canvas(w, h);
    const tex = toTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    s.scale.set(scale * (w / h), scale, 1);
    s.renderOrder = 10;
    return { s, c, tex };
  }

  class AIPlayer {
    constructor(p, i) {
      this.p = p;
      this.name = p.name;
      this.alive = true;
      this.wallet = new Wallet(p.startNVC);
      this.mode = 'foot';
      this.pos = ctx.randomDeckPoint();
      this.vel = new V3();
      this.yaw = rnd(0, Math.PI * 2);
      this.weapon = p.weapon;
      this.wanted = 0;
      this.wantedT = 0;
      this.mood = 'calm';
      this.attitude = Math.round((p.friendly - 0.5) * 4); // -10..10 toward the player
      this.opinions = {};
      this.memory = [];
      this.inbox = [];
      this.seen = 0; // index into events already perceived
      this.action = { type: 'wander' };
      this.actionT = 0;
      this.decideT = 2 + i * 1.7;
      this.pending = false;
      this.fireCd = 0;
      this.robT = 0;
      this.lastAttacker = null;
      this.lastAttackT = -99;
      this.ship = null;
      this.deadT = 0;
      this.center = new V3();
      this.avatar = ctx.buildAvatar();
      this.avatar.traverse(o => {
        if (!o.isMesh || !o.material?.color) return;
        if (o.material.color.getHex() === 0xff2e88) { o.material = o.material.clone(); o.material.color.setHex(p.color); }
        else if (o.material.color.getHex() === 0xeef0f3) { o.material = o.material.clone(); o.material.color.setHex(p.suit); }
      });
      this.setGun(this.weapon);
      this.avatar.position.copy(this.pos);
      scene.add(this.avatar);
      this.tag = labelSprite(256, 64, 0.55);
      scene.add(this.tag.s);
      this.bubble = labelSprite(512, 128, 1.1);
      this.bubble.s.visible = false;
      scene.add(this.bubble.s);
      this.bubbleT = 0;
      this.tagT = 0;
    }

    setGun(id) {
      const u = this.avatar.userData;
      if (u.gun) u.hand.remove(u.gun);
      u.gun = ctx.buildGun(id);
      u.gun.scale.setScalar(1.6);
      u.gun.position.set(0, -0.42, -0.05);
      u.gun.rotation.x = -Math.PI / 2;
      u.hand.add(u.gun);
    }

    worldPos(out = new V3()) {
      if (this.mode === 'ship' && this.ship) return out.copy(this.ship.pos);
      return out.copy(this.pos).setY(this.pos.y + 1);
    }
    worldVel() { return this.mode === 'ship' && this.ship ? this.ship.vel : this.vel; }
    get radius() { return this.mode === 'ship' && this.ship ? this.ship.radius : 0.8; }

    // ---------- talking ----------
    say(text) {
      text = String(text || '').trim().slice(0, 160);
      if (!text) return;
      this.lastSaid = text;
      pushFeed(this.name, this.p.color, text);
      emit(`${this.name} said: "${text}"`, this.worldPos());
      this.drawBubble(text);
      speakAloud(this, text);
    }

    drawBubble(text) {
      const { c, tex, s } = this.bubble;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(8,10,16,0.82)';
      g.beginPath();
      g.roundRect(4, 4, c.width - 8, c.height - 8, 22);
      g.fill();
      g.strokeStyle = hex(this.p.color);
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = '#fff';
      g.font = 'bold 26px Inter, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const words = text.split(' ');
      const lines = [''];
      for (const w of words) {
        const t = (lines[lines.length - 1] + ' ' + w).trim();
        if (g.measureText(t).width > c.width - 40 && lines.length < 3) lines.push(w);
        else lines[lines.length - 1] = t;
      }
      lines.slice(0, 3).forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (Math.min(3, lines.length) - 1) / 2) * 30, c.width - 30));
      tex.needsUpdate = true;
      s.visible = true;
      this.bubbleT = 6 + text.length * 0.05;
    }

    drawTag() {
      const { c, tex } = this.tag;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.font = 'bold 26px Inter, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      const label = this.name + (this.wanted ? ' ' + '★'.repeat(this.wanted) : '');
      g.strokeText(label, 128, 20);
      g.fillStyle = hex(this.p.color);
      g.fillText(label, 128, 20);
      const low = this.wallet.balance < 60;
      g.font = 'bold 22px Inter, sans-serif';
      g.strokeText('◈ ' + Math.floor(this.wallet.balance), 128, 48);
      g.fillStyle = low ? '#ff5577' : '#7dffb0';
      g.fillText('◈ ' + Math.floor(this.wallet.balance), 128, 48);
      tex.needsUpdate = true;
    }

    remember(note) {
      note = String(note || '').trim().slice(0, 140);
      if (!note) return;
      this.memory.push(note);
      if (this.memory.length > 14) this.memory.shift();
    }

    // ---------- perception ----------
    observe() {
      const me = this.worldPos();
      const pp = ctx.playerPos();
      const S = ctx.S;
      const dPlayer = me.distanceTo(pp);
      const rate = 1;
      const lines = [];
      const placeName = this.whereAmI();
      lines.push(`YOU: ${this.name}. NVC ${this.wallet.balance.toFixed(0)} (${fmtT(this.wallet.balance / rate)} of life left). ${this.mode === 'ship' ? 'Flying a ship' : 'On foot'} ${placeName}. Weapon: ${this.weapon}. Wanted: ${this.wanted ? this.wanted + ' stars' : 'none'}. Mood: ${this.mood}.`);
      lines.push(`YOUR FEELINGS TOWARD THE PLAYER: ${this.attitude} on a -10 (hate) to +10 (love) scale.`);
      if (S.mode === 'dead') lines.push('PLAYER: currently dead (respawning at the Med Bay).');
      else {
        const w = ctx.weaponName();
        const doing = S.mode === 'ship' ? `flying a ship at ${Math.round(ctx.playerVel().length())} m/s` : 'on foot';
        lines.push(`PLAYER${ctx.playerName() ? ` (calls themselves ${ctx.playerName()})` : ''}: ${Math.round(dPlayer)} m away, ${doing}, wanted ${S.wanted ? S.wanted + ' stars' : 'none'}, about ${Math.round(ctx.wallet.balance)} NVC, holding ${w}.`);
      }
      const others = list.filter(o => o !== this && o.alive).map(o => `${o.name} (${Math.round(o.worldPos().distanceTo(me))} m, ${o.mode === 'ship' ? 'in a ship' : 'on foot'}${o.wanted ? ', wanted' : ''}, your opinion ${this.opinions[o.name] || 0})`);
      if (others.length) lines.push('PEOPLE YOU KNOW: ' + others.join('; ') + '.');
      const police = ctx.ships().filter(s => s.alive && s.team === 'police' && s.pos.distanceTo(me) < 800).length;
      const droidsNear = ctx.droids.filter(d => d.alive && d.m.position.distanceTo(me) < 40).length;
      const cratesNear = ctx.crates.filter(c => c.position.distanceTo(me) < (this.mode === 'ship' ? 900 : 60)).length;
      lines.push(`AROUND YOU: ${police} police cruisers within 800 m, ${droidsNear} droids within 40 m, ${cratesNear} $ crates nearby, ${ctx.orbs.length} coin orbs floating around.`);
      const fresh = events.slice(this.seen).filter(e => !e.pos || e.pos.distanceTo(me) < 400 || /player|police|WASTED/.test(e.text));
      this.seen = events.length;
      if (fresh.length) lines.push('WHAT JUST HAPPENED (oldest first):\n' + fresh.slice(-10).map(e => `- ${Math.round(clock - e.t)}s ago: ${e.text}`).join('\n'));
      if (this.inbox.length) {
        lines.push('SAID TO YOU JUST NOW:\n' + this.inbox.map(m => `- ${m.from}: "${m.text}"`).join('\n'));
        this.inbox = [];
      }
      if (this.memory.length) lines.push('YOUR MEMORIES:\n' + this.memory.map(m => '- ' + m).join('\n'));
      lines.push(`WHAT YOU ARE DOING: ${this.action.type}${this.action.target ? ' ' + this.action.target : ''}.`);
      lines.push('Decide your next move.');
      return lines.join('\n');
    }

    whereAmI() {
      const me = this.worldPos();
      if (this.mode !== 'ship' || (Math.hypot(me.x, me.z) < 100 && Math.abs(me.y) < 40)) {
        let best = 'on the station deck', bd = 14;
        for (const [k, v] of Object.entries(PLACE_POS)) { const d = Math.hypot(v.x - me.x, v.z - me.z); if (d < bd) { bd = d; best = 'at the ' + k; } }
        return best;
      }
      let best = 'in open space', bd = 500;
      for (const b of world.beacons) { const d = b.pos.distanceTo(me); if (d < bd) { bd = d; best = 'near ' + b.name; } }
      if (me.distanceTo(world.field.center) < world.field.radius) best = 'in the asteroid field';
      return best;
    }

    // ---------- deciding ----------
    async think() {
      this.pending = true;
      const obs = this.observe();
      let d = await brain.decide(this.p.id, obs);
      if (!this.alive) { this.pending = false; return; }
      const fromBrain = !!d;
      if (!d) d = this.offlineDecide(obs);
      this.apply(d);
      this.pending = false;
      this.decideT = fromBrain ? rnd(4, 8) : rnd(5, 9);
    }

    offlineDecide() {
      const p = this.p, life = this.wallet.balance;
      const pp = ctx.playerPos(), me = this.worldPos(), dP = me.distanceTo(pp);
      const d = { say: '', action: 'wander', target: '', amount: 0, mood: this.mood, attitude_change: 0, remember: '' };
      const lines = p.lines;
      const recentHit = clock - this.lastAttackT < 8;
      if (this.pendingReply) {
        d.say = pick(lines.reply);
        this.pendingReply = false;
        d.action = 'approach'; d.target = 'player';
        return d;
      }
      if (recentHit && this.lastAttacker) {
        const fight = Math.random() < p.brave;
        d.action = fight ? 'attack' : 'flee';
        d.target = this.lastAttacker;
        d.mood = fight ? 'angry' : 'scared';
        if (Math.random() < 0.6) d.say = pick(lines.hurt);
        if (this.lastAttacker === 'player') d.attitude_change = -2;
        return d;
      }
      if (p.id === 'rourke' && ctx.S.wanted >= 3 && ctx.S.mode !== 'dead') {
        d.action = 'attack'; d.target = 'player'; d.mood = 'calm';
        if (Math.random() < 0.4) d.say = 'Your bounty just made my night, pal.';
        return d;
      }
      if (life < 120) {
        d.action = p.crooked > 0.5 ? 'rob_droid' : 'collect_crates';
        d.mood = 'scared';
        if (Math.random() < 0.4) d.say = pick(lines.low);
        return d;
      }
      if (dP < 15 && !this.greeted && ctx.S.mode === 'foot') {
        this.greeted = true;
        d.say = pick(lines.greet);
        d.action = 'approach'; d.target = 'player';
        return d;
      }
      if (p.id === 'nyx' && ctx.wallet.balance < 80 && dP < 40 && this.wallet.balance > 200) {
        d.action = 'give_nvc'; d.target = 'player'; d.amount = 50;
        d.say = 'Take this, wanderer. Your clock is too quiet.';
        return d;
      }
      const choice = pickW(p.habits);
      const [act, tgt = ''] = choice.split(':');
      d.action = act;
      d.target = tgt;
      if (Math.random() < 0.15) d.say = pick(lines.idle);
      return d;
    }

    apply(d) {
      if (!d || typeof d !== 'object') return;
      if (MOODS.includes(d.mood)) this.mood = d.mood;
      this.attitude = clamp(this.attitude + clamp(Math.round(+d.attitude_change || 0), -3, 3), -10, 10);
      this.remember(d.remember);
      if (d.say) this.say(d.say);
      const type = ACTIONS.includes(d.action) ? d.action : 'wander';
      this.setAction(type, String(d.target || ''), Math.max(0, Math.round(+d.amount || 0)));
    }

    setAction(type, target, amount = 0) {
      this.action = { type, target, amount, t: 0, point: null };
      this.robT = 0;
    }

    // ---------- events from the world ----------
    hearFromPlayer(text) {
      this.inbox.push({ from: ctx.playerName() || 'the player', text });
      this.pendingReply = true;
      this.decideT = Math.min(this.decideT, 0.3);
    }

    onAttacked(byName, amount) {
      this.lastAttacker = byName;
      this.lastAttackT = clock;
      if (byName === 'player') this.attitude = clamp(this.attitude - (amount > 20 ? 2 : 1), -10, 10);
      else this.opinions[byName] = (this.opinions[byName] || 0) - 1;
      if (this.decideT > 1.5) this.decideT = 1.5;
    }

    hurt(dmg, byName) {
      if (!this.alive || this.mode === 'dead') return;
      this.wallet.drain(dmg * 1.5, 'damage', true);
      this.onAttacked(byName, dmg);
      fx.sparks(this.worldPos(), 8, 10);
      if (this.wallet.empty) this.die(byName === 'player' ? 'shot down by the player' : `shot down by ${byName}`, byName);
    }

    // ---------- body ----------
    takeShip(s) {
      if (s.pilot === 'npc' && !s.parked) emit(`${this.name} hijacked a ship in flight`, s.pos);
      if (s.pilot === 'npc' || s.owner !== 'ai') this.addWanted(s.team === 'police' ? 2 : s.pilot === 'npc' ? 1 : 0);
      if (s.pilot === 'npc' && Math.hypot(s.pos.x, s.pos.z) < 90) ctx.spawnFleeingDroid(s.pos);
      s.pilot = 'ai';
      s.parked = false;
      s.owner = 'ai';
      s.aiPilot = this;
      this.ship = s;
      this.mode = 'ship';
      this.avatar.visible = false;
      emit(`${this.name} took a ship from ${s.pad ? 'the pads' : 'nearby'}`, s.pos);
    }

    leaveShip() {
      const s = this.ship;
      if (!s) return;
      s.pilot = null;
      s.aiPilot = null;
      s.ctrl.throttle = 0;
      this.pos.copy(s.pos).addScaledVector(s.right(new V3()), s.radius + 2).setY(0);
      this.ship = null;
      this.mode = 'foot';
      this.avatar.visible = true;
    }

    // Our ship was blown up: survive in the suit if we can afford it, get towed home.
    wrecked(killer) {
      this.ship = null;
      this.mode = 'foot';
      this.wallet.drain(150, 'ship destroyed', true);
      this.onAttacked(killer || 'someone', 50);
      emit(`${this.name}'s ship was destroyed${killer ? ' by ' + nameOf(killer) : ''}`);
      if (this.wallet.empty) { this.mode = 'foot'; this.die('blown up with an empty wallet', killer); return; }
      this.pos.copy(PLACE_POS.pads).add(new V3(rnd(-6, 6), 0, rnd(-6, 6)));
      this.avatar.visible = true;
      this.remember(`My ship got blown up${killer ? ' by ' + nameOf(killer) : ''}. Lost 150 NVC.`);
    }

    addWanted(n) {
      if (n <= 0) return;
      this.wanted = clamp(this.wanted + n, 0, 5);
      this.wantedT = 0;
      emit(`${this.name} is now wanted by the police (${this.wanted} stars)`);
    }

    die(reason, killer) {
      if (!this.alive || this.mode === 'dead') return;
      const at = this.worldPos();
      if (this.ship) { const s = this.ship; this.leaveShip(); ctx.damageShip(s, 999, killer === 'player' ? 'player' : 'ai'); }
      this.mode = 'dead';
      this.deadT = 40;
      this.avatar.visible = false;
      this.bubble.s.visible = false;
      this.tag.s.visible = false;
      fx.explosion(at, 2, null, false);
      sound.boom(0.5, at);
      ctx.dropCoins(at, 60, null); // a little life bounty
      pushFeed(this.name, this.p.color, `WASTED — ${reason}`);
      emit(`${this.name} got WASTED (${reason})`, at);
      this.remember(`I died: ${reason}. Woke up in the Med Bay owing 150 NVC.`);
      for (const o of list) if (o !== this && killer === o.name) o.remember(`I killed ${this.name}.`);
    }

    respawn() {
      this.mode = 'foot';
      this.pos.copy(PLACE_POS.med_bay).add(new V3(rnd(-2, 2), 0, rnd(-2, 2)));
      this.vel.set(0, 0, 0);
      this.wanted = 0;
      this.wallet.earn(150, 'emergency life loan');
      this.avatar.visible = true;
      this.tag.s.visible = true;
      this.setAction('idle', '');
      this.decideT = 1;
      emit(`${this.name} came back from the Med Bay`);
    }

    // ---------- doing ----------
    walkTo(target, dt, speed = 4.5, stopAt = 1) {
      const p = this.pos;
      const dx = target.x - p.x, dz = target.z - p.z, dist = Math.hypot(dx, dz);
      const moving = dist > stopAt;
      const want = moving ? speed : 0;
      const k = 1 - Math.exp(-8 * dt);
      this.vel.x += ((moving ? dx / dist : 0) * want - this.vel.x) * k;
      this.vel.z += ((moving ? dz / dist : 0) * want - this.vel.z) * k;
      p.x += this.vel.x * dt;
      p.z += this.vel.z * dt;
      p.y = 0;
      for (const b of world.buildings) ctx.pushOutXZ(p, b, 0.45, 1.8);
      const r = Math.hypot(p.x, p.z);
      if (r > ctx.DECK_R - 2) { p.x *= (ctx.DECK_R - 2) / r; p.z *= (ctx.DECK_R - 2) / r; }
      if (moving) this.yaw = Math.atan2(-dx, -dz);
      return dist <= stopAt;
    }

    face(target) { this.yaw = Math.atan2(-(target.x - this.pos.x), -(target.z - this.pos.z)); }

    resolveTarget(name) {
      if (!name) return null;
      const n = name.toLowerCase();
      if (n === 'player' || n === 'the player' || n === (ctx.playerName() || '').toLowerCase()) {
        return ctx.S.mode === 'dead' ? null : { kind: 'player', name: 'player', pos: () => ctx.playerPos(), vel: () => ctx.playerVel(), onFoot: () => ctx.S.mode === 'foot' };
      }
      const o = list.find(o => o !== this && o.alive && o.mode !== 'dead' && (o.name.toLowerCase().includes(n) || n.includes(o.p.id)));
      if (o) return { kind: 'ai', ai: o, name: o.name, pos: () => o.worldPos(), vel: () => o.worldVel(), onFoot: () => o.mode === 'foot' };
      const me = this.worldPos();
      const nearest = (arr, posOf) => arr.reduce((b, x) => (!b || posOf(x).distanceTo(me) < posOf(b).distanceTo(me) ? x : b), null);
      if (n.includes('police')) {
        const s = nearest(ctx.ships().filter(s => s.alive && s.team === 'police'), s => s.pos);
        if (s) return { kind: 'ship', ship: s, name: 'police', pos: () => s.pos, vel: () => s.vel, onFoot: () => false };
      }
      if (n.includes('civilian') || n.includes('ship')) {
        const s = nearest(ctx.ships().filter(s => s.alive && s.team === 'civ' && s.pilot === 'npc'), s => s.pos);
        if (s) return { kind: 'ship', ship: s, name: 'civilian', pos: () => s.pos, vel: () => s.vel, onFoot: () => false };
      }
      if (n.includes('droid')) {
        const d = nearest(ctx.droids.filter(d => d.alive), d => d.m.position);
        if (d) return { kind: 'droid', droid: d, name: 'droid', pos: () => d.m.position.clone().setY(0.7), vel: () => new V3(), onFoot: () => true };
      }
      return null;
    }

    // Ensure we have a ship (or are getting one). Returns true when flying.
    needShip(dt) {
      if (this.mode === 'ship') return true;
      const free = ctx.ships().filter(s => s.alive && s.pilot !== 'player' && s.pilot !== 'ai' && Math.hypot(s.pos.x, s.pos.z) < 95 && s.pos.y < 6
        && (s.owner !== 'player' || this.attitude < -3));
      if (!free.length) { this.walkTo(PLACE_POS.pads, dt); return false; }
      const s = free.reduce((b, x) => (x.pos.distanceTo(this.pos) < b.pos.distanceTo(this.pos) ? x : b));
      if (this.walkTo(s.pos, dt, 5.5, 6)) this.takeShip(s);
      return false;
    }

    flyTo(target, dt, throttle = 0.7, standoff = 0) {
      const s = this.ship;
      const d = s.pos.distanceTo(target);
      const thr = standoff && d < standoff ? 0.05 : d < 150 ? throttle * 0.5 : throttle;
      ctx.steer(s, ctx.avoidStation(s, target), thr, d > 1200);
      return d;
    }

    shootAt(t, dt) {
      this.fireCd -= dt;
      if (this.fireCd > 0) return;
      const tp = t.pos(), me = this.worldPos();
      const d = tp.distanceTo(me);
      if (this.mode === 'ship') {
        const dir = tp.clone().addScaledVector(t.vel(), d / 500).sub(me).normalize();
        if (d < 600 && this.ship.fwd(new V3()).dot(dir) > 0.96) {
          ctx.shipFire(this.ship, 'ai', 9, 520, dir);
          this.fireCd = 0.45;
        }
      } else if (d < 45) {
        const origin = this.pos.clone().add(new V3(0, 1.45, 0));
        const dir = tp.clone().sub(origin).normalize().add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.035)).normalize();
        const dmg = { pulse: 8, scatter: 6, arc: 10, rail: 18 }[this.weapon] || 9;
        const n = this.weapon === 'scatter' ? 4 : 1;
        for (let i = 0; i < n; i++) ctx.spawnLaser(origin, n > 1 ? dir.clone().add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.05)).normalize() : dir, 380, 'ai', dmg, this, null, 1.4, 'ai');
        sound.zap(1.2, origin, 0.8);
        this.fireCd = this.weapon === 'rail' ? 1.1 : this.weapon === 'scatter' ? 0.8 : 0.45;
        this.aimT = 1;
      }
    }

    update(dt) {
      if (this.mode === 'dead') {
        if ((this.deadT -= dt) <= 0) this.respawn();
        return;
      }
      // life ticks away for everyone
      this.wallet.tick(dt, 1);
      if (this.wallet.empty) { this.die('their NVC ran out', null); return; }
      if (this.wanted && (this.wantedT += dt) > 45) { this.wanted--; this.wantedT = 0; }
      this.decideT -= dt;
      if (this.decideT <= 0 && !this.pending) this.think();

      const a = this.action;
      a.t += dt;
      const me = this.worldPos();
      const pp = ctx.playerPos();
      const t = this.resolveTarget(a.target);
      this.aimT = (this.aimT || 0) - dt;

      switch (a.type) {
        case 'idle':
          if (this.mode === 'ship') this.flyTo(me.clone().add(this.ship.fwd(new V3()).multiplyScalar(30)), dt, 0.05);
          else if (pp.distanceTo(me) < 10 && ctx.S.mode === 'foot') this.face(pp);
          break;
        case 'wander':
          if (this.mode === 'ship') { a.type = 'return_to_station'; break; }
          if (!a.point || this.walkTo(a.point, dt, 2.2, 0.8)) a.point = ctx.randomDeckPoint();
          break;
        case 'go_to': {
          const dest = PLACE_POS[a.target] || PLACE_POS.plaza;
          if (this.mode === 'ship') {
            if (a.target === 'pay_n_spray') { this.flyTo(new V3(dest.x, this.ship.hover, dest.z), dt, 0.4); if (world.spray.containsPoint(this.ship.pos) && this.wanted && this.wallet.spend(100, "Pay 'n' Spray")) { this.wanted = 0; emit(`${this.name} got a Pay 'n' Spray and lost the cops`); a.type = 'idle'; } }
            else a.type = 'return_to_station';
          } else if (this.walkTo(dest, dt, 4.2, 1.5) && a.target === 'pay_n_spray') a.type = 'idle';
          break;
        }
        case 'approach':
        case 'follow':
        case 'chat_with': {
          if (!t) { a.type = 'idle'; break; }
          const tp = t.pos();
          if (this.mode === 'foot') {
            if (t.onFoot() && Math.hypot(tp.x, tp.z) < ctx.DECK_R + 2 && tp.y < 6) {
              if (this.walkTo(tp, dt, a.type === 'follow' ? 5.5 : 4, 3.2)) this.face(tp);
            } else if (a.type === 'follow' && this.needShip(dt)) { /* boarded */ }
          } else {
            this.flyTo(tp, dt, 0.8, t.onFoot() ? 60 : 45);
          }
          break;
        }
        case 'attack': {
          if (!t) { a.type = 'idle'; break; }
          const tp = t.pos();
          if (this.mode === 'foot') {
            if (!t.onFoot()) { this.needShip(dt); break; }
            const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
            if (d > 25) this.walkTo(tp, dt, 5.5, 20); else { this.vel.multiplyScalar(0.8); this.face(tp); }
          } else this.flyTo(tp.clone().addScaledVector(t.vel(), 0.6), dt, 0.9, t.onFoot() ? 80 : 0);
          this.shootAt(t, dt);
          if (t.kind === 'ship' && t.ship.team === 'police' && a.t < dt * 2) this.addWanted(2);
          break;
        }
        case 'flee': {
          const from = t ? t.pos() : pp;
          const away = me.clone().sub(from).setY(0).normalize();
          if (this.mode === 'foot') this.walkTo(this.pos.clone().addScaledVector(away, 10), dt, 6.5, 0.5);
          else this.flyTo(me.clone().addScaledVector(me.clone().sub(from).normalize(), 400), dt, 1);
          if (a.t > 12) a.type = 'idle';
          break;
        }
        case 'steal_ship':
          if (this.needShip(dt)) a.type = 'fly_to', a.target = a.target || pick(world.beacons).name;
          break;
        case 'fly_to': {
          const dest = spaceDest(a.target) || spaceDest('asteroid_field');
          if (!this.needShip(dt)) break;
          if (this.flyTo(dest, dt, 0.85, 70) < 90 && a.t > 5) { emit(`${this.name} arrived at ${a.target || 'the asteroid field'}`, dest); a.type = 'collect_crates'; }
          break;
        }
        case 'return_to_station': {
          if (this.mode === 'foot') { a.type = 'wander'; break; }
          const pad = world.pads.find(p => ctx.padFree(p)) || world.pads[1];
          const s = this.ship;
          const xz = Math.hypot(s.pos.x - pad.pos.x, s.pos.z - pad.pos.z);
          const goal = xz > 25 ? pad.pos.clone().setY(40) : pad.pos.clone().setY(s.hover);
          ctx.steer(s, goal, xz > 25 ? 0.8 : 0.15, false);
          if (xz < 25) { s.ctrl.lift = -0.8; s.ctrl.pitch *= 0.3; }
          if (s.landed && s.vel.length() < 6) { this.leaveShip(); a.type = 'wander'; }
          break;
        }
        case 'rob_droid': {
          if (this.mode === 'ship') { a.type = 'return_to_station'; break; }
          const dr = a.droid?.alive ? a.droid : ctx.droids.filter(d => d.alive && d.coins > 0).reduce((b, d) => (!b || d.m.position.distanceTo(this.pos) < b.m.position.distanceTo(this.pos) ? d : b), null);
          if (!dr) { a.type = 'collect_crates'; break; }
          a.droid = dr;
          if (this.walkTo(dr.m.position, dt, 5, 5)) {
            this.face(dr.m.position);
            if (this.robT === 0) { this.addWanted(1); emit(`${this.name} is siphoning NVC from a droid`, this.pos); }
            this.robT += dt;
            const k = Math.min(dr.coins, 6 * dt);
            dr.coins -= k;
            this.wallet.earn(k, 'siphon');
            dr.flee = 3;
            if (Math.random() < 0.5) fx.add.emit(dr.m.position.clone().setY(1), this.pos.clone().setY(1.3).sub(dr.m.position.clone().setY(1)).multiplyScalar(2), 0.45, 0.3, 0.1, new THREE.Color(0x9dffc8), new THREE.Color(0x22ff88), 1, 0);
            if (dr.coins <= 0.5) { ctx.damageDroid(dr, 999, 'ai'); a.droid = null; }
          }
          break;
        }
        case 'collect_crates': {
          const onDeck = this.mode === 'foot';
          const pool = ctx.crates.filter(c => onDeck ? Math.hypot(c.position.x, c.position.z) < ctx.DECK_R && c.position.y < 4 : true);
          if (!pool.length) { if (onDeck) { this.needShip(dt); } break; }
          const c = pool.reduce((b, x) => (x.position.distanceTo(me) < b.position.distanceTo(me) ? x : b));
          if (onDeck) this.walkTo(c.position, dt, 5, 1);
          else this.flyTo(c.position, dt, 0.8);
          if (c.position.distanceTo(me) < (onDeck ? 2.5 : 12)) {
            const amt = Math.round(rnd(5, 20)) * 10;
            this.wallet.earn(amt, 'crate');
            ctx.placeCrate(c);
            sound.coin();
          }
          break;
        }
        case 'buy_weapon': {
          const prices = { scatter: 350, arc: 500, rail: 650, siphon: 800, swarm: 900, mortar: 1000, gravity: 1500 };
          const id = a.target in prices ? a.target : null;
          if (!id || this.mode === 'ship') { a.type = this.mode === 'ship' ? 'return_to_station' : 'idle'; break; }
          if (this.walkTo(PLACE_POS.arms_lab, dt, 4.5, 1.5)) {
            if (this.wallet.spend(prices[id], 'buy ' + id)) { this.weapon = ['siphon', 'swarm', 'mortar', 'gravity'].includes(id) ? 'rail' : id; this.setGun(id); emit(`${this.name} bought a ${id} at the Arms Lab`, this.pos); }
            a.type = 'idle';
          }
          break;
        }
        case 'give_nvc': {
          if (!t) { a.type = 'idle'; break; }
          const tp = t.pos();
          const close = this.mode === 'foot' ? (t.onFoot() ? this.walkTo(tp, dt, 4.5, 3) : false) : this.flyTo(tp, dt, 0.7, 40) < 45;
          if (close) {
            const amount = clamp(a.amount || 25, 1, Math.floor(this.wallet.balance * 0.4));
            if (amount > 0 && this.wallet.spend(amount, 'gift')) {
              if (t.kind === 'player') { ctx.wallet.earn(amount, 'gift from ' + this.name); ctx.message(`${this.name} gave you ${amount} NVC`); }
              else if (t.kind === 'ai') t.ai.wallet.earn(amount, 'gift from ' + this.name);
              emit(`${this.name} gave ${amount} NVC to ${nameOf(t.name)}`, me);
              fx.sparks(tp, 12, 8, new THREE.Color(0x7dffb0));
              sound.coin();
            }
            a.type = 'idle';
          }
          break;
        }
        case 'rob_player': {
          if (ctx.S.mode !== 'foot' || this.mode !== 'foot') { a.type = 'approach'; a.target = 'player'; break; }
          if (this.walkTo(pp, dt, 5.5, 4.5)) {
            this.face(pp);
            if (this.robT === 0) { ctx.message(`${this.name} is siphoning your NVC! Shoot or run!`, 3); this.attitude = Math.min(this.attitude, 0); }
            this.robT += dt;
            const k = Math.min(ctx.wallet.balance, 5 * dt);
            ctx.wallet.drain(k, 'robbed by ' + this.name);
            this.wallet.earn(k, 'siphon');
            if (Math.random() < 0.6) fx.add.emit(pp.clone(), this.pos.clone().setY(1.3).sub(pp).multiplyScalar(2), 0.45, 0.35, 0.1, new THREE.Color(0xff9db0), new THREE.Color(0x22ff88), 1, 0);
            if (this.robT > 6) { emit(`${this.name} robbed the player`, me); a.type = 'flee'; a.target = 'player'; a.t = 0; }
          }
          break;
        }
      }

      // grab coin orbs within reach
      for (const o of ctx.orbs) {
        if (o.life > 0 && o.m.position.distanceTo(me) < (this.mode === 'ship' ? 10 : 1.8)) { this.wallet.earn(o.value, 'pickup'); o.life = 0; }
      }
      this.updateVisuals(dt);
    }

    updateVisuals(dt) {
      if (this.mode === 'foot') {
        this.avatar.position.copy(this.pos);
        let diff = this.yaw - this.avatar.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.avatar.rotation.y += diff * (1 - Math.exp(-10 * dt));
        ctx.animateAvatar(this.avatar, dt, Math.hypot(this.vel.x, this.vel.z), false, this.aimT > 0);
      }
      const head = this.worldPos().add(new V3(0, this.mode === 'ship' ? this.ship.radius + 2 : 1.2, 0));
      this.tag.s.position.copy(head);
      this.tag.s.scale.set(2.2, 0.55, 1).multiplyScalar(this.mode === 'ship' ? 4 : 1);
      this.bubble.s.position.copy(head).add(new V3(0, this.mode === 'ship' ? 5 : 0.9, 0));
      this.bubble.s.scale.set(4.4, 1.1, 1).multiplyScalar(this.mode === 'ship' ? 4 : 1);
      if (this.bubbleT > 0 && (this.bubbleT -= dt) <= 0) this.bubble.s.visible = false;
      if ((this.tagT -= dt) <= 0) { this.tagT = 0.5; this.drawTag(); }
    }
  }

  PERSONAS.forEach((p, i) => list.push(new AIPlayer(p, i)));

  // ---------- API used by the game ----------
  const api = {
    list,
    feed,
    brain,
    emit,
    get clock() { return clock; },
    update(dt) {
      clock += dt;
      for (const ai of list) ai.update(dt);
      while (feed.length && clock - feed[0].t > 14) feed.shift();
    },
    // The player said something (typed or spoken). Nearby characters hear it; names reach anyone.
    playerSays(text) {
      text = String(text).trim().slice(0, 200);
      if (!text) return;
      const name = ctx.playerName() || 'You';
      pushFeed(name, 0xffffff, text);
      const pp = ctx.playerPos();
      const low = text.toLowerCase();
      const named = list.filter(a => a.mode !== 'dead' && (low.includes(a.p.id) || low.includes(a.name.toLowerCase().split(' ').pop())));
      const near = list.filter(a => a.mode !== 'dead' && a.worldPos().distanceTo(pp) < 25);
      const hearers = new Set(named.length ? named : near);
      if (!hearers.size) {
        const closest = list.filter(a => a.mode !== 'dead').reduce((b, a) => (!b || a.worldPos().distanceTo(pp) < b.worldPos().distanceTo(pp) ? a : b), null);
        if (closest && closest.worldPos().distanceTo(pp) < 120) hearers.add(closest);
      }
      for (const a of hearers) a.hearFromPlayer(text);
      emit(`the player said: "${text}"`, pp);
      return hearers.size;
    },
    giveTo(amount) {
      const pp = ctx.playerPos();
      const a = list.filter(a => a.mode !== 'dead').reduce((b, a) => (!b || a.worldPos().distanceTo(pp) < b.worldPos().distanceTo(pp) ? a : b), null);
      if (!a || a.worldPos().distanceTo(pp) > 10) return null;
      if (!ctx.wallet.spend(amount, 'gift to ' + a.name)) return null;
      a.wallet.earn(amount, 'gift from the player');
      a.attitude = clamp(a.attitude + 2, -10, 10);
      a.inbox.push({ from: 'the player', text: `(hands you ${amount} NVC)` });
      a.pendingReply = true;
      a.decideT = Math.min(a.decideT, 0.3);
      emit(`the player gave ${a.name} ${amount} NVC`, pp);
      return a;
    },
    // Weapons/lasers: AI characters on foot are hittable targets.
    footTargets() { return list.filter(a => a.mode === 'foot'); },
    // A laser segment from prev->p: hit an AI on foot? (owner is never hit by its own shot)
    laserHit(prev, p, segSphere, dmg, byName, owner) {
      for (const a of list) {
        if (a.mode !== 'foot' || a === owner) continue;
        if (segSphere(prev, p, a.worldPos(a.center), 0.9)) { a.hurt(dmg, byName); return a; }
      }
      return null;
    },
    nearestWanted(pos, range) {
      let best = null, bd = range;
      for (const a of list) {
        if (a.mode === 'dead' || !a.wanted) continue;
        const d = a.worldPos().distanceTo(pos);
        if (d < bd) { bd = d; best = a; }
      }
      return best;
    },
  };
  return api;
}
