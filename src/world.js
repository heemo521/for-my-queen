// Builds the universe: sky + Milky Way, sun, planets with atmospheres and clouds,
// Nova Santos station, asteroid field, outposts, environment reflections and shadows.
import * as THREE from 'three';
import { fbm, noise3, canvas, toTexture, hullTextures, rockTextures, planetTexture, cloudTexture, glowTexture, windowTexture } from './textures.js';

export const DECK_R = 90;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const V3 = THREE.Vector3;
const css = hex => '#' + hex.toString(16).padStart(6, '0');

export function canvasTexture(w, h, draw) {
  const c = canvas(w, h);
  draw(c.getContext('2d'), w, h);
  return toTexture(c);
}

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

function adTexture(title, sub, c1, c2) {
  return canvasTexture(256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = 'bold 44px Bungee, Impact, sans-serif';
    g.textAlign = 'center';
    title.split(' ').forEach((t, i) => g.fillText(t, w / 2, 120 + i * 56, w - 20));
    g.font = 'bold 20px Inter, sans-serif';
    g.fillText(sub, w / 2, h - 50, w - 20);
  });
}

function randInSphere(r) {
  const v = new V3();
  do v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)); while (v.lengthSq() > 1);
  return v.multiplyScalar(r);
}

function atmosphereMaterial(color, sunDir, power = 3, strength = 1.6) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uSun: { value: sunDir }, uPow: { value: power }, uStr: { value: strength } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uSun; uniform float uPow; uniform float uStr;
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float rim = 1.0 - abs(dot(V, vN));
        float i = pow(rim, uPow);
        float day = clamp(dot(vN, uSun) * 0.9 + 0.35, 0.03, 1.0);
        gl_FragColor = vec4(uColor * i * day * uStr, i * day);
      }`,
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
  });
}

export function buildWorld(scene, renderer) {
  const W = { planets: [], asteroids: [], spheres: [], buildings: [], pads: [], beacons: [], anim: [] };
  scene.background = new THREE.Color(0x010207);
  const sunPos = new V3(-7000, 2200, -9000);
  const sunDir = sunPos.clone().normalize();
  W.sunDir = sunDir;
  const glowTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.3)');
  const glow = (color, scale, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, toneMapped: false }));
    s.scale.setScalar(scale);
    return s;
  };

  // ---------- sky: nebula + Milky Way band ----------
  const bandY = (x, h) => h * 0.5 + Math.sin((x / 2048) * Math.PI * 2) * h * 0.18;
  const skyTex = canvasTexture(2048, 1024, (g, w, h) => {
    g.fillStyle = '#010207';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x = rand(0, w), y = bandY(x, h) + rand(-1, 1) * rand(0, 160), r = rand(40, 220);
      const hue = pick([220, 260, 200, 30, 280]);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `hsla(${hue},45%,62%,0.09)`);
      grd.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // dust lanes
    for (let i = 0; i < 90; i++) {
      const x = rand(0, w), y = bandY(x, h) + rand(-30, 30), r = rand(20, 90);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(0,0,0,0.35)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 25; i++) {
      const x = rand(0, w), y = rand(h * 0.1, h * 0.9), r = rand(80, 300);
      const hue = pick([300, 330, 190, 260]);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `hsla(${hue},80%,50%,0.07)`);
      grd.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 9000; i++) {
      const x = rand(0, w), y = bandY(x, h) + (Math.random() - 0.5) * (Math.random() * 260);
      g.fillStyle = `rgba(255,${(rand(220, 255)) | 0},${(rand(200, 255)) | 0},${rand(0.15, 0.6)})`;
      g.fillRect(x, y, 1, 1);
    }
  });
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  const starLayer = (n, size, near, far, band) => {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new V3(rand(-1, 1), rand(-1, 1) * (band ? 0.25 : 1), rand(-1, 1)).normalize().multiplyScalar(rand(near, far));
      pos.set([v.x, v.y, v.z], i * 3);
      const t = Math.random();
      c.setHSL(t < 0.2 ? 0.6 : t < 0.35 ? 0.08 : 0.12, t < 0.6 ? 0.15 : 0.5, rand(0.65, 1));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true }));
    scene.add(p);
  };
  starLayer(7000, 1.2, 15000, 18000, false);
  starLayer(500, 2.4, 15000, 18000, false);

  // ---------- sun ----------
  const sun = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff6dd, toneMapped: false }));
  sun.position.copy(sunPos);
  scene.add(sun);
  const corona = glow(0xffd9a0, 7000, 0.9);
  corona.position.copy(sunPos);
  scene.add(corona);
  const halo = glow(0xff9a50, 16000, 0.35);
  halo.position.copy(sunPos);
  scene.add(halo);
  W.sun = { pos: sunPos, r: 700 };

  const sunLight = new THREE.DirectionalLight(0xfff0dd, 2.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  const sc = sunLight.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 900;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.6;
  scene.add(sunLight, sunLight.target);
  W.sunLight = sunLight;
  scene.add(new THREE.HemisphereLight(0x6070a0, 0x120a10, 0.35));

  // Environment reflections from a tiny "sky + sun" scene
  {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
    const s = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(30) }));
    s.position.copy(sunDir).multiplyScalar(80);
    envScene.add(s);
    const fill = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 8), new THREE.MeshBasicMaterial({ color: 0x241a3a }));
    fill.position.copy(sunDir).multiplyScalar(-80);
    envScene.add(fill);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.03).texture;
    pm.dispose();
  }

  // ---------- planets ----------
  const PL = [
    { name: 'Kora', pos: new V3(3000, -300, -2000), r: 480, hue: 25, type: 'gas', atm: 0xffb070 },
    { name: 'Vesh', pos: new V3(-2600, 400, 1400), r: 320, hue: 200, type: 'earth', atm: 0x5aa8ff, clouds: true },
    { name: 'Omi', pos: new V3(900, 900, 3800), r: 560, hue: 275, type: 'gas', atm: 0xc58cff, ring: true },
    { name: 'Talo', pos: new V3(-1400, -600, -3700), r: 260, hue: 30, type: 'rock', atm: 0xd9b48a },
  ];
  PL.forEach((p, idx) => {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(p.hue / 360, 0.3, 0.35), roughness: 0.95, metalness: 0 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(p.r, 96, 48), mat);
    m.position.copy(p.pos);
    m.rotation.z = rand(-0.4, 0.4);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.05, 64, 32), atmosphereMaterial(p.atm, sunDir, p.type === 'rock' ? 5 : 3, p.type === 'rock' ? 0.7 : 1.8));
    atm.position.copy(p.pos);
    scene.add(atm);
    let clouds = null;
    if (p.clouds) {
      clouds = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.012, 64, 32), new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 1, color: 0xffffff }));
      clouds.visible = false;
      m.add(clouds);
    }
    if (p.ring) {
      const ringTex = canvasTexture(1024, 1024, g => {
        for (let r = 512; r > 300; r -= 1) {
          const n = fbm(r * 0.05, 1.3, 2.7, 4);
          g.strokeStyle = `hsla(${p.hue + (n - 0.5) * 50},35%,${40 + n * 40}%,${Math.max(0, n * 1.3 - 0.2)})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(512, 512, r, 0, Math.PI * 2);
          g.stroke();
        }
      });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.r * 1.3, p.r * 2.2, 160),
        new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }),
      );
      ring.rotation.x = -Math.PI / 2 + 0.35;
      ring.receiveShadow = true;
      m.add(ring);
    }
    m.receiveShadow = false;
    scene.add(m);
    W.planets.push({ ...p, mesh: m });
    // Heavy texture generation happens after the first frames so startup stays snappy.
    setTimeout(() => {
      mat.map = planetTexture(p.type, p.hue, 1024, 512);
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
      if (clouds) {
        clouds.material.map = cloudTexture(512, 256);
        clouds.material.needsUpdate = true;
        clouds.visible = true;
      }
    }, 400 + idx * 250);
    W.anim.push(dt => { m.rotation.y += dt * 0.01; if (clouds) clouds.rotation.y += dt * 0.006; });
  });

  // ---------- Nova Santos station ----------
  const station = new THREE.Group();
  scene.add(station);
  const H = hullTextures();
  const metal = new THREE.MeshStandardMaterial({ color: 0x6a7080, metalness: 0.7, roughness: 1, map: H.map, roughnessMap: H.roughnessMap, bumpMap: H.bumpMap, bumpScale: 0.6 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x30343d, metalness: 0.75, roughness: 0.5 });
  const neon = (color, o = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o });
  const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  const deckTex = canvasTexture(2048, 2048, (g, w, h) => {
    g.fillStyle = '#20242d';
    g.fillRect(0, 0, w, h);
    const step = 64;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const n = fbm(x * 0.004, y * 0.004, 1.7, 3);
        const l = 13 + n * 10 + rand(-1.5, 1.5);
        g.fillStyle = `hsl(222,10%,${l}%)`;
        g.fillRect(x + 1, y + 1, step - 2, step - 2);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        for (const [bx, by] of [[5, 5], [step - 8, 5], [5, step - 8], [step - 8, step - 8]]) g.fillRect(x + bx, y + by, 3, 3);
        if (Math.random() < 0.05) { // floor grates
          g.fillStyle = 'rgba(0,0,0,0.45)';
          for (let k = 8; k < step - 8; k += 6) g.fillRect(x + 8, y + k, step - 16, 2);
        }
      }
    }
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(41,240,255,0.55)';
    g.beginPath(); g.arc(1024, 1024, 342, 0, Math.PI * 2); g.stroke();
    // hazard ring near the edge
    g.save();
    g.beginPath(); g.arc(1024, 1024, 1000, 0, Math.PI * 2); g.arc(1024, 1024, 972, 0, Math.PI * 2, true); g.clip();
    for (let a = 0; a < Math.PI * 2; a += 0.025) {
      g.fillStyle = Math.floor(a / 0.025) % 2 ? '#e8b400' : '#15161a';
      g.beginPath(); g.moveTo(1024, 1024); g.arc(1024, 1024, 1010, a, a + 0.025); g.fill();
    }
    g.restore();
    // grime
    for (let i = 0; i < 260; i++) {
      const x = rand(0, w), y = rand(0, h), r = rand(10, 90);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(0,0,0,0.22)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  deckTex.anisotropy = 8;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(DECK_R, DECK_R * 0.96, 4, 128), [
    metal,
    new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.7, metalness: 0.35 }),
    metal,
  ]);
  deck.position.y = -2;
  deck.receiveShadow = true;
  station.add(deck);

  const edge = new THREE.Mesh(new THREE.TorusGeometry(DECK_R, 0.5, 8, 160), neon(0x29f0ff));
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.1;
  station.add(edge);
  // railing
  {
    const n = 180;
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), darkMetal, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      post.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * (DECK_R - 1.2), 0.55, Math.sin(a) * (DECK_R - 1.2)));
    }
    post.castShadow = true;
    station.add(post);
    for (const y of [0.6, 1.1]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(DECK_R - 1.2, 0.045, 6, 200), y > 1 ? neon(0xff2e88) : darkMetal);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = y;
      station.add(rail);
    }
  }

  const hub = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(30, 8, 60, 48), metal));
  hub.position.y = -34;
  station.add(hub);
  for (const y of [-10, -24, -40]) {
    const r = 30 - ((-4 - y) / 60) * 22;
    const band = new THREE.Mesh(new THREE.TorusGeometry(r + 0.4, 0.6, 8, 64), neon(y === -24 ? 0x29f0ff : 0xff2e88));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    station.add(band);
  }

  const winTex = windowTexture();
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const ringWin = winTex.clone();
  ringWin.repeat.set(24, 1);
  ringWin.needsUpdate = true;
  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(140, 6, 20, 160),
    new THREE.MeshStandardMaterial({ color: 0x3b4252, metalness: 0.7, roughness: 0.45, emissive: 0xffffff, emissiveMap: ringWin, emissiveIntensity: 0.9 }),
  );
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = -20;
  station.add(outerRing);
  const blinkers = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const spoke = shadowy(new THREE.Mesh(new THREE.BoxGeometry(110, 3, 5), metal));
    spoke.position.set(Math.cos(a) * 85, -20, Math.sin(a) * 85);
    spoke.rotation.y = -a;
    station.add(spoke);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 40), darkMetal);
    arm.position.set(Math.cos(a + Math.PI / 4) * 20, -50, Math.sin(a + Math.PI / 4) * 20);
    arm.lookAt(arm.position.clone().multiplyScalar(2).setY(-50));
    station.add(arm);
    const b = glow(0xff2222, 8);
    b.position.set(Math.cos(a) * 140, -12, Math.sin(a) * 140);
    station.add(b);
    blinkers.push(b);
  }

  function building(x, z, w, d, h, color, label, neonHex) {
    const wt = winTex.clone();
    wt.repeat.set(Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 10)));
    wt.needsUpdate = true;
    const m = shadowy(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: 1.1, map: H.map, roughnessMap: H.roughnessMap }),
    ));
    m.position.set(x, h / 2, z);
    station.add(m);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), neon(neonHex));
    trim.position.set(x, h + 0.25, z);
    station.add(trim);
    // vertical neon corner strips
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.15, h, 0.15), neon(neonHex));
      s.position.set(x + sx * (w / 2 + 0.05), h / 2, z + sz * (d / 2 + 0.05));
      station.add(s);
    }
    // rooftop clutter + aircraft warning light
    for (let i = 0; i < 3; i++) {
      const u = shadowy(new THREE.Mesh(new THREE.BoxGeometry(rand(1.5, 3), rand(0.8, 1.6), rand(1.5, 3)), darkMetal));
      u.position.set(x + rand(-w / 3, w / 3), h + 0.6, z + rand(-d / 3, d / 3));
      station.add(u);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5, 6), darkMetal);
    mast.position.set(x + w / 4, h + 2.5, z - d / 4);
    station.add(mast);
    const bl = glow(0xff2020, 2.5);
    bl.position.set(x + w / 4, h + 5.1, z - d / 4);
    station.add(bl);
    blinkers.push(bl);

    W.buildings.push(new THREE.Box3(new V3(x - w / 2, 0, z - d / 2), new V3(x + w / 2, h, z + d / 2)));
    const face = Math.abs(x) > Math.abs(z) ? new V3(-Math.sign(x), 0, 0) : new V3(0, 0, -Math.sign(z));
    if (label) {
      const span = face.x !== 0 ? d : w;
      const sw = Math.min(span * 0.85, 14), sh = sw / 4;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: signTexture(label, css(neonHex)), toneMapped: false }));
      s.position.set(x + face.x * (w / 2 + 0.1), Math.min(h - sh / 2 - 0.5, 7), z + face.z * (d / 2 + 0.1));
      s.lookAt(s.position.clone().add(face));
      station.add(s);
      // awning over the entrance
      const aw = shadowy(new THREE.Mesh(new THREE.BoxGeometry(face.x ? 1.8 : 6, 0.15, face.x ? 6 : 1.8), new THREE.MeshStandardMaterial({ color: neonHex, roughness: 0.6 })));
      aw.position.set(x + face.x * (w / 2 + 0.9), 3.4, z + face.z * (d / 2 + 0.9));
      station.add(aw);
    }
    return { mesh: m, face, x, z, w, d };
  }

  const med = building(-45, -20, 16, 12, 10, 0xd9dfe7, 'MED BAY', 0xff3355);
  building(45, -20, 18, 14, 16, 0x3a2a55, 'NEON BAR', 0xff2e88);
  building(-45, 40, 14, 20, 14, 0x55401c, 'CASINO', 0xffc23d);
  const tower = building(10, 55, 10, 10, 42, 0x283246, 'SKY TOWER', 0x29f0ff);
  W.spawn = new V3(med.x + med.face.x * (med.w / 2 + 3), 0, med.z);
  // billboards on the tower
  for (const [side, tex] of [[1, adTexture('NEBULA COLA', 'tastes like stardust', '#ff2e88', '#3a0b4a')], [-1, adTexture('VOTE NO ON GRAVITY', 'paid for by Citizens for Floating', '#1e90ff', '#0a1a3a')]]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(7, 14), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    b.position.set(tower.x + side * (tower.w / 2 + 0.2), 26, tower.z);
    b.rotation.y = side * Math.PI / 2;
    station.add(b);
  }

  // Pay 'n' Spray garage
  {
    const x = 62, z = 30, s = 16, h = 12;
    const postGeo = new THREE.BoxGeometry(0.8, h, 0.8);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = shadowy(new THREE.Mesh(postGeo, metal));
      post.position.set(x + px * (s / 2 - 0.4), h / 2, z + pz * (s / 2 - 0.4));
      station.add(post);
      W.buildings.push(new THREE.Box3().setFromObject(post));
    }
    const roof = shadowy(new THREE.Mesh(new THREE.BoxGeometry(s, 1, s), new THREE.MeshStandardMaterial({ color: 0x3b1d4a, metalness: 0.5, roughness: 0.5 })));
    roof.position.set(x, h + 0.5, z);
    station.add(roof);
    W.buildings.push(new THREE.Box3().setFromObject(roof));
    const trim = new THREE.Mesh(new THREE.BoxGeometry(s + 0.6, 0.4, s + 0.6), neon(0xff7ad9));
    trim.position.set(x, h + 1.2, z);
    station.add(trim);
    // spray nozzles under the roof
    for (let i = -2; i <= 2; i++) {
      const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.6, 8), darkMetal);
      nz.position.set(x + i * 3, h - 0.3, z);
      station.add(nz);
    }
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
    W.sprayCenter = new V3(x, h - 1, z);
  }

  // Central holo sign
  {
    const pole = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 26, 12), metal));
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
    W.anim.push((dt, t) => {
      holo.rotation.y += dt * 0.3;
      holo.children.forEach(c => { c.material.opacity = 0.85 + Math.sin(t * 23) * 0.04 + (Math.random() < 0.01 ? -0.5 : 0); });
    });
  }

  // Plaza lamps
  const lampGeo = new THREE.CylinderGeometry(0.1, 0.16, 6, 8);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const lamp = shadowy(new THREE.Mesh(lampGeo, darkMetal));
    lamp.position.set(Math.cos(a) * 32, 3, Math.sin(a) * 32);
    station.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), neon(i % 2 ? 0xff2e88 : 0x29f0ff));
    bulb.position.set(lamp.position.x, 6.2, lamp.position.z);
    station.add(bulb);
    const g = glow(i % 2 ? 0xff2e88 : 0x29f0ff, 5, 0.6);
    g.position.copy(bulb.position);
    station.add(g);
  }

  // Landing pads with floodlights, fuel tanks and cargo
  const padTex = canvasTexture(512, 512, g => {
    g.fillStyle = '#14181f';
    g.beginPath(); g.arc(256, 256, 254, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffc23d'; g.lineWidth = 16;
    g.beginPath(); g.arc(256, 256, 222, 0, Math.PI * 2); g.stroke();
    g.setLineDash([24, 18]); g.lineWidth = 5;
    g.beginPath(); g.arc(256, 256, 180, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#ffc23d'; g.font = 'bold 230px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('H', 256, 270);
    for (let i = 0; i < 80; i++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(256 + rand(-90, 90), 256 + rand(-90, 90), rand(5, 30), 0, 7); g.fill(); }
  });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe0, metalness: 0.6, roughness: 0.35 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.3, roughness: 0.8, map: H.map });
  [[0, -62], [-32, -58], [32, -58], [-70, 10]].forEach(([x, z], i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ map: padTex, transparent: true, roughness: 0.8, metalness: 0.2 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    m.receiveShadow = true;
    station.add(m);
    W.pads.push({ pos: new V3(x, 0, z), id: i + 1 });
    const out = new V3(x, 0, z).normalize();
    const side = new V3(-out.z, 0, out.x);
    // floodlight
    const fp = new V3(x, 0, z).addScaledVector(side, 11);
    const pole = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 8), darkMetal));
    pole.position.set(fp.x, 4.5, fp.z);
    station.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.6), darkMetal);
    head.position.set(fp.x, 9, fp.z);
    station.add(head);
    const fl = glow(0xfff1d0, 6, 0.8);
    fl.position.set(fp.x, 8.8, fp.z);
    station.add(fl);
    // fuel tanks
    const tp = new V3(x, 0, z).addScaledVector(side, -12);
    for (const k of [-1.3, 1.3]) {
      const tank = shadowy(new THREE.Mesh(new THREE.CapsuleGeometry(1, 2.6, 6, 16), tankMat));
      tank.position.set(tp.x + out.x * k * 1.6, 2.3, tp.z + out.z * k * 1.6);
      station.add(tank);
    }
    W.buildings.push(new THREE.Box3(new V3(tp.x - 3, 0, tp.z - 3), new V3(tp.x + 3, 4.3, tp.z + 3)));
    // cargo stack
    const cp = new V3(x, 0, z).addScaledVector(out, -12);
    if (xzDist(cp, 0, 0) > 35) {
      for (let k = 0; k < 3; k++) {
        const c = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), crateMat));
        c.position.set(cp.x + (k % 2) * 2.1, 1 + Math.floor(k / 2) * 2, cp.z);
        station.add(c);
      }
      W.buildings.push(new THREE.Box3(new V3(cp.x - 1, 0, cp.z - 1), new V3(cp.x + 3.1, 4, cp.z + 1)));
    }
  });

  // Arms Lab: weapon holograms on pedestals (filled in by the game)
  {
    const z = 42, x0 = -29, n = 7, gap = 4.2, cx = x0 + ((n - 1) * gap) / 2, wide = n * gap + 2;
    const plat = shadowy(new THREE.Mesh(new THREE.BoxGeometry(wide, 0.25, 4.5), darkMetal));
    plat.position.set(cx, 0.12, z);
    station.add(plat);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.06, 0.08), neon(0x22ff88));
    strip.position.set(cx, 0.27, z - 2.25);
    station.add(strip);
    const wall = shadowy(new THREE.Mesh(new THREE.BoxGeometry(wide, 6, 0.4), metal));
    wall.position.set(cx, 3, z + 2.4);
    station.add(wall);
    W.buildings.push(new THREE.Box3().setFromObject(wall));
    const top = new THREE.Mesh(new THREE.BoxGeometry(wide + 0.4, 0.3, 0.6), neon(0x22ff88));
    top.position.set(cx, 6.1, z + 2.4);
    station.add(top);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: signTexture('ARMS LAB', '#22ff88'), toneMapped: false }));
    sign.position.set(cx, 4.3, z + 2.15);
    sign.rotation.y = Math.PI;
    station.add(sign);
    const slots = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      const ped = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1, 16), darkMetal));
      ped.position.set(x, 0.75, z);
      station.add(ped);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 24), neon(0x22ff88));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 1.27, z);
      station.add(ring);
      slots.push(new V3(x, 2, z));
    }
    W.armsLab = { slots, center: new V3(cx, 0, z) };
  }

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
    const mg = glow(0xffd23f, 8, 0.5);
    mg.position.y = 2;
    g.add(mg);
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
    const R = rockTextures();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.05, map: R.map, bumpMap: R.bumpMap, bumpScale: 3 });
    const variants = [0, 1, 2].map(vi => {
      const geo = new THREE.IcosahedronGeometry(1, 4);
      const pa = geo.attributes.position;
      const off = vi * 17.3;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const n = 0.72 + fbm(x * 1.4 + off, y * 1.4, z * 1.4, 5) * 0.55 + (noise3(x * 5 + off, y * 5, z * 5) - 0.5) * 0.08;
        pa.setXYZ(i, x * n, y * n * (vi === 2 ? 0.7 : 1), z * n);
      }
      geo.computeVertexNormals();
      return geo;
    });
    const N = 240;
    const per = Math.ceil(N / 3);
    const insts = variants.map(g => new THREE.InstancedMesh(g, rockMat, per));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      let pos;
      do {
        pos = randInSphere(field.radius);
        pos.y *= 0.45;
        pos.add(field.center);
      } while (pos.distanceTo(field.center) < 120);
      const s = 4 + 36 * Math.random() ** 3;
      q.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)));
      sc.set(s, s, s);
      m.compose(pos, q, sc);
      const inst = insts[i % 3], k = Math.floor(i / 3);
      inst.setMatrixAt(k, m);
      inst.setColorAt(k, col.setHSL(rand(0.05, 0.1), rand(0.05, 0.25), rand(0.45, 0.7)));
      W.asteroids.push({ pos, r: s * 0.95 });
    }
    for (const inst of insts) {
      inst.castShadow = true;
      inst.receiveShadow = true;
      scene.add(inst);
    }
  }

  // ---------- outposts ----------
  function outpost(name, pos, color) {
    const g = new THREE.Group();
    const core = shadowy(new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), metal));
    g.add(core);
    const ring = shadowy(new THREE.Mesh(new THREE.TorusGeometry(28, 2.2, 14, 64), new THREE.MeshStandardMaterial({ color: 0x5a6276, metalness: 0.7, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 })));
    g.add(ring);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const spoke = shadowy(new THREE.Mesh(new THREE.BoxGeometry(28, 1.2, 1.2), metal));
      spoke.rotation.z = a;
      spoke.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 0);
      ring.add(spoke);
    }
    ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const panel = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.3, 16, 6), new THREE.MeshStandardMaterial({ color: 0x1a2a6a, metalness: 0.8, roughness: 0.25 })));
      const a = (i / 4) * Math.PI * 2;
      panel.position.set(Math.cos(a) * 16, 0, Math.sin(a) * 16);
      panel.rotation.y = -a;
      g.add(panel);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), neon(color));
    beacon.position.y = 12;
    g.add(beacon);
    const bg = glow(color, 18);
    bg.position.y = 12;
    g.add(bg);
    g.position.copy(pos);
    scene.add(g);
    W.spheres.push({ pos: pos.clone(), r: 9 });
    W.beacons.push({ name, pos: pos.clone() });
    const phase = Math.random() * 6;
    W.anim.push((dt, t) => {
      ring.rotation.z += dt * 0.2;
      const on = Math.sin(t * 3 + phase) > -0.3;
      beacon.visible = on;
      bg.visible = on;
    });
  }
  const toward = (p, extra) => p.pos.clone().add(p.pos.clone().negate().normalize().multiplyScalar(p.r + extra));
  outpost('Kora Gas Refinery', toward(W.planets[0], 220), 0xff8a3d);
  outpost('Vesh Port', toward(W.planets[1], 200), 0x3dc8ff);
  outpost('Omi Ring Station', toward(W.planets[2], 240), 0xc77dff);
  outpost('Talo Outpost', toward(W.planets[3], 200), 0x6bff8a);
  outpost('Deep Space Relay', new V3(-700, 1100, -2400), 0xffd23f);
  outpost('Asteroid Mine', field.center.clone().add(new V3(0, 30, 0)), 0xff2e88);

  W.anim.push((dt, t) => {
    const on = Math.sin(t * 2.2) > 0.6;
    for (const b of blinkers) b.visible = on;
  });

  // focus: where shadows should be sharp (the player)
  W.update = (dt, t, focus) => {
    for (const f of W.anim) f(dt, t);
    sunLight.target.position.copy(focus);
    sunLight.position.copy(focus).addScaledVector(sunDir, 400);
  };
  return W;
}

function xzDist(p, x, z) { return Math.hypot(p.x - x, p.z - z); }
