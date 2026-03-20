# Scene Hierarchy — Iron Throne Neon World
Unity 2022.3 LTS · VRChat SDK3 · UdonSharp 1.x

---

## Complete Scene Tree

```
IronThroneNeon [Scene root]
│
├── [VRChat SDK]                              ← Auto-created by SDK
│   ├── VRCWorld
│   ├── VRCSceneDescriptor
│   └── VRCMirrorWorld (optional)
│
├── Environment
│   ├── Terrain_Base                          ← Flat plane or simple mesh floor (no terrain)
│   ├── SkyboxController                      ← Sets a dark, starry custom skybox material
│   └── PostProcessingVolume                  ← Bloom + Color Grading for the neon look
│
├── WarRoom [Main gathering space]
│   │
│   ├── Architecture
│   │   ├── Floor_Stone                       ← Mesh: tiled dark flagstone, 1024² texture
│   │   ├── Walls_Stone [x4]                  ← Mesh: rough dark stone, combined baked
│   │   ├── Ceiling_Vault                     ← Mesh: vaulted arch ceiling
│   │   ├── Pillars [x8]                      ← Mesh: gothic stone columns (LOD0 only)
│   │   ├── Archways [x2]                     ← Mesh: entrance arches (North / South)
│   │   └── Window_Frames [x4]                ← Mesh: tall lancet window frames (no glass)
│   │
│   ├── MapTable                              ← Central gathering point
│   │   ├── Table_Mesh                        ← Low-poly round war table (~800 tris)
│   │   ├── Map_Surface                       ← Quad with Westeros-style map texture
│   │   ├── Map_Markers [x6]                  ← Tiny pin meshes for player interaction
│   │   └── NeonEdgeLight                     ← Point light: neon purple, range 2m, baked
│   │
│   ├── ThroneArea
│   │   ├── Throne_Mesh                       ← Stylized Iron-Throne-inspired chair
│   │   │                                        (~1200 tris, no alpha)
│   │   ├── Throne_Dais                       ← Raised platform mesh, 2 steps
│   │   ├── ThroneBacklight                   ← Spot light: amber, 30° angle, realtime
│   │   │                                        (one of the 2 shadow-casting lights)
│   │   └── Seat_Trigger                      ← Sphere Collider trigger (for sit gesture)
│   │
│   ├── SeatingArea
│   │   ├── BenchRow_Left  [x3 benches]       ← Low-poly stone benches (~200 tris each)
│   │   ├── BenchRow_Right [x3 benches]
│   │   └── CushionQuads   [x6]               ← Quads with alpha-clip fabric texture
│   │
│   ├── VideoScreen
│   │   ├── Screen_Frame                      ← Dark metal frame mesh
│   │   ├── Screen_Quad                       ← Quad receiving VideoPlayer RenderTexture
│   │   ├── Screen_Backlight                  ← Rect light: cold blue, baked only
│   │   └── VideoPlayer_Controller            ← [UdonBehaviour: SyncedVideoPlayer]
│   │       ├── VRCUnityVideoPlayer            ← VRC component
│   │       └── Screen_UI_Canvas              ← World-space Canvas (2m wide)
│   │           ├── URL_InputField
│   │           ├── Button_Load
│   │           ├── Button_Play
│   │           ├── Button_Pause
│   │           ├── Button_Stop
│   │           ├── Text_Status
│   │           └── Slider_Progress
│   │
│   └── NeonDecor_WarRoom
│       ├── WallStrip_Neon_N                  ← Quad: emissive neon strip (purple)
│       ├── WallStrip_Neon_S                  ← Quad: emissive neon strip (blue)
│       ├── WallStrip_Neon_E                  ← Quad: emissive neon strip (teal)
│       ├── WallStrip_Neon_W                  ← Quad: emissive neon strip (purple)
│       ├── PointLight_Corner [x4]            ← Point lights: neon teal, range 4m, baked
│       └── TorchSconce [x8]                  ← Static mesh + point light (baked)
│
├── GalleryHall [Long corridor / alcove walls]
│   │
│   ├── GalleryArchitecture
│   │   ├── Floor_Parquet                     ← Dark wood-pattern texture (1024²)
│   │   ├── Walls_Gallery [x2]                ← Smooth plaster with neon reveal trim
│   │   └── Ceiling_Cove                      ← Simple box ceiling, cove lighting
│   │
│   ├── GalleryPanel_System                   ← [UdonBehaviour: GalleryRotator]
│   │   ├── Frame_01                          ← Artwork panel slot 1
│   │   │   ├── Frame_Mesh                    ← Dark ornate picture frame (~300 tris)
│   │   │   └── Artwork_Quad                  ← Quad child — texture swapped by script
│   │   ├── Frame_02                          ← Artwork panel slot 2
│   │   │   ├── Frame_Mesh
│   │   │   └── Artwork_Quad
│   │   ├── Frame_03 … Frame_07              ← Repeat pattern (7 panels total)
│   │   └── Gallery_UI_Canvas
│   │       ├── Button_Prev
│   │       ├── Button_Next
│   │       ├── Text_Title
│   │       └── Text_Index
│   │
│   ├── CulturalFigures                       ← Life-size standees / statues
│   │   ├── Figure_Dragonborn                 ← ~1500 tris, one 512² texture
│   │   ├── Figure_Samurai                    ← ~1500 tris
│   │   └── Figure_Knight                     ← ~1500 tris
│   │
│   └── GalleryLighting
│       ├── SpotTrack_01 … 07                 ← Spot lights (baked) angled at each frame
│       └── CoveLightStrip                    ← Emissive Quads along ceiling edge
│
├── PrivateChambers
│   │
│   ├── Chamber_A  ["The Hand's Study"]
│   │   ├── Architecture_A
│   │   │   ├── Floor_A
│   │   │   ├── Walls_A [x3]
│   │   │   └── Ceiling_A
│   │   ├── Furniture_A
│   │   │   ├── Desk_Mesh
│   │   │   ├── Bookshelf_Mesh
│   │   │   └── Chair_x2
│   │   ├── Decor_A
│   │   │   ├── NeonSign_A                    ← Emissive "HAND" text quad
│   │   │   └── WallCandles_A [x3]
│   │   ├── AudioSource_Ambient_A             ← AudioSource: fireplace crackle loop
│   │   ├── Trigger_A                         ← Box Collider (Is Trigger = true)
│   │   │   └── [UdonBehaviour: ChamberTriggerRelay] chamberIndex=0
│   │   ├── DoorIndicator_A                   ← Small Quad on door frame (occupancy light)
│   │   └── VRC_PlayerAudioOverride_A         ← SDK component — see AudioZone setup
│   │
│   ├── Chamber_B  ["The Maester's Alcove"]
│   │   ├── Architecture_B  (same structure as A)
│   │   ├── Furniture_B
│   │   │   ├── RoundTable_Small
│   │   │   └── Stool_x4
│   │   ├── AudioSource_Ambient_B             ← AudioSource: soft wind / rain loop
│   │   ├── Trigger_B                         ← Box Collider
│   │   │   └── [UdonBehaviour: ChamberTriggerRelay] chamberIndex=1
│   │   ├── DoorIndicator_B
│   │   └── VRC_PlayerAudioOverride_B
│   │
│   └── Chamber_C  ["The Neon Sanctum"]
│       ├── Architecture_C
│       ├── Furniture_C
│       │   ├── Lounge_Couch_Mesh             ← Futuristic low couch (~600 tris)
│       │   └── HologramTable_Mesh            ← Transparent emissive mesh
│       ├── NeonDecor_C                       ← Dense neon strip lighting, teal/purple
│       ├── AudioSource_Ambient_C             ← AudioSource: soft synthwave pad loop
│       ├── Trigger_C
│       │   └── [UdonBehaviour: ChamberTriggerRelay] chamberIndex=2
│       ├── DoorIndicator_C
│       └── VRC_PlayerAudioOverride_C
│
├── SystemControllers                         ← Invisible management objects
│   ├── AudioZoneRoot
│   │   └── [UdonBehaviour: AudioZoneManager]
│   ├── LightingController
│   │   └── [UdonBehaviour: LightingMoodSwitcher]
│   ├── ProximityRoot
│   │   └── [UdonBehaviour: PlayerProximityTracker]
│   └── MoodPanel_UI [World-space Canvas near throne]
│       ├── Label_MoodPanel
│       ├── Button_Throne
│       ├── Button_Focus
│       ├── Button_Night
│       └── Text_CurrentMode
│
├── Lighting                                  ← All scene lights live here
│   ├── DirectionalLight_Moon                 ← Baked only, deep blue, intensity 0.1
│   ├── HeroLight_Throne                      ← Realtime + shadows (amber spot)
│   ├── HeroLight_Screen                      ← Realtime + shadows (blue rect)
│   ├── FillLights_Baked [x6]                ← Baked point lights
│   └── NeonAccents [x12]                    ← Baked point lights (purple/teal)
│
├── Spawn_Points                              ← VRCPlayerMods spawn locations
│   ├── Spawn_01 … Spawn_16                  ← 16 spawn points around the map table
│   └── Respawn_Center                        ← Fallback respawn
│
├── Navigation                                ← VRC NavMesh bake root
│   └── NavMeshSurface
│
└── Colliders_Invisible                       ← Non-rendered collision only
    ├── WorldBoundary                         ← Kill plane below floor
    ├── WallBlockers [merged mesh]            ← Prevent players walking through walls
    └── StepColliders [x8]                   ← Invisible ramps on steps
```

