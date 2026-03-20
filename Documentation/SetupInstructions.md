# Step-by-Step Setup Instructions
## Iron Throne Neon World — Beginner's Build Guide

> Assumes: Windows 10/11, no prior Unity experience, Meta Quest 2/3
> Time estimate: 4–8 hours first time through

---

## PHASE 1 — Software Installation

### Step 1: Install Unity Hub
1. Go to **unity.com/download** and download **Unity Hub**
2. Install and launch Unity Hub
3. Sign in or create a free Unity account

### Step 2: Install Unity 2022.3 LTS
1. In Unity Hub, click **Installs** → **Install Editor**
2. Select **Unity 2022.3 LTS** (any 2022.3.x patch works)
3. During install, check **Android Build Support** + its sub-items (Android SDK, NDK, OpenJDK)
   - This is required for Quest builds
4. Complete installation (~8 GB download)

### Step 3: Create the project
1. In Unity Hub click **New Project**
2. Template: **3D (URP)** — Note: VRChat actually uses Built-in Render Pipeline, so select **3D (Built-in)** if available, or plain **3D**
3. Name: `IronThroneNeon`
4. Location: anywhere you have 10 GB free
5. Click **Create Project** — Unity will open

### Step 4: Import VRChat SDK3
1. Go to **vrchat.com/home/download** → download **VRChat Creator Companion (VCC)**
2. Install and launch VCC
3. Click **Create New Project** → select your `IronThroneNeon` folder → **Unity 2022.3**
4. VCC will add **SDK3-Worlds** and **UdonSharp** packages automatically
5. Open the project through VCC (it will use the correct Unity version)

### Step 5: Verify SDK is installed
1. In Unity, check the top menu bar — you should see a **VRChat SDK** menu
2. Click **VRChat SDK → Show Control Panel** — a window should appear
3. Log in with your VRChat account in this panel

---

## PHASE 2 — Scene Setup

