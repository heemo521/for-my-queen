// Builds the static universe: sky, sun, planets, Nova Santos station, asteroid field, outposts.
import * as THREE from 'three';

export const DECK_R = 90;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const V3 = THREE.Vector3;

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const css = hex => '#' + hex.toString(16).padStart(6, '0');

function signTexture(text, color) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#07080f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.font = 'bold 62px Bungee, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 4, w - 40);
  });
}

function planetTexture(hue, banded) {
  return canvasTexture(1024, 512, (g, w, h) => {
    const ph = Math.random() * 10;
    for (let y = 0; y < h; y++) {
      const n = Math.sin(y * 0.05 + ph) * 0.5 + Math.sin(y * 0.013 + ph * 2) * 0.35 + Math.sin(y * 0.21) * 0.15;
      const l = banded ? 45 + n * 18 : 30 + n * 6;
      g.fillStyle = `hsl(${hue + n * 18},${banded ? 55 : 45}%,${l}%)`;
      g.fillRect(0, y, w, 1);
    }
    const blobs = banded ? 70 : 500;
    for (let i = 0; i < blobs; i++) {
      const r = banded ? rand(5, 40) : rand(4, 60);
      g.fillStyle = banded
        ? `hsla(${hue + rand(-25, 25)},60%,${rand(35, 70)}%,0.35)`
        : `hsla(${hue + rand(-60, 40)},${rand(30, 60)}%,${rand(25, 55)}%,0.45)`;
      g.beginPath();
      g.ellipse(rand(0, w), rand(0, h), r * (banded ? 3 : 1.4), r, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (!banded) {
      for (let i = 0; i < 140; i++) {
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.beginPath();
        g.ellipse(rand(0, w), rand(0, h), rand(10, 70), rand(4, 14), 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

function randInSphere(r) {
  const v = new V3();
  do v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)); while (v.lengthSq() > 1);
  return v.multiplyScalar(r);
}

export function buildWorld(scene) {
  const W = { planets: [], asteroids: [], spheres: [], buildings: [], pads: [], beacons: [], anim: [] };
  scene.background = new THREE.Color(0x020309);

  // ---------- sky ----------
  const skyTex = canvasTexture(1024, 512, (g, w, h) => {
    g.fillStyle = '#020309';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rand(0, w), y = rand(h * 0.2, h * 0.8), r = rand(40, 200);
      const hue = pick([280, 320, 200, 220, 260, 340]);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `hsla(${hue},80%,50%,0.11)`);
      grd.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(20000, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  {
    const n = 7000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(15000, 18000));
      pos.set([v.x, v.y, v.z], i * 3);
      c.setHSL(pick([0.6, 0.08, 0.0, 0.55]), 0.4, rand(0.6, 1));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
  }

  // ---------- sun & light ----------
  const sunPos = new V3(-7000, 2200, -9000);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false }));
  sun.position.copy(sunPos);
  scene.add(sun);
  const glowTex = canvasTexture(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,240,200,1)');
    gr.addColorStop(0.2, 'rgba(255,200,120,0.55)');
    gr.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(6000, 6000, 1);
  glow.position.copy(sunPos);
  scene.add(glow);
  W.sun = { pos: sunPos, r: 700 };

  const dl = new THREE.DirectionalLight(0xfff0dd, 2.4);
  dl.position.copy(sunPos).normalize().multiplyScalar(100);
  scene.add(dl);
  scene.add(new THREE.HemisphereLight(0x7d8cff, 0x1a0f1f, 0.8));

  // ---------- planets ----------
  const PL = [
    { name: 'Kora', pos: new V3(3000, -300, -2000), r: 480, hue: 25, banded: true },
    { name: 'Vesh', pos: new V3(-2600, 400, 1400), r: 320, hue: 200 },
    { name: 'Omi', pos: new V3(900, 900, 3800), r: 560, hue: 285, banded: true, ring: true },
    { name: 'Talo', pos: new V3(-1400, -600, -3700), r: 260, hue: 110 },
  ];
  for (const p of PL) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(p.r, 64, 32),
      new THREE.MeshStandardMaterial({ map: planetTexture(p.hue, p.banded), roughness: 0.9, metalness: 0 }),
    );
    m.position.copy(p.pos);
    m.rotation.z = rand(-0.4, 0.4);
    const atm = new THREE.Mesh(
      new THREE.SphereGeometry(p.r * 1.06, 48, 24),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(p.hue / 360, 0.8, 0.6), transparent: true, opacity: 0.15,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    m.add(atm);
    if (p.ring) {
      const ringTex = canvasTexture(512, 512, g => {
        for (let r = 256; r > 140; r -= 2) {
          g.strokeStyle = `hsla(${p.hue + rand(-20, 20)},40%,${rand(40, 75)}%,${rand(0.2, 0.8)})`;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(256, 256, r, 0, Math.PI * 2);
          g.stroke();
        }
      });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.r * 1.3, p.r * 2.2, 128),
        new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2 + 0.35;
      m.add(ring);
    }
    scene.add(m);
    W.planets.push({ ...p, mesh: m });
  }

  // ---------- Nova Santos station ----------
  const station = new THREE.Group();
  scene.add(station);
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a4152, metalness: 0.7, roughness: 0.4 });
  const deckTex = canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#161922';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#232a3a';
    g.lineWidth = 2;
    for (let i = 0; i <= w; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(41,240,255,0.6)';
    g.beginPath(); g.arc(512, 512, 170, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,46,136,0.55)';
    g.beginPath(); g.arc(512, 512, 495, 0, Math.PI * 2); g.stroke();
  });
  deckTex.anisotropy = 8;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(DECK_R, DECK_R * 0.96, 4, 96), [
    metal,
    new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.8, metalness: 0.2 }),
    metal,
  ]);
  deck.position.y = -2;
  station.add(deck);

  const neon = (color, o = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o });
  const edge = new THREE.Mesh(new THREE.TorusGeometry(DECK_R, 0.6, 8, 128), neon(0x29f0ff));
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.2;
  station.add(edge);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(30, 8, 60, 32), metal);
  hub.position.y = -34;
  station.add(hub);
  const hubLight = new THREE.Mesh(new THREE.TorusGeometry(28.6, 0.8, 8, 64), neon(0xff2e88));
  hubLight.rotation.x = Math.PI / 2;
  hubLight.position.y = -10;
  station.add(hubLight);

  const winTex = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 16) {
      for (let x = 6; x < w; x += 14) {
        if (Math.random() < 0.45) {
          g.fillStyle = pick(['#ffd27a', '#7ae7ff', '#ff7ad9', '#fff2c8']);
          g.fillRect(x, y, 8, 9);
        }
      }
    }
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  winTex.repeat.set(2, 2);

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(140, 6, 16, 128),
    new THREE.MeshStandardMaterial({ color: 0x2b3142, metalness: 0.6, roughness: 0.4, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.7 }),
  );
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = -20;
  station.add(outerRing);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(110, 3, 5), metal);
    spoke.position.set(Math.cos(a) * 85, -20, Math.sin(a) * 85);
    spoke.rotation.y = -a;
    station.add(spoke);
  }

  function building(x, z, w, d, h, color, label, neonHex) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.8 }),
    );
    m.position.set(x, h / 2, z);
    station.add(m);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), neon(neonHex));
    trim.position.set(x, h + 0.25, z);
    station.add(trim);
    W.buildings.push(new THREE.Box3(new V3(x - w / 2, 0, z - d / 2), new V3(x + w / 2, h, z + d / 2)));
    const face = Math.abs(x) > Math.abs(z) ? new V3(-Math.sign(x), 0, 0) : new V3(0, 0, -Math.sign(z));
    if (label) {
      const span = face.x !== 0 ? d : w;
      const sw = Math.min(span * 0.85, 14), sh = sw / 4;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: signTexture(label, css(neonHex)), toneMapped: false }));
      s.position.set(x + face.x * (w / 2 + 0.1), Math.min(h - sh / 2 - 0.5, 7), z + face.z * (d / 2 + 0.1));
      s.lookAt(s.position.clone().add(face));
      station.add(s);
    }
    return { mesh: m, face, x, z, w, d };
  }

  const med = building(-45, -20, 16, 12, 10, 0xdfe6ee, 'MED BAY', 0xff3355);
  building(45, -20, 18, 14, 16, 0x2a1f3d, 'NEON BAR', 0xff2e88);
  building(-45, 40, 14, 20, 14, 0x3d2a10, 'CASINO', 0xffc23d);
  building(10, 55, 10, 10, 42, 0x1c2433, 'SKY TOWER', 0x29f0ff);
  W.spawn = new V3(med.x + med.face.x * (med.w / 2 + 3), 0, med.z);

  // Pay 'n' Spray: open-sided garage you fly a ship into
  {
    const x = 62, z = 30, s = 16, h = 12;
    const postGeo = new THREE.BoxGeometry(0.8, h, 0.8);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(postGeo, metal);
      post.position.set(x + px * (s / 2 - 0.4), h / 2, z + pz * (s / 2 - 0.4));
      station.add(post);
      W.buildings.push(new THREE.Box3().setFromObject(post));
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(s, 1, s), new THREE.MeshStandardMaterial({ color: 0x3b1d4a, metalness: 0.4, roughness: 0.5 }));
    roof.position.set(x, h + 0.5, z);
    station.add(roof);
    W.buildings.push(new THREE.Box3().setFromObject(roof));
    const trim = new THREE.Mesh(new THREE.BoxGeometry(s + 0.6, 0.4, s + 0.6), neon(0xff7ad9));
    trim.position.set(x, h + 1.2, z);
    station.add(trim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(s - 1, s - 1), neon(0xff7ad9, { transparent: true, opacity: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.04, z);
    station.add(floor);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: signTexture("PAY 'N' SPRAY", '#ff7ad9'), toneMapped: false, side: THREE.DoubleSide }));
    sign.position.set(x - s / 2 - 0.1, h + 3, z);
    sign.rotation.y = -Math.PI / 2;
    station.add(sign);
    W.spray = new THREE.Box3(new V3(x - s / 2, 0, z - s / 2), new V3(x + s / 2, h, z + s / 2));
    W.sprayFloor = floor;
  }

  // Central holo sign
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 26, 12), metal);
    pole.position.y = 13;
    station.add(pole);
    W.buildings.push(new THREE.Box3(new V3(-0.8, 0, -0.8), new V3(0.8, 26, 0.8)));
    const holo = new THREE.Group();
    const tex = signTexture('NOVA SANTOS', '#29f0ff');
    for (const r of [0, Math.PI]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(28, 7), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, opacity: 0.92 }));
      p.rotation.y = r;
      p.position.z = r ? -0.05 : 0.05;
      holo.add(p);
    }
    holo.position.y = 30;
    station.add(holo);
    W.anim.push((dt) => { holo.rotation.y += dt * 0.3; });
  }

  // Lamps around the plaza
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const bulbGeo = new THREE.SphereGeometry(0.45, 10, 8);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const lamp = new THREE.Mesh(lampGeo, metal);
    lamp.position.set(Math.cos(a) * 32, 3, Math.sin(a) * 32);
    station.add(lamp);
    const bulb = new THREE.Mesh(bulbGeo, neon(i % 2 ? 0xff2e88 : 0x29f0ff));
    bulb.position.set(lamp.position.x, 6.2, lamp.position.z);
    station.add(bulb);
  }

  // Landing pads
  const padTex = canvasTexture(256, 256, g => {
    g.fillStyle = '#111520';
    g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffc23d'; g.lineWidth = 10;
    g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffc23d'; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('H', 128, 136);
  });
  [[0, -62], [-32, -58], [32, -58], [-70, 10]].forEach(([x, z], i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ map: padTex, transparent: true }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    station.add(m);
    W.pads.push({ pos: new V3(x, 0, z), id: i + 1 });
  });

  // Mission marker
  {
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 4, 32, 1, true),
      neon(0xffd23f, { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cyl.position.y = 2;
    g.add(cyl);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), neon(0xffd23f));
    cone.rotation.x = Math.PI;
    g.add(cone);
    g.position.set(0, 0, 15);
    station.add(g);
    W.marker = { pos: g.position.clone(), group: g };
    W.anim.push((dt, t) => {
      cone.position.y = 4.5 + Math.sin(t * 3) * 0.4;
      cone.rotation.y += dt * 2;
      cyl.material.opacity = 0.25 + Math.sin(t * 4) * 0.1;
    });
  }

  // ---------- asteroid field ----------
  const field = { center: new V3(1500, 150, 1300), radius: 700 };
  W.field = field;
  {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const n = 1 + 0.18 * Math.sin(x * 4.1 + y * 2.3) * Math.cos(z * 3.7 - x) + 0.08 * Math.sin(y * 9 + z * 7);
      pa.setXYZ(i, x * n, y * n, z * n);
    }
    geo.computeVertexNormals();
    const N = 220;
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      let pos;
      do {
        pos = randInSphere(field.radius);
        pos.y *= 0.45;
        pos.add(field.center);
      } while (pos.distanceTo(field.center) < 120);
      const s = 4 + 34 * Math.random() ** 3;
      q.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)));
      sc.set(s, s * rand(0.75, 1.1), s);
      m.compose(pos, q, sc);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.setHSL(rand(0.05, 0.1), rand(0.1, 0.3), rand(0.3, 0.5)));
      W.asteroids.push({ pos, r: s * 0.95 });
    }
    scene.add(inst);
  }

  // ---------- outposts (mission & traffic destinations) ----------
  function outpost(name, pos, color) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), metal);
    g.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(28, 2.2, 12, 48), new THREE.MeshStandardMaterial({ color: 0x4a5266, metalness: 0.6, roughness: 0.4, emissive: color, emissiveIntensity: 0.4 }));
    g.add(ring);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(28, 1.2, 1.2), metal);
      spoke.rotation.z = a;
      spoke.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 0);
      ring.add(spoke);
    }
    ring.rotation.x = Math.PI / 2;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), neon(color));
    beacon.position.y = 12;
    g.add(beacon);
    g.position.copy(pos);
    scene.add(g);
    W.spheres.push({ pos: pos.clone(), r: 9 });
    W.beacons.push({ name, pos: pos.clone() });
    const phase = Math.random() * 6;
    W.anim.push((dt, t) => {
      ring.rotation.z += dt * 0.2;
      beacon.visible = Math.sin(t * 3 + phase) > -0.3;
    });
  }
  const toward = (p, extra) => p.pos.clone().add(p.pos.clone().negate().normalize().multiplyScalar(p.r + extra));
  outpost('Kora Gas Refinery', toward(W.planets[0], 220), 0xff8a3d);
  outpost('Vesh Port', toward(W.planets[1], 200), 0x3dc8ff);
  outpost('Omi Ring Station', toward(W.planets[2], 240), 0xc77dff);
  outpost('Talo Outpost', toward(W.planets[3], 200), 0x6bff8a);
  outpost('Deep Space Relay', new V3(-700, 1100, -2400), 0xffd23f);
  outpost('Asteroid Mine', field.center.clone().add(new V3(0, 30, 0)), 0xff2e88);

  W.update = (dt, t) => {
    for (const f of W.anim) f(dt, t);
    for (const p of W.planets) p.mesh.rotation.y += dt * 0.01;
  };
  return W;
}