---

## Triangle Budget (Quest Target: ≤ 50,000 tris)

| Section             | Budget (tris) | Notes                                  |
|---------------------|---------------|----------------------------------------|
| WarRoom Architecture| 8,000         | Walls, floor, ceiling, pillars merged  |
| MapTable + Throne   | 2,500         | Key hero props                         |
| Seating             | 1,200         | 6 benches, shared material             |
| Video Screen        | 200           | Just quads                             |
| Gallery Corridor    | 3,000         | Architecture + 7 frames               |
| Cultural Figures    | 4,500         | 3 × 1,500 tris                         |
| Private Chambers    | 9,000         | 3 chambers × 3,000 tris each           |
| Neon Decor Quads    | 500           | Flat, no depth                         |
| Furniture misc      | 3,000         | Tables, stools, couch                  |
| Invisible colliders | 0             | MeshColliders with Mesh off             |
| UI Canvases         | 500           | Quads                                  |
| **Reserve / misc**  | **17,600**    | Texture planes, particles, SDK         |
| **TOTAL**           | **≤ 50,000**  |                                        |

---

## Material Slots (Quest target: ≤ 20 unique materials)

| Material Name         | Shader         | Texture(s)               | Used On                  |
|-----------------------|----------------|--------------------------|--------------------------|
| M_Stone_Dark          | Standard       | stone_dark_1024.png      | Walls, floor, pillars    |
| M_Stone_Worn          | Standard       | stone_worn_1024.png      | Exterior arches          |
| M_Wood_Dark           | Standard       | wood_dark_1024.png       | Table, benches           |
| M_Wood_Parquet        | Standard       | parquet_1024.png         | Gallery floor            |
| M_Iron_Throne         | Standard       | metal_rusty_1024.png     | Throne mesh              |
| M_Metal_NeonFrame     | Standard       | metal_brushed_1024.png   | Screen frame             |
| M_Screen_Video        | Unlit          | [VideoPlayer RenderTex]  | Screen quad              |
| M_Neon_Purple         | Unlit/Emissive | (solid colour)           | Purple neon strips       |
| M_Neon_Blue           | Unlit/Emissive | (solid colour)           | Blue neon strips         |
| M_Neon_Teal           | Unlit/Emissive | (solid colour)           | Teal neon strips         |
| M_Neon_Amber          | Unlit/Emissive | (solid colour)           | Amber neon strips        |
| M_Fabric_Cushion      | Standard       | fabric_dark_512.png      | Seat cushions            |
| M_Artwork_01…07       | Unlit          | artwork_XX_1024.png      | Gallery panel quads      |
| M_Figure_Dragonborn   | Standard       | figure_db_512.png        | Life-size figure         |
| M_Figure_Samurai      | Standard       | figure_sam_512.png       | Life-size figure         |
| M_Figure_Knight       | Standard       | figure_kn_512.png        | Life-size figure         |
| M_UI_Dark             | UI             | (none)                   | Canvas backgrounds       |
| M_DoorIndicator       | Unlit/Emissive | (solid colour, changed)  | Chamber door lights      |
| M_Ceiling_Plaster     | Standard       | plaster_512.png          | Gallery ceiling          |
| M_HologramTable       | Transparent    | (solid colour + alpha)   | Neon Sanctum table       |
```
Total: 20 materials (at limit — merge if you add more props)
```
