// =============================================================================
// PlayerProximityTracker.cs
// VRChat UdonSharp — Iron Throne Neon World
// -----------------------------------------------------------------------------
// Shows a subtle "occupied" indicator on private chamber doors when players
// are inside. Useful so players in the main war room know a chamber is in use.
//
// Uses a synced bit-field (one bit per chamber) so all clients see the
// same occupied state without polling positions every frame.
//
// SETUP:
//   1. Attach to an empty "ProximityRoot" GameObject with a VRC_SyncedObject.
//   2. Assign chamber triggers (same ones used by ChamberTriggerRelay).
//   3. Assign indicator renderers — one per chamber. These should be small
//      Quad or light objects on the door frame. The script toggles their
//      enabled state (on = occupied / off = empty).
//   4. Set the chamber colours for occupied vs. vacant states.
// =============================================================================

using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
public class PlayerProximityTracker : UdonSharpBehaviour
{
    // -------------------------------------------------------------------------
    // Inspector references
    // -------------------------------------------------------------------------

    [Header("Chambers")]
    [Tooltip("Number of chambers (2 or 3). Must match array lengths below.")]
    public int chamberCount = 3;

    [Tooltip("Indicator light/renderer on each chamber door — shown when occupied.")]
    public Renderer[] doorIndicators;

    [Tooltip("Material property name for emission colour tint.")]
    public string emissionProperty = "_EmissionColor";

    [Header("Indicator Colours")]
    [Tooltip("Colour shown when the chamber is empty (green-ish, dim).")]
    public Color vacantColour   = new Color(0.05f, 0.5f, 0.1f, 1f);

    [Tooltip("Colour shown when the chamber is occupied (amber warning).")]
    public Color occupiedColour = new Color(1.0f, 0.5f, 0.0f, 1f);

    [Tooltip("Multiplier so indicators glow (HDR).")]
    [Range(1f, 4f)] public float emissionBrightness = 2f;

    // -------------------------------------------------------------------------
    // Synced state
    // Each bit in _occupancyMask corresponds to one chamber (bit 0 = chamber 0).
    // Up to 32 chambers supported, but we only use chamberCount bits.
    // -------------------------------------------------------------------------

    [UdonSynced] private int _occupancyMask = 0;

    // -------------------------------------------------------------------------
    // Local tracking — how many local players are in each chamber
    // (we count because multiple players can be in one room)
    // -------------------------------------------------------------------------

    private int[] _localPlayerCount;   // players inside each chamber (local view)

    // -------------------------------------------------------------------------
    // Unity lifecycle
    // -------------------------------------------------------------------------

    void Start()
    {
        _localPlayerCount = new int[chamberCount];
        _RefreshIndicators();
    }

    // -------------------------------------------------------------------------
    // Called by ChamberTriggerRelay on player enter/exit
    // -------------------------------------------------------------------------

    public void OnAnyPlayerEnteredChamber(int chamberIndex, VRCPlayerApi player)
    {
        if (chamberIndex < 0 || chamberIndex >= chamberCount) return;

        _localPlayerCount[chamberIndex]++;
        _UpdateMaskBit(chamberIndex, true);
        _RefreshIndicators();
    }

    public void OnAnyPlayerExitedChamber(int chamberIndex, VRCPlayerApi player)
    {
        if (chamberIndex < 0 || chamberIndex >= chamberCount) return;

        _localPlayerCount[chamberIndex] = Mathf.Max(0, _localPlayerCount[chamberIndex] - 1);
        bool stillOccupied = _localPlayerCount[chamberIndex] > 0;
        _UpdateMaskBit(chamberIndex, stillOccupied);
        _RefreshIndicators();
    }

    // -------------------------------------------------------------------------
    // Network sync
    // -------------------------------------------------------------------------

    public override void OnDeserialization()
    {
        _RefreshIndicators();
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /// <summary>Sets or clears a single bit in _occupancyMask and broadcasts.</summary>
    private void _UpdateMaskBit(int chamber, bool occupied)
    {
        Networking.SetOwner(Networking.LocalPlayer, gameObject);

        if (occupied)
            _occupancyMask |= (1 << chamber);
        else
            _occupancyMask &= ~(1 << chamber);

        RequestSerialization();
    }

    /// <summary>Updates all door indicator visuals based on the current mask.</summary>
    private void _RefreshIndicators()
    {
        if (doorIndicators == null) return;

        for (int i = 0; i < doorIndicators.Length && i < chamberCount; i++)
        {
            var r = doorIndicators[i];
            if (r == null) continue;

            bool occupied = (_occupancyMask & (1 << i)) != 0;
            Color c = (occupied ? occupiedColour : vacantColour) * emissionBrightness;
            r.material.SetColor(emissionProperty, c);
            r.enabled = true;
        }
    }
}
