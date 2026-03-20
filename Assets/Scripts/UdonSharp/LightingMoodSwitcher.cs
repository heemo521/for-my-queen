// =============================================================================
// LightingMoodSwitcher.cs
// VRChat UdonSharp — Iron Throne Neon World
// -----------------------------------------------------------------------------
// Three synced lighting presets that paint the war room in different moods:
//
//   0 — THRONE MODE  : Deep amber/gold, warm torchlight, dramatic shadows
//   1 — FOCUS MODE   : Cool blue-white, reduced drama, work/meeting friendly
//   2 — NIGHT MODE   : Deep neon purple/teal, minimal fill, cyberpunk noir
//
// SETUP:
//   1. Create a GameObject called "LightingController" and attach this script.
//   2. Add a VRC_SyncedObject to the same object.
//   3. In the Inspector, populate the three Light arrays with scene lights
//      (point lights, spot lights, area lights) for each zone.
//   4. Optionally supply an AmbientPresets array for RenderSettings.ambientLight.
//   5. Wire the three mood buttons' OnClick events to the corresponding methods.
//
// QUEST NOTE:
//   Realtime lights are expensive. Cap at 1–2 realtime shadow-casting lights.
//   Everything else should use Baked + Light Probes. This script toggles colours
//   but respects the baked/realtime flag you set per-light in the Editor.
// =============================================================================

using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDKBase;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
public class LightingMoodSwitcher : UdonSharpBehaviour
{
    // -------------------------------------------------------------------------
    // Inspector references — lights to control
    // -------------------------------------------------------------------------

    [Header("Scene Lights")]
    [Tooltip("All lights that are part of the war-room ambient fill (torches, sconces, etc.).")]
    public Light[] ambientLights;

    [Tooltip("The 1–2 hero realtime lights with shadows (e.g., throne key light).")]
    public Light[] heroLights;

    [Tooltip("Neon strip / LED accent lights (point lights along walls, under panels).")]
    public Light[] neonAccentLights;

    [Header("Optional Emission Materials")]
    [Tooltip("Materials with emission that should be tinted per mood (neon strips, screen glow).")]
    public Material[] emissiveMaterials;

    [Header("UI Buttons")]
    [Tooltip("Button for Throne Mode. Wire OnClick → OnThroneMode.")]
    public Button throneButton;

    [Tooltip("Button for Focus Mode. Wire OnClick → OnFocusMode.")]
    public Button focusButton;

    [Tooltip("Button for Night Mode. Wire OnClick → OnNightMode.")]
    public Button nightButton;

    [Tooltip("Text label that shows the current mode name.")]
    public Text modeLabel;

    // -------------------------------------------------------------------------
    // Colour presets per mood
    // (ambient fill, hero key, neon accent, emissive glow, ambient sky colour)
    // -------------------------------------------------------------------------

    [Header("Throne Mode — amber/gold torchlight")]
    public Color throneFill     = new Color(0.80f, 0.55f, 0.20f, 1f);   // warm amber
    public Color throneHero     = new Color(1.00f, 0.75f, 0.35f, 1f);   // gold key
    public Color throneNeon     = new Color(0.90f, 0.50f, 0.05f, 1f);   // ember orange
    public Color throneEmissive = new Color(1.00f, 0.60f, 0.10f, 1f);
    public Color throneAmbient  = new Color(0.10f, 0.06f, 0.02f, 1f);
    [Range(0f, 3f)] public float throneHeroIntensity   = 1.4f;
    [Range(0f, 3f)] public float throneFillIntensity   = 0.6f;
    [Range(0f, 3f)] public float throneNeonIntensity   = 0.8f;

    [Header("Focus Mode — cool blue-white")]
    public Color focusFill      = new Color(0.70f, 0.80f, 1.00f, 1f);   // soft blue-white
    public Color focusHero      = new Color(0.85f, 0.92f, 1.00f, 1f);   // near-white
    public Color focusNeon      = new Color(0.30f, 0.60f, 1.00f, 1f);   // electric blue
    public Color focusEmissive  = new Color(0.20f, 0.50f, 0.90f, 1f);
    public Color focusAmbient   = new Color(0.06f, 0.08f, 0.14f, 1f);
    [Range(0f, 3f)] public float focusHeroIntensity    = 1.8f;
    [Range(0f, 3f)] public float focusFillIntensity    = 1.0f;
    [Range(0f, 3f)] public float focusNeonIntensity    = 0.5f;

    [Header("Night Mode — neon purple/teal noir")]
    public Color nightFill      = new Color(0.20f, 0.05f, 0.35f, 1f);   // deep purple
    public Color nightHero      = new Color(0.55f, 0.10f, 0.80f, 1f);   // violet
    public Color nightNeon      = new Color(0.05f, 0.85f, 0.75f, 1f);   // neon teal
    public Color nightEmissive  = new Color(0.10f, 0.90f, 0.80f, 1f);
    public Color nightAmbient   = new Color(0.02f, 0.01f, 0.06f, 1f);
    [Range(0f, 3f)] public float nightHeroIntensity    = 0.8f;
    [Range(0f, 3f)] public float nightFillIntensity    = 0.3f;
    [Range(0f, 3f)] public float nightNeonIntensity    = 1.6f;

    [Header("Transition")]
    [Tooltip("How fast the lights lerp between colours (units per second).")]
    [Range(0.5f, 8f)] public float transitionSpeed = 2.5f;

    // -------------------------------------------------------------------------
    // Synced state
    // -------------------------------------------------------------------------