### Step 6: Create the scene
1. `File → New Scene` → select **Basic (Built-in)**
2. Save it: `File → Save As → Assets/Scenes/IronThroneNeon.unity`
3. Delete the default **Directional Light** (we'll add our own)

### Step 7: Add the VRC World Descriptor
1. In the menu: `VRChat SDK → Samples → World` — this adds a sample scene
   - Alternatively: In the Hierarchy, right-click → **Create Empty** → rename it `VRCWorld`
2. With `VRCWorld` selected, in the Inspector click **Add Component**
3. Search for and add **VRC Scene Descriptor**
4. You'll also need a **VRC_SceneDescriptor** on the object — the SDK's Control Panel will guide you

### Step 8: Set up spawn points
1. Create 16 empty GameObjects: right-click in Hierarchy → **Create Empty**
2. Name them `Spawn_01` through `Spawn_16`
3. Parent them all under a new empty called `Spawn_Points`
4. Position them in a circle around where the map table will be
   - Spread them in the Inspector, e.g. X positions: -3, -2, -1, 0, 1, 2, 3, etc.
5. In the VRC Scene Descriptor, find the **Spawns** array
6. Set Size to 16, then drag each Spawn_XX into the array slots

---

## PHASE 3 — Building the War Room

### Step 9: Create the floor
1. Right-click Hierarchy → **3D Object → Plane**
2. Rename it `Floor_Stone`
3. Scale it to (5, 1, 8) — this makes a 50×80 unit floor
4. Add a material: in Project window, right-click **Assets/Materials** → **Create → Material**
5. Name it `M_Stone_Dark`, drag your stone texture onto it
6. Set **Tiling** to (8, 12) so the texture repeats naturally
7. Drag `M_Stone_Dark` onto the Floor_Stone object

### Step 10: Create the walls
1. Right-click Hierarchy → **3D Object → Cube** → rename `Wall_North`
2. Scale: (10, 5, 0.3) — a 10m wide, 5m tall wall
3. Position it at the north edge of the floor
4. Duplicate (Ctrl+D) 3 times for the other walls, rotate/position each
5. Apply `M_Stone_Dark` material to all walls
6. Mark all walls as **Static**: check the **Static** checkbox at top of Inspector

### Step 11: Add the map table
1. **3D Object → Cylinder** → rename `Table_Mesh`
2. Scale: (1.5, 0.45, 1.5) — round table shape
3. Position at center of the room (0, 0.45, 0)
4. Create a **Quad** child: right-click Table_Mesh → **3D Object → Quad**
5. Name it `Map_Surface`, scale to (2.8, 2.8, 1), rotate 90° on X
6. Apply a map texture material to Map_Surface

### Step 12: Add the throne
1. Import a low-poly throne mesh (free options: Sketchfab, Unity Asset Store "Low Poly")
   - Or use a tall Cube (0.6, 1.8, 0.3) as a placeholder chair
2. Name it `Throne_Mesh`, position at north end of room facing south
3. Create a **3D Object → Cube** for the dais platform, scale (2, 0.4, 1.5)
4. Apply `M_Iron_Throne` material

### Step 13: Add seating benches
1. **3D Object → Cube** → rename `Bench_01`
2. Scale: (1.5, 0.45, 0.4), apply `M_Wood_Dark` material
3. Duplicate 5 times (Ctrl+D), arrange in two rows facing the throne
4. Mark all as **Static**

---

## PHASE 4 — Gallery Hall

### Step 14: Create the gallery corridor
1. Create a new empty parent: `Create Empty` → rename `GalleryHall`
2. Add floor (Plane), two long walls (Cubes), ceiling (Cube) as children
3. Size the corridor: approximately 15m long × 4m wide × 4m tall

### Step 15: Add artwork frames
1. For each frame (7 total):
   a. **3D Object → Cube** → scale (1.5, 2, 0.1) → name `Frame_01`
   b. Apply a dark ornate frame material
   c. **3D Object → Quad** as child → name `Artwork_Quad` → scale (1.3, 1.8, 1)
   d. Apply an artwork texture material
2. Place frames evenly along the wall (position.x spacing of about 2.2 units)
3. Parent all frames under a new empty `GalleryPanel_System`

### Step 16: Add cultural figure standees
1. Import or create tall Quads (2m height) with character textures
2. Or use low-poly humanoid meshes if available
3. Name them `Figure_Dragonborn`, `Figure_Samurai`, `Figure_Knight`
4. Place along the opposite gallery wall

---

## PHASE 5 — Private Chambers

### Step 17: Create Chamber A
1. `Create Empty` → rename `Chamber_A`
2. Build a small room: floor + 3 walls + ceiling (the 4th "wall" is the open doorway)
   - Size: approx 4m × 4m × 3m
3. Position it off the side of the war room
4. Add a desk (Cube + Plane), bookshelf (stacked Cubes)

### Step 18: Add the audio trigger
1. **Create Empty** inside Chamber_A → rename `Trigger_A`
2. **Add Component → Box Collider**
3. Resize the Box Collider to fill the entire chamber room
4. **Check "Is Trigger"** in the Box Collider settings
5. **Add Component → Udon Behaviour** → click the script slot → select `ChamberTriggerRelay`
6. In the script's Inspector fields:
   - Set `Chamber Index` to **0**
   - Leave `Audio Zone Manager` empty for now (wire up in Step 25)
7. Repeat Steps 17–18 for Chamber_B (index=1) and Chamber_C (index=2)

---

## PHASE 6 — Lighting

### Step 19: Open the Lighting window
1. Menu: **Window → Rendering → Lighting**
2. On the **Scene** tab:
   - Skybox Material: assign a dark space/night skybox (or leave default for now)
   - Environment Lighting Source: **Color** → set to a very dark purple (#1A0A2E)
   - Fog: enable, set colour to dark grey, density 0.02

### Step 20: Add the hero throne light
1. Right-click Hierarchy → **Light → Spot Light**
2. Rename `HeroLight_Throne`
3. Position above the throne, angled down at 30°
4. In Inspector:
   - Mode: **Realtime** (this is one of your 2 shadow lights)
   - Color: amber (#FFC060)
   - Range: 8, Intensity: 2, Spot Angle: 35°
   - Shadows: **Hard Shadows**

### Step 21: Add baked fill lights
1. Add 6 **Point Lights** around the room at head height (2.5m Y)
2. Set each to:
   - Mode: **Baked**
   - Color: alternate between purple (#6020A0) and deep amber (#80400A)
   - Range: 6, Intensity: 1.5
   - Shadows: **No Shadows** (baked lights can shadow via lightmap)
3. Add 12 more small **Point Lights** for the neon strip accents:
   - Mode: **Baked**, Intensity: 1.0, Range: 2
   - Colors: neon purple (#8000FF), neon teal (#00FFCC), electric blue (#0060FF)

### Step 22: Bake the lighting
1. In the Lighting window, click **Generate Lighting**
2. If it's slow, set **Lightmap Resolution** to 10 (lower = faster bake, lower quality)
3. Wait for the progress bar to complete (can take 10–30 mins first time)
4. You should now see coloured light and shadows on all Static objects

---

## PHASE 7 — Adding UdonSharp Scripts

> First, import the scripts: place all `.cs` files from `Assets/Scripts/UdonSharp/` into your Unity project.

### Step 23: Set up the Video Player
1. Create an empty inside `WarRoom/VideoScreen` → name `VideoPlayer_Controller`
2. **Add Component → VRC Unity Video Player** (from VRChat SDK)
3. **Add Component → Udon Behaviour** → assign script `SyncedVideoPlayer`
4. **Add Component → VRC Synced Object** ← critical for network sync!
5. Create a **Canvas** child (World Space mode, width 2, height 0.5)
6. Add inside the Canvas: InputField, 4 Buttons, 1 Text, 1 Slider
7. In the `SyncedVideoPlayer` Inspector:
   - Video Player: drag the VRC Unity Video Player component here
   - Screen Renderer: drag the Screen_Quad renderer
   - Wire each UI element into its slot
   - Wire each button's **OnClick** to the corresponding `On___Pressed()` method

### Step 24: Set up the Gallery Rotator
1. Select `GalleryPanel_System`
2. **Add Component → Udon Behaviour** → assign `GalleryRotator`
3. **Add Component → VRC Synced Object**
4. In the Inspector:
   - Artwork Panels array: set size to 7, drag each Frame_0X GameObject in
   - Artwork Titles: fill in the names of your artworks
   - Wire the Prev/Next buttons

### Step 25: Set up the Lighting Mood Switcher
1. Create empty `SystemControllers/LightingController`
2. **Add Component → Udon Behaviour** → assign `LightingMoodSwitcher`
3. **Add Component → VRC Synced Object**
4. Wire lights into the three arrays in Inspector:
   - Ambient Lights: drag all 6 baked fill lights
   - Hero Lights: drag `HeroLight_Throne` and `HeroLight_Screen`
   - Neon Accent Lights: drag all 12 neon strip lights
5. Create a Canvas with 3 buttons for the moods, wire OnClick events

### Step 26: Set up Audio Zones
1. Create empty `SystemControllers/AudioZoneRoot`
2. **Add Component → Udon Behaviour** → assign `AudioZoneManager`
3. In Inspector:
   - Chamber Roots: drag Chamber_A, Chamber_B, Chamber_C
   - Chamber Triggers: drag Trigger_A, Trigger_B, Trigger_C
   - Chamber Ambient Audio: drag the AudioSource from each chamber
   - Chamber Names: fill in "The Hand's Study", "The Maester's Alcove", "The Neon Sanctum"
4. On each chamber trigger's `ChamberTriggerRelay` component, drag `AudioZoneRoot` into the `Audio Zone Manager` slot

### Step 27: Set up Chamber Door Indicators
1. Create tiny Quad on each chamber doorframe → name `DoorIndicator_A/B/C`
2. Apply `M_DoorIndicator` material (Unlit, enable emission)
3. Create empty `SystemControllers/ProximityRoot`
4. **Add Component → Udon Behaviour** → assign `PlayerProximityTracker`
5. **Add Component → VRC Synced Object**
6. Wire door indicator Renderers into the array

---

## PHASE 8 — Quest Build & Upload

### Step 28: Switch to Android build
1. `File → Build Settings`
2. Select **Android** in the Platform list
3. Click **Switch Platform** (this may take several minutes)

### Step 29: Verify textures are compressed for Android
1. Select any texture in Project window
2. In Inspector, click the **Android** tab (little Android robot icon)
3. Set **Override for Android: checked**
4. Format: **ASTC 6x6** (best quality/size balance for Quest)
5. Repeat for all textures, or select all at once and batch-change

### Step 30: Check VRChat SDK stats
1. **VRChat SDK → Show Control Panel**
2. Click **Builder** tab
3. Review the **Performance** section — resolve any red warnings

### Step 31: Build and upload
1. In VRChat SDK Control Panel:
   - Fill in World Name: "Iron Throne Neon"
   - World Description: describe the world
   - Set World Capacity: 16
   - Add tags: `cyberpunk`, `medieval`, `social`
2. Click **Build & Publish for Android** (Quest)
3. After Quest build succeeds, click **Build & Publish for Windows** (PC)
4. Done! Your world will appear in your VRChat account in a few minutes

### Step 32: Test in VRChat
1. Open VRChat (PC or Quest)
2. Go to **Worlds → Mine** → find "Iron Throne Neon"
3. Enter alone first — test each feature:
   - Load a YouTube URL in the video player
   - Click through gallery panels
   - Toggle lighting modes
   - Walk into a private chamber — listen for ambient audio change
4. Invite a friend and test that synced video and lighting stay in sync across clients

---

## TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| Scripts won't compile | Make sure UdonSharp package is installed via VCC; check the Console for the specific error |
| VRC Synced Object missing | The SDK needs this component for any script using `[UdonSynced]` — add it to the same GameObject |
| Lighting looks flat/black | You need to bake lighting first (Step 22); check all geometry is marked Static |
| Video player shows black | The RenderTexture must be assigned to both the VideoPlayer and the Screen material |
| Quest build fails | Check that Build Platform is Android and all textures are ASTC compressed |
| Players don't hear chambers | Make sure Box Collider Is Trigger is checked; make sure the relay script has the correct chamber index |
| Lighting mood doesn't sync | Verify VRC Synced Object is on the LightingController GameObject |
