# Quest Optimization Checklist
## Iron Throne Neon World — Meta Quest Target

> VRChat rates worlds as **Excellent / Good / Medium / Poor / Very Poor** for Quest.
> This checklist targets **Good** (may slip to Medium depending on lighting setup).
> Every item that can degrade performance is marked with a priority label.

---

## GEOMETRY [CRITICAL]

- [ ] **Total triangle count ≤ 50,000** across all renderers in the scene
  - Run: `Window → Analysis → Profiler → Rendering → Triangles` during Play mode
  - Or check VRChat's Control Panel build stats after upload
- [ ] **No single mesh > 65,535 vertices** (Unity hard limit per mesh)
- [ ] **Merge static meshes** where possible using `Window → Rendering → Static Batching`
  - Merge all wall panels into one mesh via Blender or ProBuilder before import
  - Merge all baked-light-only small props (books, candles, pins) into one mesh per room
- [ ] **No Skinned Mesh Renderers** on world geometry (only use for animated characters)
- [ ] **Colliders use Primitive shapes** (Box, Sphere, Capsule) — avoid MeshCollider where possible
  - Exception: the floor and ceiling can use MeshCollider since they're large irregular shapes
- [ ] **LOD Groups** — not required at this scale, but add LOD0/LOD1 to the Throne and life-size figures if tris are too high
- [ ] **No invisible high-poly meshes** behind walls or under the floor

---

## TEXTURES [CRITICAL]

- [ ] **All textures ≤ 1024×1024** (1024² is the Quest maximum for Good rating)
  - Artwork panels: 1024²
  - Architectural tiles: 1024²
  - UI sprites: 512² or smaller
  - Small props (candles, pins): 256² or share an atlas
- [ ] **Use texture atlasing** — combine all stone wall textures into one 1024² atlas
- [ ] **Compression format: ASTC 6×6** for all textures (set per-texture in Import Settings → Android tab)
  - This dramatically reduces GPU memory on Quest
- [ ] **No uncompressed textures** — check Import Settings, ensure "Compressed" is shown
- [ ] **Disable mipmaps for UI textures** (Inspector → Texture Type: Sprite, uncheck Generate Mipmaps)
- [ ] **Enable mipmaps for all world textures** (avoids shimmer at distance)
- [ ] **Max texture memory budget: ~100 MB** — audit in `Window → Analysis → Memory Profiler`
- [ ] **RenderTexture for VideoPlayer**: set to 1024×512 (16:9 ish), ARGB32 format

---

## MATERIALS & SHADERS [HIGH]

- [ ] **≤ 20 unique materials** in the scene (Quest hard limit for Good rating is 20)
- [ ] **Use Standard shader only** — avoid custom shaders that are not Quest-compatible
  - Exception: VRChat's included "VRChat/Mobile/Standard" shader is Quest-safe and preferred
- [ ] **Switch all materials to `VRChat/Mobile/Standard`** before final upload
  - PC version can use Standard; create a separate Quest layer with the Mobile shader
- [ ] **No Transparency / Alpha Blend materials** except where essential
  - Use Alpha Clip (`Rendering Mode: Cutout`) for fabric/cushions instead of Fade
  - Transparent materials break batching and cost fill rate on Quest
- [ ] **Emissive materials**: use `VRChat/Mobile/Standard` with emission enabled — Unlit is also fine
- [ ] **UI shader**: use `UI/Default` only for Canvas elements

---

## LIGHTING [CRITICAL]

- [ ] **Lighting Mode: Baked** for all lights except the 2 hero realtime lights
  - In `Window → Rendering → Lighting → Scene`: set Lighting Mode to `Shadowmask` or `Baked`
- [ ] **Maximum 2 realtime shadow-casting lights** (Quest limit for Good rating is 0–1; target 0 at final upload)
  - Consider fully baking the hero throne light if shadows still look acceptable
- [ ] **No realtime Global Illumination** — disable `Realtime Global Illumination` in Lighting window
- [ ] **Bake lightmaps** with Progressive GPU Lightmapper (faster) at Medium quality
  - Lightmap size: 1024² per UV set, 2 lightmaps maximum
  - Set `Max Lightmap Size` to 1024 in Lighting settings
- [ ] **Light Probes** placed throughout the scene for dynamic objects (players)
  - Place probes every ~2 metres, denser in chambers and corners
  - Use `Window → Rendering → Light Explorer` to verify probe count