    [UdonSynced] private int _syncedMode = 0;   // 0=Throne, 1=Focus, 2=Night

    // -------------------------------------------------------------------------
    // Local state for smooth transitions
    // -------------------------------------------------------------------------

    private int     _localMode = -1;

    // Current lerp targets — set once when mode changes, lerped toward each frame.
    private Color   _targetFill, _targetHero, _targetNeon, _targetEmissive, _targetAmbient;
    private float   _targetHeroIntensity, _targetFillIntensity, _targetNeonIntensity;

    private static readonly string[] MODE_NAMES = { "Throne", "Focus", "Night" };

    // -------------------------------------------------------------------------
    // Unity lifecycle
    // -------------------------------------------------------------------------

    void Start()
    {
        // Apply Throne mode immediately without transition.
        _ApplyModeImmediate(0);
    }

    void Update()
    {
        // Smoothly lerp all lights toward target values each frame.
        float t = Time.deltaTime * transitionSpeed;

        if (ambientLights != null)
            foreach (var l in ambientLights) if (l)
            {
                l.color     = Color.Lerp(l.color, _targetFill, t);
                l.intensity = Mathf.Lerp(l.intensity, _targetFillIntensity, t);
            }

        if (heroLights != null)
            foreach (var l in heroLights) if (l)
            {
                l.color     = Color.Lerp(l.color, _targetHero, t);
                l.intensity = Mathf.Lerp(l.intensity, _targetHeroIntensity, t);
            }

        if (neonAccentLights != null)
            foreach (var l in neonAccentLights) if (l)
            {
                l.color     = Color.Lerp(l.color, _targetNeon, t);
                l.intensity = Mathf.Lerp(l.intensity, _targetNeonIntensity, t);
            }

        if (emissiveMaterials != null)
            foreach (var m in emissiveMaterials) if (m)
                m.SetColor("_EmissionColor", Color.Lerp(m.GetColor("_EmissionColor"), _targetEmissive, t));

        RenderSettings.ambientLight = Color.Lerp(RenderSettings.ambientLight, _targetAmbient, t);
    }

    // -------------------------------------------------------------------------
    // Button callbacks — wire these to UI Button OnClick events
    // -------------------------------------------------------------------------

    public void OnThroneMode() { _SetMode(0); }
    public void OnFocusMode()  { _SetMode(1); }
    public void OnNightMode()  { _SetMode(2); }

    // -------------------------------------------------------------------------
    // Network sync
    // -------------------------------------------------------------------------

    public override void OnDeserialization()
    {
        if (_syncedMode != _localMode) _SetTargets(_syncedMode);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void _SetMode(int mode)
    {
        Networking.SetOwner(Networking.LocalPlayer, gameObject);
        _syncedMode = mode;
        RequestSerialization();
        _SetTargets(mode);
    }

    /// <summary>Update lerp targets (smooth transition will handle the actual colour change).</summary>
    private void _SetTargets(int mode)
    {
        _localMode = mode;

        switch (mode)
        {
            case 1: // Focus
                _targetFill          = focusFill;
                _targetHero          = focusHero;
                _targetNeon          = focusNeon;
                _targetEmissive      = focusEmissive;
                _targetAmbient       = focusAmbient;
                _targetHeroIntensity = focusHeroIntensity;
                _targetFillIntensity = focusFillIntensity;
                _targetNeonIntensity = focusNeonIntensity;
                break;

            case 2: // Night
                _targetFill          = nightFill;
                _targetHero          = nightHero;
                _targetNeon          = nightNeon;
                _targetEmissive      = nightEmissive;
                _targetAmbient       = nightAmbient;
                _targetHeroIntensity = nightHeroIntensity;
                _targetFillIntensity = nightFillIntensity;
                _targetNeonIntensity = nightNeonIntensity;
                break;

            default: // Throne (0)
                _targetFill          = throneFill;
                _targetHero          = throneHero;
                _targetNeon          = throneNeon;
                _targetEmissive      = throneEmissive;
                _targetAmbient       = throneAmbient;
                _targetHeroIntensity = throneHeroIntensity;
                _targetFillIntensity = throneFillIntensity;
                _targetNeonIntensity = throneNeonIntensity;
                break;
        }

        if (modeLabel != null && mode < MODE_NAMES.Length)
            modeLabel.text = MODE_NAMES[mode];

        // Highlight the active button.
        _UpdateButtonStates(mode);
    }

    /// <summary>Instant apply (no lerp) — used on Start to avoid black flash.</summary>
    private void _ApplyModeImmediate(int mode)
    {
        _SetTargets(mode);

        // Snap all values immediately.
        if (ambientLights != null)
            foreach (var l in ambientLights) if (l) { l.color = _targetFill; l.intensity = _targetFillIntensity; }
        if (heroLights != null)
            foreach (var l in heroLights) if (l) { l.color = _targetHero; l.intensity = _targetHeroIntensity; }
        if (neonAccentLights != null)
            foreach (var l in neonAccentLights) if (l) { l.color = _targetNeon; l.intensity = _targetNeonIntensity; }
        if (emissiveMaterials != null)
            foreach (var m in emissiveMaterials) if (m) m.SetColor("_EmissionColor", _targetEmissive);

        RenderSettings.ambientLight = _targetAmbient;
    }

    private void _UpdateButtonStates(int activeMode)
    {
        // Visually indicate which mode is active by toggling interactable.
        if (throneButton) throneButton.interactable = (activeMode != 0);
        if (focusButton)  focusButton.interactable  = (activeMode != 1);
        if (nightButton)  nightButton.interactable  = (activeMode != 2);
    }
}
