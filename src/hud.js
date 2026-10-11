// GTA-style HUD drawn on a 2D canvas (DOM overlay on desktop, texture panel in VR).

const DISPLAY = 'Bungee, Impact, "Arial Black", sans-serif';
const BODY = 'Inter, system-ui, sans-serif';
const clamp01 = x => Math.max(0, Math.min(1, x));

function text(g, s, x, y, size, color, align = 'left', family = DISPLAY, weight = '') {
  g.font = `${weight} ${Math.round(size)}px ${family}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, size / 6);
  g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

function star(g, x, y, r, fill) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#000';
  g.stroke();
}

function bar(g, x, y, w, h, frac, color) {
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x, y, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w * clamp01(frac), h);
}

const fmtTime = t => {
  t = Math.max(0, Math.ceil(t));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function drawHUD(g, w, h, d) {
  g.clearRect(0, 0, w, h);
  const u = Math.min(w / 1280, h / 720);
  const P = 28 * u;

  if (d.dmg > 0) {
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    gr.addColorStop(0, 'rgba(255,0,0,0)');
    gr.addColorStop(1, `rgba(255,0,40,${Math.min(0.6, d.dmg)})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }

  // Life balance (NVC) + wanted stars
  const low = d.lifeSecs < 60;
  const balCol = low ? (Math.floor(d.time * 4) % 2 ? '#ff3355' : '#ff8a8a') : '#7dffb0';
  text(g, '◈ ' + d.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), w - P, P + 22 * u, 42 * u, balCol, 'right');
  const mins = Math.floor(d.lifeSecs / 60), secs = Math.floor(d.lifeSecs % 60);
  text(g, `NVC  −${d.drainRate.toFixed(1)}/s  ·  ${mins}:${String(secs).padStart(2, '0')} of life left`, w - P, P + 56 * u, 15 * u, low ? '#ff8a8a' : '#cbd5e1', 'right', BODY, 'bold');
  d.deltas.forEach((dl, i) => {
    g.globalAlpha = Math.max(0, 1 - dl.age / 1.6);
    text(g, dl.text, w - P - 260 * u, P + 22 * u + i * 22 * u - dl.age * 14 * u, 20 * u, dl.color, 'right', DISPLAY);
    g.globalAlpha = 1;
  });
  for (let i = 0; i < 5; i++) {
    const on = i < d.wanted;
    const blink = on && d.evading && Math.floor(d.time * 5) % 2 === 0;
    star(g, w - P - 20 * u - i * 42 * u, P + 92 * u, 17 * u, on ? (blink ? '#555' : '#fff') : 'rgba(255,255,255,0.12)');
  }

  // Radar
  const R = 92 * u, cx = P + R, cy = h - P - R - 34 * u;
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fillStyle = 'rgba(8,12,24,0.72)';
  g.fill();
  g.lineWidth = 4 * u;
  g.strokeStyle = d.wanted > 0 ? (Math.floor(d.time * 4) % 2 ? '#ff2244' : '#2266ff') : 'rgba(255,255,255,0.5)';
  g.stroke();
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.1)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
  g.stroke();
  const ch = Math.cos(d.radar.heading), sh = Math.sin(d.radar.heading), sc = R / d.radar.range;
  for (const b of d.radar.blips) {
    let x = (b.dx * ch - b.dz * sh) * sc;
    let y = (b.dx * sh + b.dz * ch) * sc;
    const L = Math.hypot(x, y), lim = R - 7 * u;
    if (L > lim) {
      if (!b.edge) continue;
      x *= lim / L;
      y *= lim / L;
    }
    const s = b.size * u;
    g.fillStyle = b.color;
    if (b.shape === 'sq') g.fillRect(cx + x - s, cy + y - s, s * 2, s * 2);
    else { g.beginPath(); g.arc(cx + x, cy + y, s, 0, Math.PI * 2); g.fill(); }
    if (Math.abs(b.dy) > 40 && b.size >= 4) {
      const dir = b.dy > 0 ? -1 : 1;
      g.beginPath();
      g.moveTo(cx + x - s, cy + y + dir * s * 1.6);
      g.lineTo(cx + x + s, cy + y + dir * s * 1.6);
      g.lineTo(cx + x, cy + y + dir * s * 2.8);
      g.fill();
    }
  }
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(cx, cy - 9 * u);
  g.lineTo(cx + 6 * u, cy + 7 * u);
  g.lineTo(cx - 6 * u, cy + 7 * u);
  g.closePath();
  g.fill();
  g.restore();

  // Hull bar under radar (in a ship). On foot, your NVC balance is your health.
  const by = cy + R + 14 * u, bw = R * 2;
  if (d.mode === 'ship') {
    bar(g, P, by, bw, 10 * u, d.hull, d.hull < 0.3 ? '#ff4d4d' : '#38bdf8');
    text(g, 'HULL', P + 4 * u, by + 26 * u, 14 * u, '#cbd5e1', 'left', BODY, 'bold');
  } else {
    text(g, 'LIFE = NVC', P + 4 * u, by + 10 * u, 14 * u, '#7dffb0', 'left', BODY, 'bold');
  }

  // Weapon panel (bottom-right)
  const wx = w - P, wy = h - P - (d.mode === 'ship' ? 150 : 40) * u;
  if (d.weapon) {
    text(g, d.weapon.name.toUpperCase(), wx, wy - 52 * u, 24 * u, d.weapon.css, 'right');
    text(g, d.weapon.cost ? `${d.weapon.cost} NVC / shot` : d.weapon.id === 'siphon' ? 'steals NVC' : 'free', wx, wy - 26 * u, 14 * u, '#cbd5e1', 'right', BODY, 'bold');
    // owned slots
    d.slots.forEach((sl, i) => {
      const x = wx - (d.slots.length - 1 - i) * 22 * u - 8 * u, y = wy - 82 * u;
      g.fillStyle = sl.owned ? sl.css : 'rgba(255,255,255,0.1)';
      g.globalAlpha = sl.current ? 1 : sl.owned ? 0.55 : 1;
      g.fillRect(x - 8 * u, y - 8 * u, 16 * u, 16 * u);
      g.globalAlpha = 1;
      if (sl.current) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x - 10 * u, y - 10 * u, 20 * u, 20 * u); }
      if (!d.vr) text(g, String(i + 1), x, y + 1 * u, 10 * u, '#000', 'center', BODY, 'bold');
    });
    bar(g, wx - 200 * u, wy - 4 * u, 200 * u, 7 * u, d.heat, d.overheat ? '#ff3355' : d.heat > 0.7 ? '#ffb000' : '#e2e8f0');
    if (d.overheat) text(g, 'OVERHEAT', wx - 200 * u, wy - 16 * u, 13 * u, '#ff3355', 'left', BODY, 'bold');
  }

  // Speedometer + missiles
  if (d.mode === 'ship') {
    text(g, String(d.speed), w - P - 70 * u, h - P - 30 * u, 54 * u, '#fff', 'right');
    text(g, 'm/s', w - P, h - P - 24 * u, 20 * u, '#cbd5e1', 'right', BODY, 'bold');
    if (d.boost) text(g, 'BOOST', w - P, h - P - 78 * u, 22 * u, '#ff7ad9', 'right');
    text(g, `MSL ${d.missiles}   FLR ${d.flares}`, w - P, h - P - 104 * u, 15 * u, '#fff', 'right', BODY, 'bold');
    if (d.lock) {
      const locked = d.lock === 2;
      text(g, locked ? '◆ LOCKED' : '◇ LOCKING', w - P - 140 * u, h - P - 104 * u, 15 * u, locked ? '#ff3355' : '#ffd23f', 'right', BODY, 'bold');
    }
  }
  if (d.warning && Math.floor(d.time * 6) % 2 === 0) {
    text(g, '⚠ MISSILE INCOMING', w / 2, h * 0.24, 34 * u, '#ff3355', 'center');
    text(g, d.vr ? 'Left stick click: flares' : 'X: flares', w / 2, h * 0.24 + 32 * u, 18 * u, '#fff', 'center', BODY, 'bold');
  }

  // Mission banner
  let topY = P + 16 * u;
  if (d.mission) {
    text(g, d.mission.title, w / 2, topY, 22 * u, '#ffd23f', 'center', BODY, 'bold');
    const parts = [];
    if (d.mission.timer != null) parts.push(fmtTime(d.mission.timer));
    if (d.mission.dist != null) parts.push(`${Math.round(d.mission.dist)} m`);
    if (d.mission.extra) parts.push(d.mission.extra);
    text(g, parts.join('   ·   '), w / 2, topY + 32 * u, 26 * u, d.mission.timer < 10 ? '#ff4d4d' : '#fff', 'center');
    topY += 72 * u;
  }
  if (d.radio) text(g, '♪ ' + d.radio, w / 2, topY + 6 * u, 24 * u, '#ff7ad9', 'center');

  // Conversation / kill feed (left, above the radar)
  if (d.feed && d.feed.length) {
    let fy = cy - R - 24 * u;
    for (let i = d.feed.length - 1; i >= 0 && fy > h * 0.35; i--) {
      const f = d.feed[i];
      g.globalAlpha = Math.max(0, Math.min(1, (14 - f.age) / 3));
      g.font = `bold ${Math.round(16 * u)}px ${BODY}`;
      const nameW = g.measureText(f.name + ': ').width;
      text(g, f.name + ':', P, fy, 16 * u, f.css, 'left', BODY, 'bold');
      const maxW = Math.min(w * 0.42, 520 * u) - nameW;
      let line = '', lines = [];
      for (const word of f.text.split(' ')) {
        const t = line ? line + ' ' + word : word;
        g.font = `${Math.round(16 * u)}px ${BODY}`;
        if (g.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t;
      }
      lines.push(line);
      lines.forEach((l, k) => text(g, l, P + nameW + 6 * u, fy + k * 20 * u, 16 * u, '#fff', 'left', BODY, ''));
      fy -= (lines.length * 20 + 8) * u;
      g.globalAlpha = 1;
    }
  }
  if (d.brain) text(g, d.brain === 'online' ? '● Claude brains online' : d.brain === 'offline' ? '○ characters on offline personalities' : '◌ connecting brains…', P, h - 10 * u, 11 * u, d.brain === 'online' ? '#7dffb0' : '#94a3b8', 'left', BODY, 'bold');

  // Context prompt
  if (d.prompt) {
    g.font = `bold ${Math.round(22 * u)}px ${BODY}`;
    const tw = g.measureText(d.prompt).width + 32 * u;
    const py = h - P - 70 * u;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(w / 2 - tw / 2, py - 20 * u, tw, 40 * u);
    text(g, d.prompt, w / 2, py, 22 * u, '#fff', 'center', BODY, 'bold');
  }
  if (d.msg) text(g, d.msg, w / 2, h * 0.66, 26 * u, '#fff', 'center', BODY, 'bold');

  // Big center text (WASTED, MISSION PASSED...)
  if (d.big) {
    text(g, d.big, w / 2, h * 0.42, 84 * u, d.bigColor, 'center');
    if (d.bigSub) text(g, d.bigSub, w / 2, h * 0.42 + 64 * u, 28 * u, '#fff', 'center', BODY, 'bold');
  }

  if (d.hitT > 0) {
    const r = 18 * u, k = 6 * u;
    g.strokeStyle = d.kill ? `rgba(255,60,80,${d.hitT * 4})` : `rgba(255,255,255,${d.hitT * 4})`;
    g.lineWidth = 3 * u;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.beginPath();
      g.moveTo(w / 2 + sx * k, h / 2 + sy * k);
      g.lineTo(w / 2 + sx * r, h / 2 + sy * r);
      g.stroke();
    }
  }
  if (d.crosshair) {
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(w / 2, h / 2, 10 * u, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#fff';
    g.fillRect(w / 2 - 1.5, h / 2 - 1.5, 3, 3);
  }
}
