// Unifies keyboard/mouse and WebXR controllers into one action snapshot per frame.

const DEAD = 0.18;
const deadzone = v => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.edges = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.mouseDown = false;
    this.rightClick = false;
    this.locked = false;
    this.prevXR = new Map();

    addEventListener('keydown', e => {
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    el.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2 && this.locked) this.rightClick = true;
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mouseup', e => { if (e.button === 0) this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
    addEventListener('mousemove', e => {
      // Chrome sometimes reports a huge jump right after pointer lock; ignore outliers.
      if (this.locked && Math.abs(e.movementX) < 250 && Math.abs(e.movementY) < 250) {
        this.mdx += e.movementX;
        this.mdy += e.movementY;
      }
    });
  }

  lock() {
    if (this.locked || !this.el.requestPointerLock) return;
    try { this.el.requestPointerLock()?.catch?.(() => {}); } catch { /* not allowed right now */ }
  }

  read(session) {
    const k = c => (this.keys.has(c) ? 1 : 0);
    const e = c => this.edges.has(c);
    const a = {
      vr: !!session,
      moveX: k('KeyD') - k('KeyA'),
      moveY: k('KeyW') - k('KeyS'),
      lift: k('Space') - Math.max(k('KeyC'), k('ControlLeft')),
      keyYaw: k('ArrowLeft') - k('ArrowRight'),
      keyPitch: k('ArrowUp') - k('ArrowDown'),
      lookX: this.mdx,
      lookY: this.mdy,
      rx: 0,
      ry: 0,
      fire: (this.mouseDown && this.locked) || !!k('KeyF'),
      boost: !!(k('ShiftLeft') || k('ShiftRight')),
      interact: e('KeyE') || e('Enter'),
      radio: e('KeyR'),
      view: e('KeyV'),
      missile: e('KeyQ') || this.rightClick,
      flare: e('KeyX'),
    };

    if (session) {
      for (const src of session.inputSources) {
        const gp = src.gamepad;
        if (!gp) continue;
        const ax = gp.axes;
        const four = ax.length >= 4;
        const sx = deadzone((four ? ax[2] : ax[0]) || 0);
        const sy = deadzone((four ? ax[3] : ax[1]) || 0);
        const btn = gp.buttons.map(b => b.pressed);
        const prev = this.prevXR.get(src.handedness) || [];
        const edge = i => btn[i] && !prev[i];
        if (src.handedness === 'left') {
          a.moveX += sx;
          a.moveY -= sy;
          if (btn[0]) a.boost = true;
          if (btn[1]) a.lift -= 1;
          if (edge(4)) a.radio = true;
          if (edge(5)) a.view = true;
          if (edge(3)) a.flare = true;
        } else if (src.handedness === 'right') {
          a.rx = sx;
          a.ry = sy;
          if (btn[0]) a.fire = true;
          if (btn[1]) a.lift += 1;
          if (edge(4) || edge(3)) a.interact = true;
          if (edge(5)) a.missile = true;
        }
        this.prevXR.set(src.handedness, btn);
      }
      a.moveX = Math.max(-1, Math.min(1, a.moveX));
      a.moveY = Math.max(-1, Math.min(1, a.moveY));
      a.lift = Math.max(-1, Math.min(1, a.lift));
    }

    this.mdx = this.mdy = 0;
    this.rightClick = false;
    this.edges.clear();
    return a;
  }
}
