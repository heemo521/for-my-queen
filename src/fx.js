// GPU point-sprite particles, explosions, debris, shockwaves, flash lights and speed dust.
import * as THREE from 'three';
import { glowTexture, smokeTexture } from './textures.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const randDir = (out = new THREE.Vector3()) => {
  do out.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); while (out.lengthSq() > 1 || out.lengthSq() < 0.01);
  return out.normalize();
};

const VERT = /* glsl */`
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * uScale / max(-mv.z, 0.05), 0.0, 900.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  }`;

class Particles {
  constructor(scene, cap, blending, map) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    // simulation state
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    this.c0 = new Float32Array(cap * 3);
    this.c1 = new Float32Array(cap * 3);
    this.drag = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', (this.aPos = mk(this.pos, 3)));
    geo.setAttribute('color', (this.aCol = mk(this.col, 3)));
    geo.setAttribute('size', (this.aSize = mk(this.size, 1)));
    geo.setAttribute('alpha', (this.aAlpha = mk(this.alpha, 1)));
    geo.setDrawRange(0, 0);
    this.uniforms = { map: { value: map }, uScale: { value: 600 } };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === THREE.AdditiveBlending ? 6 : 5;
    scene.add(this.points);
  }

  emit(p, v, life, s0, s1, c0, c1, a0 = 1, drag = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++, i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.life[i] = 0; this.max[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.drag[i] = drag;
    this.c0[i3] = c0.r; this.c0[i3 + 1] = c0.g; this.c0[i3 + 2] = c0.b;
    this.c1[i3] = c1.r; this.c1[i3 + 1] = c1.g; this.c1[i3 + 2] = c1.b;
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        // swap-remove with the last live particle
        const j = --this.n;
        if (i !== j) this.copy(j, i);
        continue;
      }
      const k = this.life[i] / this.max[i], i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      for (let a = 0; a < 3; a++) {
        this.vel[i3 + a] *= dr;
        this.pos[i3 + a] += this.vel[i3 + a] * dt;
        this.col[i3 + a] = this.c0[i3 + a] + (this.c1[i3 + a] - this.c0[i3 + a]) * k;
      }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = this.a0[i] * (k < 0.1 ? k * 10 : 1 - (k - 0.1) / 0.9);
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha]) {
      a.needsUpdate = true;
      a.clearUpdateRanges?.();
      a.addUpdateRange?.(0, this.n * a.itemSize);
    }
  }

  copy(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let a = 0; a < 3; a++) {
      this.pos[t3 + a] = this.pos[f3 + a]; this.vel[t3 + a] = this.vel[f3 + a];
      this.c0[t3 + a] = this.c0[f3 + a]; this.c1[t3 + a] = this.c1[f3 + a]; this.col[t3 + a] = this.col[f3 + a];
    }
    this.life[to] = this.life[from]; this.max[to] = this.max[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from]; this.a0[to] = this.a0[from];
    this.drag[to] = this.drag[from]; this.size[to] = this.size[from]; this.alpha[to] = this.alpha[from];
  }
}

