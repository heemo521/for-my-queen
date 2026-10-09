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

## What's in it

- **Nova Santos Station**: a walkable neon deck with Med Bay, Neon Bar, Casino, Sky Tower, landing pads and droid pedestrians.
- **Steal any ship**: walk up and hijack parked ships, police cruisers, or board ships in flight. ★ Crimes raise your wanted level.
- **Police**: cruisers chase you and shoot. More stars bring more cops. Break line of sight to lose them, or land in the **Pay 'n' Spray** ($100) for new paint and a clean record.
- **Missions** (yellow marker in the plaza): *Hot Cargo* delivery, *Ring Rush* checkpoint race, *Pirate Bounty*.
- **Open space**: 4 planets, a sun, an asteroid field, 6 outposts, civilian traffic and floating $ crates.
- **On foot**: jump, jetpack onto rooftops, and float in zero-g (EVA) when you're off the station.
- **Radio** (R / X button): three procedural stations: synthwave, space funk, chip rock.
- **WASTED**: if you die, you respawn at the Med Bay (minus the bill), and insurance delivers a new ship.

## Controls

| | Desktop | VR |
|---|---|---|
| Move / throttle | WASD | Left stick |
| Look / steer | Mouse (A/D roll in ship) | Head + right stick (snap turn on foot) |
| Up / down | Space / C | Right grip / left grip |
| Boost / sprint | Shift | Left trigger |
| Shoot | Click | Right trigger (aim with your hand on foot) |
| Steal / enter / exit / start mission | E | A |
| Radio | R | X |
| Camera / HUD | V (1st/3rd person) | Y (toggle HUD) |

## Code

- `index.html`: page, title screen, import map (Three.js r160 from CDN)
- `src/main.js`: game loop, player, ships and AI, police, missions, combat, camera
- `src/world.js`: universe and station builder
- `src/models.js`: procedural ships, astronaut, droids, crates
- `src/hud.js`: GTA-style HUD (DOM overlay on desktop, floating panel in VR)
- `src/input.js`: keyboard/mouse and WebXR controller mapping
- `src/audio.js`: sound effects and procedural radio
