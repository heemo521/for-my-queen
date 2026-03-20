// =============================================================================
// NPCChatBubble.cs
// VRChat UdonSharp — Iron Throne Neon World
// -----------------------------------------------------------------------------
// Displays a synced chat bubble above the NPC character and drives its
// talking/idle animation. Text is set by the AI companion bridge app via OSC,
// or can be triggered by any other UdonSharp behaviour.
//
// SETUP:
//   1. Place a humanoid NPC mesh in the scene (from Mixamo or Asset Store).
//   2. Create a World-Space Canvas child above its head.
//   3. Inside the Canvas add: a background Image and a Text component.
//   4. Attach this script to the NPC root GameObject.
//   5. Add VRC Synced Object to the same GameObject.
//   6. Wire chatBubbleText, bubbleRoot, npcAnimator in the Inspector.
//   7. The Animator Controller needs a Bool parameter named "IsTalking".
//
// TRIGGERING:
//   The companion Python app sends text via VRChat OSC chatbox which is
//   piped to this script. For manual testing use the public DisplayMessage()
//   method from another Udon script or the SDK Test window.
// =============================================================================

using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDKBase;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
public class NPCChatBubble : UdonSharpBehaviour
{
    // -------------------------------------------------------------------------
    // Inspector references
    // -------------------------------------------------------------------------

    [Header("Chat Bubble UI")]
    [Tooltip("The Text component inside the world-space Canvas above the NPC's head.")]
    public Text chatBubbleText;

    [Tooltip("The root of the chat bubble UI (Canvas or panel GameObject). Toggled on/off.")]
    public GameObject bubbleRoot;

    [Header("NPC Animation")]
    [Tooltip("The NPC's Animator. Must have a Bool parameter named 'IsTalking'.")]
    public Animator npcAnimator;

    [Header("Behaviour")]
    [Tooltip("Seconds the bubble stays visible after the message arrives, then hides.")]
    [Range(2f, 15f)] public float hideDelay = 6f;

    [Tooltip("NPC display name shown before the message, e.g. 'Maester Cypher: ...'")]
    public string npcName = "Maester Cypher";

    [Tooltip("If true, prefix every message with the NPC name.")]
    public bool prependName = true;

    // -------------------------------------------------------------------------
    // Synced state
    // -------------------------------------------------------------------------

    [UdonSynced] private string _syncedMessage = "";

    // -------------------------------------------------------------------------
    // Local state
    // -------------------------------------------------------------------------

    private float _hideTimer;
    private bool  _showing;

    // -------------------------------------------------------------------------
    // Unity lifecycle
    // -------------------------------------------------------------------------

    void Start()
    {
        // Hide bubble at start.
        if (bubbleRoot != null) bubbleRoot.SetActive(false);
    }

    void Update()
    {
        if (!_showing) return;

        _hideTimer -= Time.deltaTime;
        if (_hideTimer <= 0f)
        {
            if (bubbleRoot != null) bubbleRoot.SetActive(false);
            _showing = false;

            // Return NPC to idle.
            if (npcAnimator != null) npcAnimator.SetBool("IsTalking", false);
        }
    }

    // -------------------------------------------------------------------------
    // Public API — call this to make the NPC say something
    // -------------------------------------------------------------------------

    /// <summary>
    /// Show a message in the chat bubble and trigger talking animation.
    /// Call this from: another Udon script, an OSC relay, or the SDK Test window.
    /// </summary>
    public void DisplayMessage(string message)
    {
        // Take ownership so we can sync this to other clients.
        Networking.SetOwner(Networking.LocalPlayer, gameObject);
        _syncedMessage = message;
        RequestSerialization();
        _ShowBubble(message);
    }

    // -------------------------------------------------------------------------
    // Network sync — fires on all non-owner clients when state changes
    // -------------------------------------------------------------------------

    public override void OnDeserialization()
    {
        if (!string.IsNullOrEmpty(_syncedMessage))
            _ShowBubble(_syncedMessage);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void _ShowBubble(string msg)
    {
        if (chatBubbleText != null)
        {
            chatBubbleText.text = prependName ? $"{npcName}: {msg}" : msg;
        }

        if (bubbleRoot != null) bubbleRoot.SetActive(true);

        _hideTimer = hideDelay;
        _showing   = true;

        // Trigger talking animation.
        if (npcAnimator != null) npcAnimator.SetBool("IsTalking", true);
    }
}
