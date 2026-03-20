# Iron Throne Neon — VRChat World

> Game of Thrones medieval grandeur fused with futuristic cyberpunk.
> Dark stone, neon purple/blue/amber lighting, cinematic war room vibes.

**Platform:** Meta Quest + PC VRChat
**SDK:** VRChat SDK3 · Unity 2022.3 LTS · UdonSharp 1.x
**Capacity:** 8–16 players · Quest-optimised (≤ 50k tris)

---

## World Layout

```
Iron Throne Neon
├── Central War Room        — map table, throne, group seating, synced video wall
├── Gallery Hall            — 7-panel rotating artwork, 3 life-size cultural figures
└── Private Chambers (×3)  — audio-isolated side rooms with ambient sound
    ├── The Hand's Study
    ├── The Maester's Alcove
    └── The Neon Sanctum
```

---

## Features

| Feature | Script | Description |
|---------|--------|-------------|
| Synced Video Player | `SyncedVideoPlayer.cs` | Load YouTube / streams. Synced play/pause/seek across all clients. |
| Rotating Gallery | `GalleryRotator.cs` | Next/Prev buttons cycle 7 artwork panels. Auto-rotate optional. |
| Lighting Mood Switcher | `LightingMoodSwitcher.cs` | **Throne** (amber), **Focus** (blue-white), **Night** (neon purple). Smooth transitions, fully synced. |
| Audio Zones | `AudioZoneManager.cs` + `ChamberTriggerRelay.cs` | Ambient audio fades in/out as you enter/leave chambers. Private conversation isolation. |
| Chamber Occupancy | `PlayerProximityTracker.cs` | Door indicator lights show whether each private room is in use. |
| AI NPC (Bridge) | `NPCChatBubble.cs` + Python companion | Talkable AI character via Claude API + Whisper STT + TTS. See AI Roadmap doc. |

---

## File Structure

```
for-my-queen/
├── Assets/
│   ├── Scripts/UdonSharp/
│   │   ├── SyncedVideoPlayer.cs
│   │   ├── GalleryRotator.cs
│   │   ├── LightingMoodSwitcher.cs
│   │   ├── AudioZoneManager.cs
│   │   ├── ChamberTriggerRelay.cs
│   │   ├── PlayerProximityTracker.cs
│   │   └── NPCChatBubble.cs
│   ├── Scenes/          ← place IronThroneNeon.unity here
│   ├── Materials/       ← 20 materials (see SceneHierarchy.md)
│   ├── Textures/        ← all 1024² max, ASTC compressed
│   └── Prefabs/         ← reusable chamber prefabs
└── Documentation/
    ├── SceneHierarchy.md           ← full Unity scene tree + tri/material budgets
    ├── SetupInstructions.md        ← beginner step-by-step build guide (32 steps)
    ├── QuestOptimizationChecklist.md ← every optimisation needed for Good rating
    └── AICharacter_Roadmap.md      ← AI NPC: what works now, what's missing, code included
```

---

## Quick Start

1. Install Unity 2022.3 LTS + VRChat Creator Companion — see `SetupInstructions.md` Phase 1
2. Copy scripts from `Assets/Scripts/UdonSharp/` into your Unity project
3. Build the scene following the hierarchy in `SceneHierarchy.md`
4. Wire up scripts per `SetupInstructions.md` Phase 7
5. Run the Quest optimization checklist before upload
6. Upload via VRChat SDK Control Panel (separate PC + Quest builds)

---

## AI Character (Optional)

To add a talking AI companion (Maester Cypher):

1. Read `Documentation/AICharacter_Roadmap.md`
2. Add `NPCChatBubble.cs` to an NPC GameObject in the scene
3. Run `ai_companion.py` (in the roadmap doc) on the host PC with your Claude API key
4. The NPC will listen via Whisper, respond via Claude, and speak via TTS

**Requires:** Host running on PC (not Quest-only), Python 3.10+, Claude API key

---

## Quest Performance Targets

| Metric | Target | Limit for "Good" |
|--------|--------|-----------------|
| Triangles | ≤ 50,000 | 100,000 |
| Materials | ≤ 20 | 20 |
| Realtime Lights | 0–2 | 1 |
| Draw Calls | ≤ 150 | 200 |
| Texture max | 1024² ASTC | 1024² |

Full checklist: `Documentation/QuestOptimizationChecklist.md`

---

## Lighting Moods

| Mode | Palette | Use Case |
|------|---------|----------|
| **Throne** | Deep amber, gold torchlight, ember neon | Default — dramatic, cinematic |
| **Focus** | Cool blue-white, electric blue accents | Meetings, presentations, video watching |
| **Night** | Neon purple fill, teal accents, deep shadows | After-dark vibes, cyberpunk immersion |

All three modes transition smoothly and sync instantly to all players via `LightingMoodSwitcher`.