const C = hex => new THREE.Color(hex);
const COL = {
  white: C(0xffffff), flash: C(0xfff4d6), fire: C(0xffa040), fireDeep: C(0xff3a10), ember: C(0x661100),
  smoke: C(0x4a4a50), smokeDark: C(0x1a1a1e), smokeLight: C(0x8a8a90), spark: C(0xffe08a), blue: C(0x7fd8ff), blueDeep: C(0x1f6bff),
  red: C(0xff5533), green: C(0x7dff6b),
};

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.glowTex = glowTexture();
    this.add = new Particles(scene, 5000, THREE.AdditiveBlending, this.glowTex);
    this.smoke = new Particles(scene, 2500, THREE.NormalBlending, smokeTexture());
    this.items = [];
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();

    // pooled lights: constant light count avoids shader recompiles
    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xffaa55, 0, 120, 2);
      scene.add(l);
      return { l, t: 0, dur: 1, peak: 0 };
    });

    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.debrisGeos = [new THREE.BoxGeometry(1, 0.3, 0.7), new THREE.TetrahedronGeometry(0.7), new THREE.BoxGeometry(0.4, 0.4, 1.4)];
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.8, roughness: 0.5, emissive: 0x220800 });

    // speed dust: short streak lines around the camera
    const N = 500;
    this.dustN = N;
    this.dustPts = new Float32Array(N * 3);
    this.dustLine = new Float32Array(N * 6);
    for (let i = 0; i < N * 3; i++) this.dustPts[i] = rnd(-60, 60);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dustLine, 3).setUsage(THREE.DynamicDrawUsage));
    this.dust = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.5, depthWrite: false }));
    this.dust.frustumCulled = false;
    scene.add(this.dust);
  }

  setScale(s) { this.add.uniforms.uScale.value = s; this.smoke.uniforms.uScale.value = s; }

  flashLight(pos, intensity, dur, color = 0xffaa55, range = 150) {
    const L = this.lights.reduce((a, b) => (a.l.intensity <= b.l.intensity ? a : b));
    L.l.position.copy(pos);
    L.l.color.setHex(color);
    L.l.distance = range;
    L.t = 0; L.dur = dur; L.peak = intensity;
    L.l.intensity = intensity;
  }

  sparks(pos, n = 10, speed = 30, color = COL.spark, baseVel) {
    for (let i = 0; i < n; i++) {
      const v = randDir(this.v).multiplyScalar(rnd(0.3, 1) * speed);
      if (baseVel) v.add(baseVel);
      this.add.emit(pos, v, rnd(0.2, 0.6), rnd(0.25, 0.5), 0.05, color, COL.fireDeep, 1, 2);
    }
    this.add.emit(pos, baseVel || this.v2.set(0, 0, 0), 0.12, 3, 5, COL.flash, COL.fire, 1);
  }

  muzzle(pos, dir, color, vel) {
    const c = color === 'red' ? COL.red : color === 'blue' ? COL.blue : COL.green;
    this.add.emit(pos, vel || this.v2.set(0, 0, 0), 0.07, 1.6, 2.6, COL.white, c, 1);
    for (let i = 0; i < 3; i++) {
      const v = this.v.copy(dir).multiplyScalar(rnd(15, 40)).add(randDir(this.v2).multiplyScalar(6));
      if (vel) v.add(vel);
      this.add.emit(pos, v, 0.12, 0.6, 0.1, c, c, 0.8);
    }
  }

  exhaust(pos, back, vel, power, blue = true) {
    // back: unit vector pointing out of the nozzle
    const v = this.v.copy(back).multiplyScalar(20 + power * 35).add(vel).add(randDir(this.v2).multiplyScalar(2));
    this.add.emit(pos, v, 0.18 + power * 0.25, 1.1 + power * 0.9, 0.2, blue ? COL.blue : COL.fire, blue ? COL.blueDeep : COL.fireDeep, 0.55, 1.5);
  }

  damageSmoke(pos, vel, severity) {
    const v = this.v.copy(vel).multiplyScalar(0.6).add(randDir(this.v2).multiplyScalar(3));
    this.smoke.emit(pos, v, rnd(1.2, 2.2), 1.5, 6 + severity * 6, severity > 0.6 ? COL.smokeDark : COL.smoke, COL.smokeDark, 0.7, 0.8);
    if (severity > 0.6 && Math.random() < 0.6) this.add.emit(pos, v, 0.35, 1.8, 0.4, COL.fire, COL.fireDeep, 0.9, 1);
  }

  missileTrail(pos, back, vel) {
    this.add.emit(pos, this.v.copy(back).multiplyScalar(30).add(vel), 0.12, 1.4, 0.3, COL.white, COL.fire, 1, 2);
    this.smoke.emit(pos, randDir(this.v2).multiplyScalar(1.5), rnd(1.5, 2.5), 0.8, 4, COL.smokeLight, COL.smoke, 0.45, 0.5);
  }

  flare(pos, vel) {
    this.add.emit(pos, vel, 3, 4, 1, COL.white, COL.fire, 1, 0.4);
  }

  // Multi-stage explosion: flash -> fireball -> sparks -> smoke, plus shockwave, debris and a light.
  explosion(pos, size, baseVel = null, big = true) {
    const bv = baseVel ? this.v2.copy(baseVel).multiplyScalar(0.3).clone() : new THREE.Vector3();
    this.add.emit(pos, bv, 0.18, size * 2.2, size * 3.2, COL.white, COL.flash, 1);
    const nf = Math.min(40, 10 + size * 3);
    for (let i = 0; i < nf; i++) {
      const v = randDir(this.v).multiplyScalar(rnd(0.2, 1) * size * 3).add(bv);
      this.add.emit(pos, v, rnd(0.5, 1.1), size * rnd(0.6, 1.2), size * rnd(1.4, 2.2), COL.flash, COL.fireDeep, 1, 1.6);
    }
    for (let i = 0; i < nf; i++) {
      const v = randDir(this.v).multiplyScalar(rnd(0.6, 1) * size * 9).add(bv);
      this.add.emit(pos, v, rnd(0.4, 1.2), rnd(0.3, 0.6), 0.05, COL.spark, COL.fireDeep, 1, 0.8);
    }
    const ns = Math.min(30, 6 + size * 2);
    for (let i = 0; i < ns; i++) {
      const v = randDir(this.v).multiplyScalar(rnd(0.2, 1) * size * 1.6).add(bv);
      this.smoke.emit(pos, v, rnd(2, 4), size * 0.8, size * rnd(2.5, 4), COL.smokeLight, COL.smokeDark, 0.6, 0.7);
    }
    this.flashLight(pos, big ? 900 * size : 150 * size, 0.6, 0xffa050, 40 + size * 25);
    if (!big) return;
    // shockwave ring
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffc88a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    ring.position.copy(pos);
    ring.lookAt(this.v.copy(pos).add(randDir(this.v2)));
    this.scene.add(ring);
    this.items.push({ m: ring, t: 0, dur: 0.55, type: 'ring', size: size * 4 });
    // tumbling, burning debris
    const nd = Math.min(10, 3 + Math.round(size));
    for (let i = 0; i < nd; i++) {
      const m = new THREE.Mesh(this.debrisGeos[i % 3], this.debrisMat);
      m.position.copy(pos);
      m.scale.setScalar(rnd(0.5, 1.2) * Math.max(0.6, size / 5));
      m.castShadow = true;
      this.scene.add(m);
      this.items.push({
        m, t: 0, dur: rnd(2.5, 4.5), type: 'debris',
        vel: randDir(new THREE.Vector3()).multiplyScalar(rnd(8, 30) + size * 2).add(bv),
        spin: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), burn: Math.random() < 0.7,
      });
    }
  }

  update(dt, camPos, camVel) {
    this.add.update(dt);
    this.smoke.update(dt);
    for (const L of this.lights) {
      if (L.l.intensity <= 0) continue;
      L.t += dt;
      L.l.intensity = L.t >= L.dur ? 0 : L.peak * (1 - L.t / L.dur) ** 2;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) {
        this.scene.remove(it.m);
        if (it.type === 'ring') it.m.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      if (it.type === 'ring') {
        it.m.scale.setScalar(it.size * (0.2 + k));
        it.m.material.opacity = 0.4 * (1 - k) ** 2;
      } else {
        it.m.position.addScaledVector(it.vel, dt);
        it.m.rotation.x += it.spin.x * dt;
        it.m.rotation.y += it.spin.y * dt;
        it.m.rotation.z += it.spin.z * dt;
        if (it.burn && Math.random() < 0.5) {
          this.smoke.emit(it.m.position, this.v.set(0, 0, 0), rnd(0.8, 1.4), 0.8, 2.5, COL.smoke, COL.smokeDark, 0.5 * (1 - k), 0.5);
          if (k < 0.5) this.add.emit(it.m.position, this.v, 0.25, 1, 0.2, COL.fire, COL.fireDeep, 0.8);
        }
      }
    }

    // speed dust streaks, wrapped into a box around the camera
    const speed = camVel.length();
    const half = 60;
    const len = Math.min(6, speed * 0.04);
    this.dust.material.opacity = Math.min(0.55, 0.1 + speed / 250);
    for (let i = 0; i < this.dustN; i++) {
      const i3 = i * 3, i6 = i * 6;
      for (let a = 0; a < 3; a++) {
        const c = a === 0 ? camPos.x : a === 1 ? camPos.y : camPos.z;
        let p = this.dustPts[i3 + a];
        p = ((((p - c + half) % (half * 2)) + half * 2) % (half * 2)) - half + c;
        this.dustPts[i3 + a] = p;
        this.dustLine[i6 + a] = p;
      }
      const inv = speed > 0.01 ? len / speed : 0;
      this.dustLine[i6 + 3] = this.dustPts[i3] - camVel.x * inv;
      this.dustLine[i6 + 4] = this.dustPts[i3 + 1] - camVel.y * inv;
      this.dustLine[i6 + 5] = this.dustPts[i3 + 2] - camVel.z * inv;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.visible = speed > 15;
  }
}

export const FXCOL = COL;
