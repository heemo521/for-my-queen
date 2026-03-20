// =============================================================================
// GalleryRotator.cs
// VRChat UdonSharp — Iron Throne Neon World
// -----------------------------------------------------------------------------
// Manages a gallery of artwork panels that rotate/slide to show different images.
// The active panel index is synced so all players see the same artwork.
//
// SETUP:
//   1. Create a parent GameObject called "GalleryPanel" in the scene.
//   2. As children, add one child per artwork — each child is a Quad with a
//      material whose _MainTex is the artwork texture.
//   3. Assign all child GameObjects to the `artworkPanels` array in the Inspector.
//   4. Optionally assign Next / Prev buttons and a title Text.
//   5. Attach this script to the GalleryPanel parent.
//   6. Add a VRC_SyncedObject component to the same GameObject.
//
// ANIMATION:
//   Panels not currently active are hidden (SetActive false) for Quest perf.
//   A simple lerp slides the active panel in from the side.
// =============================================================================

using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDKBase;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
public class GalleryRotator : UdonSharpBehaviour
{
    // -------------------------------------------------------------------------
    // Inspector references
    // -------------------------------------------------------------------------

    [Header("Gallery Panels")]
    [Tooltip("Array of GameObjects, one per artwork. Each should have a MeshRenderer with the artwork texture.")]
    public GameObject[] artworkPanels;

    [Tooltip("Display names shown in the titleText when each panel is active.")]
    public string[] artworkTitles;

    [Header("Auto-Rotate")]
    [Tooltip("If true, the gallery advances on its own every AutoRotateInterval seconds.")]
    public bool autoRotate = false;

    [Tooltip("Seconds between automatic advances (only used when autoRotate is true).")]
    public float autoRotateInterval = 15f;

    [Header("UI")]
    [Tooltip("Button to go to next artwork. Wire OnClick → OnNextPressed.")]
    public Button nextButton;

    [Tooltip("Button to go to previous artwork. Wire OnClick → OnPrevPressed.")]
    public Button prevButton;

    [Tooltip("Text field that shows the current artwork title.")]
    public Text titleText;

    [Tooltip("Text showing e.g. '3 / 7'.")]
    public Text indexText;

    [Header("Transition")]
    [Tooltip("How fast panels slide in (lerp speed).")]
    public float transitionSpeed = 6f;

    [Tooltip("Distance (meters) panels slide from when entering.")]
    public float slideDistance = 0.5f;

    // -------------------------------------------------------------------------
    // Synced state
    // -------------------------------------------------------------------------

    [UdonSynced] private int _syncedIndex = 0;

    // -------------------------------------------------------------------------
    // Local state
    // -------------------------------------------------------------------------

    private int   _localIndex   = -1;
    private float _autoTimer;
    private bool  _transitioning;
    private Vector3 _panelTargetPos;
    private Vector3 _panelStartPos;
    private float   _transitionT;

    // -------------------------------------------------------------------------
    // Unity lifecycle
    // -------------------------------------------------------------------------

    void Start()
    {
        if (artworkPanels == null || artworkPanels.Length == 0)
        {
            Debug.LogError("[GalleryRotator] No artwork panels assigned!");
            return;
        }

        // Hide all panels initially; _ShowPanel will activate the right one.
        foreach (var p in artworkPanels) if (p != null) p.SetActive(false);

        _ShowPanel(0);
        _autoTimer = autoRotateInterval;
    }

    void Update()
    {
        // Handle auto-rotate (only owner ticks the timer to avoid drift).
        if (autoRotate && Networking.IsOwner(gameObject))
        {
            _autoTimer -= Time.deltaTime;
            if (_autoTimer <= 0f)
            {
                _autoTimer = autoRotateInterval;
                _AdvanceTo((_syncedIndex + 1) % artworkPanels.Length);
            }
        }

        // Smooth slide-in transition.
        if (_transitioning)
        {
            _transitionT += Time.deltaTime * transitionSpeed;
            var panel = artworkPanels[_localIndex];
            if (panel != null)
            {
                panel.transform.localPosition = Vector3.Lerp(_panelStartPos, _panelTargetPos, _transitionT);
            }
            if (_transitionT >= 1f) _transitioning = false;
        }
    }

    // -------------------------------------------------------------------------
    // Button callbacks
    // -------------------------------------------------------------------------

    /// <summary>Wire to "Next" button OnClick.</summary>
    public void OnNextPressed()
    {
        if (artworkPanels == null || artworkPanels.Length == 0) return;
        Networking.SetOwner(Networking.LocalPlayer, gameObject);
        _AdvanceTo((_syncedIndex + 1) % artworkPanels.Length);
    }

    /// <summary>Wire to "Prev" button OnClick.</summary>
    public void OnPrevPressed()
    {
        if (artworkPanels == null || artworkPanels.Length == 0) return;
        Networking.SetOwner(Networking.LocalPlayer, gameObject);
        int prev = _syncedIndex - 1;
        if (prev < 0) prev = artworkPanels.Length - 1;
        _AdvanceTo(prev);
    }

    // -------------------------------------------------------------------------
    // Network sync
    // -------------------------------------------------------------------------

    public override void OnDeserialization()
    {
        if (_syncedIndex != _localIndex)
        {
            _ShowPanel(_syncedIndex);
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void _AdvanceTo(int index)
    {
        _syncedIndex = index;
        RequestSerialization();
        _ShowPanel(index);
    }

    private void _ShowPanel(int index)
    {
        if (artworkPanels == null || artworkPanels.Length == 0) return;

        // Clamp index to valid range.
        index = Mathf.Clamp(index, 0, artworkPanels.Length - 1);

        // Hide the old panel.
        if (_localIndex >= 0 && _localIndex < artworkPanels.Length)
        {
            var old = artworkPanels[_localIndex];
            if (old != null) old.SetActive(false);
        }

        _localIndex = index;
        var panel = artworkPanels[index];
        if (panel == null) return;

        panel.SetActive(true);

        // Set up slide-in transition.
        _panelTargetPos      = Vector3.zero;                           // resting position (local)
        _panelStartPos       = new Vector3(slideDistance, 0f, 0f);    // enter from the right
        panel.transform.localPosition = _panelStartPos;
        _transitionT  = 0f;
        _transitioning = true;

        // Update UI labels.
        if (titleText != null)
        {
            titleText.text = (artworkTitles != null && index < artworkTitles.Length)
                ? artworkTitles[index]
                : $"Artwork {index + 1}";
        }
        if (indexText != null)
        {
            indexText.text = $"{index + 1} / {artworkPanels.Length}";
        }
    }
}
