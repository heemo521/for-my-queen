// =============================================================================
// SyncedVideoPlayer.cs
// VRChat UdonSharp — Iron Throne Neon World
// -----------------------------------------------------------------------------
// Provides a network-synced video player supporting YouTube URLs and direct
// stream links. One player is designated "master" (world owner or first joiner)
// and can load / pause / seek. All other clients mirror state automatically.
//
// REQUIREMENTS:
//   • Attach to a GameObject that also has a VRC_SyncedObject component.
//   • Assign a VRCUnityVideoPlayer or VRCAVProVideoPlayer in the Inspector.
//   • Hook up the UI buttons (Play, Pause, Stop, URL input field) in Inspector.
//   • Works with UdonSharp 1.x and VRChat SDK3.
// =============================================================================

using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDK3.Components.Video;
using VRC.SDK3.Video.Components;
using VRC.SDK3.Video.Components.Base;
using VRC.SDKBase;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
public class SyncedVideoPlayer : UdonSharpBehaviour
{
    // -------------------------------------------------------------------------
    // Inspector-assigned references
    // -------------------------------------------------------------------------

    [Header("Video Player")]
    [Tooltip("Drag the VRCUnityVideoPlayer or VRCAVProVideoPlayer component here.")]
    public BaseVRCVideoPlayer videoPlayer;

    [Header("UI Elements")]
    [Tooltip("InputField where users type or paste a YouTube/stream URL.")]
    public InputField urlInputField;

    [Tooltip("Button that loads the URL from the input field.")]
    public Button loadButton;

    [Tooltip("Button to play / resume.")]
    public Button playButton;

    [Tooltip("Button to pause.")]
    public Button pauseButton;

    [Tooltip("Button to stop and clear.")]
    public Button stopButton;

    [Tooltip("Text element that shows current status (Loading… / Playing / Paused / Error).")]
    public Text statusText;

    [Tooltip("Slider for seek / progress display.")]
    public Slider progressSlider;

    [Header("Screen")]
    [Tooltip("Renderer whose material will receive the video RenderTexture.")]
    public Renderer screenRenderer;

    [Tooltip("Material property name for the video texture (usually _EmissionMap or _MainTex).")]
    public string texturePropertyName = "_EmissionMap";

    // -------------------------------------------------------------------------
    // Synced variables — kept identical across all clients
    // -------------------------------------------------------------------------

    [UdonSynced] private VRCUrl _syncedUrl = VRCUrl.Empty;
    [UdonSynced] private bool   _syncedPlaying;
    [UdonSynced] private float  _syncedTimestamp;   // seconds into video
    [UdonSynced] private int    _syncedVersion;     // incremented each load to force re-sync

    // -------------------------------------------------------------------------
    // Local state
    // -------------------------------------------------------------------------

    private bool  _isLoading;
    private int   _localVersion = -1;
    private float _lastSyncTime;

    // Sync the timestamp every N seconds to keep clients aligned.
    private const float SYNC_INTERVAL = 5f;

    // -------------------------------------------------------------------------
    // Unity lifecycle
    // -------------------------------------------------------------------------

    void Start()
    {
        // Register button listeners (UdonSharp uses SendCustomEvent for OnClick).
        // Wire these up in the Inspector instead if preferred.
        _UpdateUI();
    }

