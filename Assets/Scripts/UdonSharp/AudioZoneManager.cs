// =============================================================================
// AudioZoneManager.cs
// VRChat UdonSharp — Iron Throne Neon World
// -----------------------------------------------------------------------------
// Creates private audio "bubbles" for the 2–3 side chambers. When a player
// enters a chamber trigger, their voice volume from that chamber is boosted for
// others inside, while attenuating quickly outside — simulating a private room.
//
// HOW IT WORKS:
//   VRChat's native voice system already falls off with distance, but we
//   augment it by:
//     1. Reducing far-listener voice gain for players inside a chamber when
//        anyone outside the chamber references them.
//     2. Playing optional ambient audio per zone (fireplace crackle, etc.).
//
// SETUP PER CHAMBER:
//   1. Create a Box Collider (Is Trigger = true) sized to the chamber room.
//   2. Create a child AudioSource for ambient sound.
//   3. Assign the collider trigger zone and audio source in the Inspector array.
//   4. Attach ONE AudioZoneManager to an empty "AudioZoneRoot" GameObject.
//
// LIMITATIONS:
//   VRChat does not expose full voice volume control via Udon in all versions.
//   The distance-based falloff is achieved by placing VRC_PlayerAudioOverride
//   components on the trigger collider GameObjects, configured in the Editor.
//   This script handles ambient audio and zone state tracking.
// =============================================================================

using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.Udon;

// No network sync needed — zone state is purely local/per-player.
[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class AudioZoneManager : UdonSharpBehaviour
{
    // -------------------------------------------------------------------------
    // Data structures
    // UdonSharp doesn't support nested classes so we use parallel arrays.
    // -------------------------------------------------------------------------

    [Header("Chambers (parallel arrays — must be same length)")]
    [Tooltip("Root GameObjects for each chamber. Used for future expansion.")]
    public GameObject[] chamberRoots;

    [Tooltip("The trigger collider GameObject for each chamber (must have Box/Sphere Collider with Is Trigger = true).")]
    public GameObject[] chamberTriggers;

    [Tooltip("AudioSource for each chamber's ambient loop (fireplace, dripping water, hum).")]
    public AudioSource[] chamberAmbientAudio;

    [Tooltip("Volume the ambient audio fades TO when the local player is inside the chamber.")]
    [Range(0f, 1f)] public float insideAmbientVolume = 0.45f;

    [Tooltip("Volume the ambient audio fades TO when the local player is outside the chamber.")]
    [Range(0f, 1f)] public float outsideAmbientVolume = 0.08f;

    [Tooltip("Speed of ambient audio fade (lerp speed per second).")]
    [Range(0.5f, 5f)] public float audioFadeSpeed = 2f;

    [Header("Chamber Name Plates (optional)")]
    [Tooltip("Name of each chamber shown in debug/UI. e.g. 'Chamber of the Hand'.")]
    public string[] chamberNames;

    // -------------------------------------------------------------------------
    // Local state
    // -------------------------------------------------------------------------

    // Which chamber index the local player is currently inside (-1 = none).
    private int _localPlayerChamberIndex = -1;

    // Target volume for each ambient audio source (set on enter/exit).
    private float[] _ambientTargetVolumes;

    // -------------------------------------------------------------------------
    // Unity lifecycle
    // -------------------------------------------------------------------------

    void Start()
    {
        int count = chamberAmbientAudio != null ? chamberAmbientAudio.Length : 0;
        _ambientTargetVolumes = new float[count];

        // Start all ambient audio at outside volume.
        for (int i = 0; i < count; i++)
        {
            _ambientTargetVolumes[i] = outsideAmbientVolume;
            if (chamberAmbientAudio[i] != null)
            {
                chamberAmbientAudio[i].volume = outsideAmbientVolume;
                chamberAmbientAudio[i].loop   = true;
                chamberAmbientAudio[i].spatialBlend = 0f;    // 2D so it's heard in the room, not positioned
                if (!chamberAmbientAudio[i].isPlaying) chamberAmbientAudio[i].Play();
            }
        }
    }

    void Update()
    {
        // Fade ambient audio toward targets.
        if (chamberAmbientAudio == null) return;
        float t = Time.deltaTime * audioFadeSpeed;
        for (int i = 0; i < chamberAmbientAudio.Length; i++)
        {
            var src = chamberAmbientAudio[i];
            if (src == null) continue;
            src.volume = Mathf.Lerp(src.volume, _ambientTargetVolumes[i], t);
        }
    }

    // -------------------------------------------------------------------------
    // Trigger events — called by Unity when the local player enters/exits
    // the chamber trigger colliders.
    //
    // NOTE: Each chamber trigger's collider component must have this script
    // (or a thin relay UdonBehaviour) set as the trigger receiver.
    // Simplest approach: Add a separate "ChamberTriggerRelay" script on each
    // trigger that calls back to this manager with the chamber index.
    // -------------------------------------------------------------------------

    /// <summary>
    /// Call this from each chamber trigger's OnPlayerTriggerEnter.
    /// chamberIndex must match the index in the arrays above.
    /// </summary>
    public void OnPlayerEnteredChamber(int chamberIndex)
    {
        if (!_IsValidIndex(chamberIndex)) return;
        _localPlayerChamberIndex = chamberIndex;

        // Boost ambient for the chamber we entered; reduce all others.
        for (int i = 0; i < _ambientTargetVolumes.Length; i++)
        {
            _ambientTargetVolumes[i] = (i == chamberIndex)
                ? insideAmbientVolume
                : outsideAmbientVolume * 0.5f;  // muffle other rooms more when inside one
        }

        string name = _GetChamberName(chamberIndex);
        Debug.Log($"[AudioZoneManager] Local player entered {name}");
    }

    /// <summary>
    /// Call this from each chamber trigger's OnPlayerTriggerExit.
    /// </summary>
    public void OnPlayerExitedChamber(int chamberIndex)
    {
        if (_localPlayerChamberIndex != chamberIndex) return;
        _localPlayerChamberIndex = -1;

        // Restore all ambient audio to outside level.
        for (int i = 0; i < _ambientTargetVolumes.Length; i++)
            _ambientTargetVolumes[i] = outsideAmbientVolume;

        string name = _GetChamberName(chamberIndex);
        Debug.Log($"[AudioZoneManager] Local player exited {name}");
    }

    // -------------------------------------------------------------------------
    // Public query helpers — other scripts can ask if the local player is in a room
    // -------------------------------------------------------------------------

    /// <summary>Returns true if the local player is inside any chamber.</summary>
    public bool IsInAnyChamber() => _localPlayerChamberIndex >= 0;

    /// <summary>Returns the index of the chamber the local player is in (-1 if none).</summary>
    public int GetCurrentChamberIndex() => _localPlayerChamberIndex;

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private bool _IsValidIndex(int i)
    {
        return chamberAmbientAudio != null && i >= 0 && i < chamberAmbientAudio.Length;
    }

    private string _GetChamberName(int i)
    {
        if (chamberNames != null && i < chamberNames.Length && !string.IsNullOrEmpty(chamberNames[i]))
            return chamberNames[i];
        return $"Chamber {i + 1}";
    }
}
