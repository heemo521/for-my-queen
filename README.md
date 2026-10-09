# for-my-queen

**Grand Theft Orbit**: an open-world space crime game you play in VR, GTA-style, right in the browser (WebXR + Three.js). No install and no build step.

## Play on Meta Quest 3

1. One-time setup: in GitHub, go to **Settings → Pages**, set *Source* to **Deploy from a branch**, pick **main** and **/ (root)**, then **Save**. After about a minute the game is live at **https://heemo521.github.io/for-my-queen/**.
2. On the Quest 3, open the **Browser** app and go to `heemo521.github.io/for-my-queen`. Bookmark it.
3. Tap **ENTER VR** at the bottom of the page and allow the VR permission.
4. Use the Touch controllers. Hand tracking alone has no thumbsticks, so it can't move you.

Tip: you can play seated or standing. If the floor height feels off, hold the Meta button to recenter.

## Play

- **VR headset (Quest, PC VR):** open the hosted page in the headset browser and press **ENTER VR**.
- **Desktop:** open the page, click **PLAY**, then use mouse and keyboard.

WebXR needs HTTPS. The easiest host is GitHub Pages: *Settings → Pages → Deploy from branch → `main` / root*. Then open `https://<user>.github.io/for-my-queen/` on your headset.

To run locally: `python3 -m http.server 8000`, then open http://localhost:8000. Desktop works on localhost. For VR on a headset, use the HTTPS URL.

## Money is life

Your **NOVA coin (NVC)** balance is your life, like the movie *In Time*:

- It ticks down every second (faster when boosting or jetpacking). The HUD, and your wrist in VR, show how much life you have left.
- On foot there is no health bar. Every hit drains NVC.
- Paid weapons cost NVC per shot, and buying weapons spends it.
- At 0 you're **WASTED**. The Med Bay revives you with a 150 NVC emergency loan.
- Earn it back: missions, crates, coin orbs dropped by anything you destroy, or the **Chrono Siphon**, which steals NVC straight out of a target.

## Weapons (Arms Lab, north side of the plaza)

| # | Weapon | Price | Per shot | What it does |
|---|---|---|---|---|
| 1 | Pulse Blaster | free | free | reliable plasma bolts |
| 2 | Scatter Nova | 350 | 2 | 7-bolt plasma shotgun |
| 3 | Arc Caster | 500 | 3 | lightning that chains between up to 4 targets |
| 4 | Rail Lance | 650 | 6 | hypersonic beam that pierces everything in line |
| 5 | Chrono Siphon | 800 | steals | continuous beam that drains NVC from its target into your wallet |
| 6 | Hornet Swarm | 900 | 10 | 6 homing micro-rockets |
| 7 | Sun Mortar | 1000 | 8 | lobs a tiny star with a huge blast (don't stand close) |
| 8 | Singularity Gun | 1500 | 20 | opens a black hole that pulls ships, droids and loot in, then collapses |

Every weapon works on foot and mounted on your ship (bigger, longer range).

## Real crypto (future)

`src/wallet.js` is the only place balances change (`earn`, `spend`, `drain`, `ledger`), so it can be swapped for a real wallet later. Before any real money is involved:

- **Server-authoritative balances.** Anything in browser JavaScript can be edited by players.
- **No private keys in the client.**
- **Legal review.** Losing real money on in-game death can count as gambling or real-money gaming in many places, and app stores (including Meta's) have rules about it.

## What's in it

- **Nova Santos Station**: a walkable neon deck with Med Bay, Neon Bar, Casino, Sky Tower, landing pads and droid pedestrians.
- **Steal any ship**: walk up and hijack parked ships, police cruisers, or board ships in flight. ★ Crimes raise your wanted level.
- **Police**: cruisers chase you and shoot. More stars bring more cops. Break line of sight to lose them, or land in the **Pay 'n' Spray** ($100) for new paint and a clean record.
- **Missions** (yellow marker in the plaza): *Hot Cargo* delivery, *Ring Rush* checkpoint race, *Pirate Bounty*.
- **Open space**: 4 planets, a sun, an asteroid field, 6 outposts, civilian traffic and floating $ crates.
- **On foot**: jump, jetpack onto rooftops, and float in zero-g (EVA) when you're off the station.
- **Radio** (R / X button): three procedural stations: synthwave, space funk, chip rock.
- **WASTED**: if you die, you respawn at the Med Bay (minus the bill), and insurance delivers a new ship.
- **Combat**: twin wingtip lasers with heat management, lock-on homing missiles (hold your nose on a target), flares to shake off incoming missiles, splash damage, and police missiles from 3★.
- **Realism**: reflective PBR hull plating, shadows, planets with atmospheres and clouds, Milky Way sky, multi-stage explosions with fireballs, debris, shockwaves and light flashes, engine exhaust, damage smoke and fire, speed streaks, landing gear, a working cockpit with a live dashboard screen, 3D positional audio, and controller rumble in VR.

## Controls

| | Desktop | VR |
|---|---|---|
| Move / throttle | WASD | Left stick |
| Look / steer | Mouse (A/D roll in ship) | Head + right stick (snap turn on foot) |
| Up / down | Space / C | Right grip / left grip |
| Boost / sprint | Shift | Left trigger |
| Shoot | Click | Right trigger (aim with your hand on foot) |
| Switch weapon | 1–8 / mouse wheel | Right stick click |
| Missile (lock first) | Q / right-click | B |
| Flares | X | Left stick click |
| Steal / enter / exit / start mission | E | A |
| Radio | R | X |
| Camera / HUD | V (1st/3rd person) | Y (toggle HUD) |

## Code

- `index.html`: page, title screen, import map (Three.js r160 from CDN)
- `src/main.js`: game loop, player, ships and AI, police, missions, combat, camera
- `src/world.js`: universe and station builder
- `src/models.js`: procedural ships, cockpit, animated astronaut, droids, crates
- `src/wallet.js`: NVC wallet / ledger (money = life)
- `src/weapons.js`: weapon definitions, gun models, all firing behaviours
- `src/fx.js`: particles, explosions, debris, shockwaves, flash lights, speed dust
- `src/textures.js`: procedural noise, hull plating, rock and planet textures
- `src/hud.js`: GTA-style HUD (DOM overlay on desktop, floating panel in VR)
- `src/input.js`: keyboard/mouse and WebXR controller mapping
- `src/audio.js`: sound effects and procedural radio