- [ ] **Reflection Probes**: 1 per main room, `Type: Baked`, resolution 128
- [ ] **Ambient Mode: Color** (not Skybox, not Gradient) — set in Lighting → Environment
  - This avoids an expensive sky lookup on Quest
- [ ] **Remove any point/spot lights left as Realtime** — set Mode to Baked

---

## RENDERING [HIGH]

- [ ] **Occlusion Culling**: bake it (`Window → Rendering → Occlusion Culling → Bake`)
  - Set all walls, pillars, large furniture as `Occluder Static` and `Occludee Static`
  - This is the single biggest performance win for an indoor world
- [ ] **Static Batching enabled** (`Project Settings → Player → Rendering → Static Batching: true`)
- [ ] **Dynamic Batching**: enable for small dynamic objects
- [ ] **GPU Instancing**: enable on shared materials (benches, candles)
- [ ] **No Post Processing on Quest** — VRChat disables it on Quest automatically, so skip configuring it for the Quest build
  - Post Processing is PC-only; keep it for the PC layer

---

## AUDIO [MEDIUM]

- [ ] **All AudioClips: Mono, 22050 Hz** (halves memory vs stereo 44100)
  - Set in Import Settings: Force To Mono, Sample Rate: 22050
- [ ] **Compression format: Vorbis, Quality ~50%** for ambient loops
- [ ] **Load Type: Streaming** for long ambient loops (>5 seconds)
  - `Load Type: Compressed In Memory` for short sound effects
- [ ] **Max 6 simultaneous AudioSources** — on Quest, more than this hits CPU
  - 3 chamber ambients + 1 VideoPlayer audio = 4 (safe)
- [ ] **3D Spatial Blend = 1.0** for all in-world sounds (full 3D falloff)
  - Exception: chamber ambients at 0.0 (2D) within their zone — see AudioZoneManager

---

## SCRIPTS [MEDIUM]

- [ ] **UdonSharp: no per-frame heavy loops** — all Update() methods in scripts are minimal
  - `SyncedVideoPlayer.Update()`: only 2 float lerps + conditional
  - `LightingMoodSwitcher.Update()`: N lerps (N = light count — keep lights ≤ 20 total)
  - `GalleryRotator.Update()`: 1 float lerp + conditional
- [ ] **RequestSerialization() called sparingly** — not every frame, only on state change
- [ ] **No GameObject.Find() or FindObjectOfType()** in Update (all refs assigned in Inspector)
- [ ] **Disable scripts on inactive GameObjects** — Unity still calls Update() on disabled behaviours attached to active objects; use `enabled = false`

---

## VRC WORLD DESCRIPTOR [REQUIRED]

- [ ] **VRCSceneDescriptor.ReferenceCamera** assigned (drag the Main Camera)
- [ ] **Spawn Points**: all 16 spawn transforms assigned in order
- [ ] **Respawn Height Y** set to -10 (kill plane below floor)
- [ ] **Player Count**: set capacity to 16, recommended 12
- [ ] **World Tags**: mark as Quest-compatible in Control Panel

---

## FINAL UPLOAD CHECKLIST

- [ ] Switch Build Platform to **Android** (`File → Build Settings → Android → Switch Platform`)
- [ ] Confirm no errors in the Console before upload
- [ ] Run **VRChat SDK Build & Test** (local test) before public upload
- [ ] Check the VRChat SDK **Performance Stats** panel — target:
  - Polygons: ≤ 50,000
  - Draw Calls: ≤ 200
  - Skinned Mesh Renderers: 0
  - Active Mesh Renderers: ≤ 70
  - Material Slots: ≤ 20
  - Audio Sources: ≤ 6
  - Lights: ≤ 4 realtime (target 0)
- [ ] Upload with **separate PC and Quest builds** using the SDK's cross-platform upload flow
- [ ] Test in-headset with 2+ players to verify sync behaviour

---

## QUICK REFERENCE: Quest Rating Thresholds

| Metric            | Excellent | Good   | Medium  | Poor    |
|-------------------|-----------|--------|---------|---------|
| Triangles         | ≤ 50K     | ≤ 100K | ≤ 200K | > 200K  |
| Materials         | ≤ 4       | ≤ 20   | ≤ 40   | > 40    |
| Realtime Lights   | 0         | ≤ 1    | ≤ 2    | > 2     |
| Active Renderers  | ≤ 16      | ≤ 70   | ≤ 100  | > 100   |
| Draw Calls        | ≤ 24      | ≤ 200  | ≤ 400  | > 400   |
| Audio Sources     | ≤ 4       | ≤ 6    | ≤ 8    | > 8     |