    void Update()
    {
        if (!_isLoading && videoPlayer != null && videoPlayer.IsPlaying)
        {
            // Update the progress slider locally every frame.
            if (progressSlider != null && videoPlayer.GetDuration() > 0f)
            {
                progressSlider.value = videoPlayer.GetTime() / videoPlayer.GetDuration();
            }

            // Periodically broadcast our timestamp so late-joiners can catch up.
            if (Networking.IsOwner(gameObject) && Time.time - _lastSyncTime > SYNC_INTERVAL)
            {
                _syncedTimestamp = videoPlayer.GetTime();
                RequestSerialization();
                _lastSyncTime = Time.time;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Public button callbacks — call these from UI Button OnClick events
    // -------------------------------------------------------------------------

    /// <summary>Called by the Load button. Takes ownership and broadcasts URL.</summary>
    public void OnLoadButtonPressed()
    {
        if (urlInputField == null || string.IsNullOrEmpty(urlInputField.text)) return;

        // Claim ownership so we can write synced vars.
        Networking.SetOwner(Networking.LocalPlayer, gameObject);

        _syncedUrl       = new VRCUrl(urlInputField.text.Trim());
        _syncedPlaying   = true;
        _syncedTimestamp = 0f;
        _syncedVersion++;

        RequestSerialization();
        _LoadVideo();
    }

    /// <summary>Called by the Play button.</summary>
    public void OnPlayButtonPressed()
    {
        if (!Networking.IsOwner(gameObject)) return;
        _syncedPlaying = true;
        RequestSerialization();
        videoPlayer.Play();
        _UpdateUI();
    }

    /// <summary>Called by the Pause button.</summary>
    public void OnPauseButtonPressed()
    {
        if (!Networking.IsOwner(gameObject)) return;
        _syncedPlaying = false;
        _syncedTimestamp = videoPlayer.GetTime();
        RequestSerialization();
        videoPlayer.Pause();
        _UpdateUI();
    }

    /// <summary>Called by the Stop button.</summary>
    public void OnStopButtonPressed()
    {
        if (!Networking.IsOwner(gameObject)) return;
        _syncedPlaying   = false;
        _syncedTimestamp = 0f;
        _syncedUrl       = VRCUrl.Empty;
        _syncedVersion++;
        RequestSerialization();
        videoPlayer.Stop();
        _UpdateUI();
    }

    // -------------------------------------------------------------------------
    // VRC video player callbacks
    // -------------------------------------------------------------------------

    public override void OnVideoReady()
    {
        _isLoading = false;
        if (_syncedPlaying) videoPlayer.Play();

        // Seek to synced position (for late joiners).
        if (_syncedTimestamp > 1f) videoPlayer.SetTime(_syncedTimestamp);

        _SetStatus("Playing");
        _UpdateUI();
    }

    public override void OnVideoStart()   { _SetStatus("Playing"); }
    public override void OnVideoEnd()     { _SetStatus("Finished"); }
    public override void OnVideoError(VideoError videoError)
    {
        _isLoading = false;
        _SetStatus($"Error: {videoError}");
    }

    // -------------------------------------------------------------------------
    // Network sync callback — fires on non-owners when synced vars change
    // -------------------------------------------------------------------------

    public override void OnDeserialization()
    {
        // Detect a new video load (version bump).
        if (_syncedVersion != _localVersion)
        {
            _localVersion = _syncedVersion;
            if (!string.IsNullOrEmpty(_syncedUrl.Get()))
            {
                _LoadVideo();
            }
            else
            {
                videoPlayer.Stop();
            }
            return;
        }

        // Mirror play/pause state.
        if (_syncedPlaying && !videoPlayer.IsPlaying) videoPlayer.Play();
        else if (!_syncedPlaying && videoPlayer.IsPlaying) videoPlayer.Pause();

        _UpdateUI();
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void _LoadVideo()
    {
        if (_syncedUrl == null || string.IsNullOrEmpty(_syncedUrl.Get())) return;
        _isLoading = true;
        _SetStatus("Loading…");
        videoPlayer.LoadURL(_syncedUrl);
    }

    private void _SetStatus(string msg)
    {
        if (statusText != null) statusText.text = msg;
    }

    private void _UpdateUI()
    {
        bool hasOwner = Networking.IsOwner(gameObject);
        if (loadButton)  loadButton.interactable  = hasOwner;
        if (playButton)  playButton.interactable  = hasOwner && !videoPlayer.IsPlaying;
        if (pauseButton) pauseButton.interactable = hasOwner && videoPlayer.IsPlaying;
        if (stopButton)  stopButton.interactable  = hasOwner;
    }
}
