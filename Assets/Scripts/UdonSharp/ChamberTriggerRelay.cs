// =============================================================================
// ChamberTriggerRelay.cs
// VRChat UdonSharp — Iron Throne Neon World
// -----------------------------------------------------------------------------
// Thin relay script attached to each private chamber's trigger collider.
// Forwards OnPlayerTriggerEnter / Exit events to the central AudioZoneManager,
// passing its assigned chamberIndex so the manager knows which room fired.
//
// SETUP (repeat for each chamber):
//   1. Select the chamber trigger collider GameObject.
//   2. Add an UdonBehaviour component and assign this script.
//   3. Set chamberIndex to 0, 1, or 2 (matching the AudioZoneManager arrays).
//   4. Drag the AudioZoneManager GameObject into the audioZoneManager slot.
// =============================================================================

using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class ChamberTriggerRelay : UdonSharpBehaviour
{
    [Tooltip("Index of this chamber in the AudioZoneManager's arrays.")]
    public int chamberIndex = 0;

    [Tooltip("Drag the AudioZoneManager GameObject here.")]
    public AudioZoneManager audioZoneManager;

    public override void OnPlayerTriggerEnter(VRCPlayerApi player)
    {
        // Only react to the local player — other players' triggers run on their own clients.
        if (!player.isLocal) return;
        if (audioZoneManager != null)
            audioZoneManager.OnPlayerEnteredChamber(chamberIndex);
    }

    public override void OnPlayerTriggerExit(VRCPlayerApi player)
    {
        if (!player.isLocal) return;
        if (audioZoneManager != null)
            audioZoneManager.OnPlayerExitedChamber(chamberIndex);
    }
}
