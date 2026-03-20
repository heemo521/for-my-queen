# AI Character Integration — What's Possible Now & The Roadmap

## Can We Add a Talkable AI Character to This VRChat World?

**Short answer: Yes, but with architectural constraints.** VRChat's Udon sandbox
deliberately blocks native HTTP/WebSocket calls for security, so the AI processing
must happen *outside* the game client and be bridged in via OSC or a companion app.

Here is the complete picture — what works today, what's coming, and the code to
start building it now.

---

## THE CONSTRAINT: Why UdonSharp Can't Call an AI API Directly

VRChat's Udon runtime is sandboxed:
- No `System.Net.Http` / `UnityWebRequest` to external servers
- No WebSockets
- No file I/O beyond VRChat's built-in storage

This is intentional — it prevents malicious worlds from exfiltrating player data.

---

## ARCHITECTURE THAT WORKS TODAY

```
┌─────────────────────────────────────────────────────────┐
│  VRChat Client (Quest or PC)                            │
│                                                         │
│  Player speaks → VRChat voice → (detected via OSC)      │
│                                                         │
│  UdonSharp OSC Receiver ←──── VRChat OSC Output         │
│  (reads /avatar/parameters or custom OSC addresses)     │
│                                                         │
│  NPC GameObject with:                                   │
│   • Lip-sync animation                                  │
│   • Chat bubble Text                                    │
│   • Idle/talking animation state machine                │
└──────────────────────┬──────────────────────────────────┘
                       │ OSC (UDP, localhost port 9001)
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Companion App — runs on the HOST PC (not Quest)        │
│  (Python or Node.js)                                    │
│                                                         │
│  1. Receive player voice → STT (Whisper / Windows STT)  │
│  2. Send transcript to Claude / GPT API                 │
│  3. Receive AI response text                            │
│  4. Run TTS (ElevenLabs / Coqui / Windows TTS)         │
│  5. Play audio through a Virtual Audio Cable            │
│     → VRChat hears the NPC "speaking" via mic input     │
│  6. Send response text back via OSC to VRChat           │
│     → UdonSharp reads it, updates chat bubble           │
└─────────────────────────────────────────────────────────┘
```

### What this gives you:
- A character in the world with a name, a face, animations
- It "listens" (via STT) and "speaks" (via TTS piped through virtual mic)
- Its words appear in a chat bubble
- All other players hear and see it respond (because VRChat transmits the
  virtual mic audio as if it were a real player's voice)

### Limitations:
- The host (world owner) must run the companion app on their PC
- Quest-only players cannot run the companion app themselves
- Latency: ~1–3 seconds per response (STT + API + TTS)
- Only one voice channel (the host's virtual mic input)

---

## WHAT WE'RE LACKING (and when it arrives)

| Gap | Current State | ETA / Path |
|-----|--------------|------------|
| Native in-game HTTP | Blocked by Udon sandbox | VRChat has not announced plans to open this |
| Per-player AI voice | Only host can bridge voice | Multi-instance companion app (experimental) |
| On-Quest AI | Llama 3 8B runs on Quest 3 locally | App Lab sideloading required; Meta AI SDK in beta |
| Lip-sync from TTS audio | Manual animation events | Oculus Lip Sync SDK in Unity (works today, Quest-compatible) |
| Memory across sessions | No persistent store in Udon | External DB via companion app OSC bridge |
| Multi-NPC | One virtual mic per PC | Multiple PCs each running a companion |

---

## IMPLEMENTATION PLAN — Phased

### Phase 1 (Build Now): Static NPC with OSC Chat Bubble
Add an NPC with idle animations and a chat bubble that your companion app
can update via OSC. No voice yet — text only.

**Estimated effort: 2–3 hours**

### Phase 2: Voice via Companion App (PC hosts only)
Set up the Python bridge: Whisper STT + Claude API + ElevenLabs TTS
+ Virtual Audio Cable. Full spoken conversation for PC users.

**Estimated effort: 4–6 hours**

### Phase 3: Quest Voice (Future)
When VRChat or Meta opens an API for in-app HTTP, migrate the AI call
into the world itself. Or use a WebRTC relay service as middleware.

---

## CODE: UdonSharp NPC Chat Bubble (Phase 1)

Add this script to your NPC GameObject. The companion app sends OSC messages
to VRChat which are read via avatar parameters, then forwarded to this script.

```csharp
// NPCChatBubble.cs — reads synced text and displays it above the NPC
using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDKBase;

[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
public class NPCChatBubble : UdonSharpBehaviour
{
    [Header("NPC Display")]
    public Text chatBubbleText;          // World-space Canvas > Text
    public GameObject bubbleRoot;        // Parent to show/hide the bubble
    public Animator npcAnimator;         // Animator with "IsTalking" bool param
    public float hideDelay = 5f;         // Seconds before bubble auto-hides

    [UdonSynced] private string _syncedMessage = "";

    private float _hideTimer;
    private bool  _showing;

    void Update()
    {
        if (_showing)
        {
            _hideTimer -= Time.deltaTime;
            if (_hideTimer <= 0f)
            {
                bubbleRoot.SetActive(false);
                _showing = false;
                if (npcAnimator) npcAnimator.SetBool("IsTalking", false);
            }
        }
    }

    // Call this from your companion app via OSC parameter sync,
    // or wire it to a UI input if you want manual testing.
    public void DisplayMessage(string message)
    {
        Networking.SetOwner(Networking.LocalPlayer, gameObject);
        _syncedMessage = message;
        RequestSerialization();
        _ShowBubble(message);
    }

    public override void OnDeserialization()
    {
        if (!string.IsNullOrEmpty(_syncedMessage))
            _ShowBubble(_syncedMessage);
    }

    private void _ShowBubble(string msg)
    {
        chatBubbleText.text = msg;
        bubbleRoot.SetActive(true);
        _hideTimer = hideDelay;
        _showing   = true;
        if (npcAnimator) npcAnimator.SetBool("IsTalking", true);
    }
}
```

---

## CODE: Python Companion App (Phase 2)

Save this as `ai_companion.py` and run it on the host PC.

```python
#!/usr/bin/env python3
"""
Iron Throne Neon — AI Companion Bridge
Requires: pip install anthropic openai-whisper python-osc elevenlabs
Also requires: Virtual Audio Cable (VB-Audio or similar) installed
"""

import threading, queue, time, struct
from pathlib import Path

# --- Dependencies (install via pip) -----------------------------------------
import anthropic
import whisper
import sounddevice as sd
import numpy as np
from pythonosc import dispatcher, osc_server, udp_client
# from elevenlabs import generate, play  # uncomment if using ElevenLabs TTS

# --- Configuration -----------------------------------------------------------
ANTHROPIC_API_KEY  = "YOUR_ANTHROPIC_KEY_HERE"
ELEVENLABS_API_KEY = "YOUR_ELEVENLABS_KEY_HERE"   # optional
NPC_NAME           = "Maester Cypher"              # the NPC's in-world name
VRC_OSC_IN_PORT    = 9001     # VRChat listens on this port
VRC_OSC_OUT_PORT   = 9000     # VRChat sends on this port
COMPANION_PORT     = 9002     # our app listens on this port

SYSTEM_PROMPT = f"""
You are {NPC_NAME}, a mysterious adviser who has served the Iron Throne for
centuries. You exist at the intersection of ancient sorcery and futuristic
technology — a maester who has unlocked the secrets of the neon age.
Speak in a blend of medieval formality and cyberpunk slang. Keep responses
under 40 words so they fit a chat bubble. Be cryptic but helpful.
"""

# --- Globals -----------------------------------------------------------------
audio_queue   = queue.Queue()
client        = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
osc_out       = udp_client.SimpleUDPClient("127.0.0.1", VRC_OSC_IN_PORT)
whisper_model = whisper.load_model("base.en")
conversation_history = []

# --- Speech-to-Text ----------------------------------------------------------
def record_and_transcribe(duration=5, samplerate=16000):
    """Record from default mic for `duration` seconds and transcribe."""
    print(f"[Listening for {duration}s...]")
    audio = sd.rec(int(duration * samplerate), samplerate=samplerate,
                   channels=1, dtype='float32')
    sd.wait()
    audio_np = audio.flatten()
    result = whisper_model.transcribe(audio_np, fp16=False, language="en")
    return result["text"].strip()

# --- AI Response -------------------------------------------------------------
def get_ai_response(player_text: str) -> str:
    conversation_history.append({"role": "user", "content": player_text})

    response = client.messages.create(
        model="claude-opus-4-6",          # or claude-haiku-4-5 for faster/cheaper
        max_tokens=100,
        system=SYSTEM_PROMPT,
        messages=conversation_history
    )

    reply = response.content[0].text.strip()
    conversation_history.append({"role": "assistant", "content": reply})

    # Keep conversation history manageable
    if len(conversation_history) > 20:
        conversation_history.pop(0)
        conversation_history.pop(0)

    return reply

# --- Text-to-Speech ----------------------------------------------------------
def speak(text: str):
    """
    Option A: Windows built-in TTS (no API key required)
    Uncomment and use one option.
    """
    # Option A: Windows TTS via pyttsx3
    import pyttsx3
    engine = pyttsx3.init()
    engine.setProperty('rate', 160)    # speaking speed
    engine.setProperty('volume', 0.9)
    engine.say(text)
    engine.runAndWait()

    # Option B: ElevenLabs (better voice quality, requires API key + pip install elevenlabs)
    # audio = generate(text=text, voice="Callum", api_key=ELEVENLABS_API_KEY)
    # play(audio)

# --- OSC: Send text to VRChat chat bubble ------------------------------------
def send_to_vrchat(text: str):
    """
    Send the NPC's text to VRChat via OSC.
    In UdonSharp you'd read this via VRC OSC or a Chatbox parameter.
    VRChat's built-in chatbox address: /chatbox/input  str  bool
    """
    # Send to VRChat's built-in chatbox (shows above player head)
    osc_out.send_message("/chatbox/input", [text, True])
    print(f"[Sent to VRChat]: {text}")

# --- Main conversation loop --------------------------------------------------
def main():
    print(f"=== {NPC_NAME} AI Companion is ONLINE ===")
    print("Press Enter to start listening, Ctrl+C to quit.\n")

    while True:
        input(">> Press Enter to speak to the NPC...")

        # 1. Listen and transcribe
        player_text = record_and_transcribe(duration=6)
        if not player_text:
            print("[No speech detected]")
            continue
        print(f"[Player said]: {player_text}")

        # 2. Get AI response
        response = get_ai_response(player_text)
        print(f"[{NPC_NAME}]: {response}")

        # 3. Display in VRChat
        send_to_vrchat(f"{NPC_NAME}: {response}")

        # 4. Speak the response (plays through Virtual Audio Cable → VRChat)
        speak(response)

if __name__ == "__main__":
    main()
```

**To run:**
```bash
pip install anthropic openai-whisper sounddevice python-osc pyttsx3
python ai_companion.py
```

---

## NPC SETUP IN UNITY

### Character Model
- Download a free medieval NPC from the Unity Asset Store or Mixamo
- Must be Quest-compatible: ≤ 1500 tris, 1 material, 512² texture
- Rig it with Mixamo's auto-rigger for free animations

### Animator Controller
1. Create an Animator Controller: right-click Assets → **Animator Controller**
2. Add states:
   - `Idle` → looping idle animation
   - `Talking` → looping talking/gesturing animation
3. Add a **Bool parameter** named `IsTalking`
4. Transition: Idle → Talking when `IsTalking = true`, back when false
5. Assign to the NPC's Animator component

### Chat Bubble Canvas
1. Right-click NPC → **UI → Canvas**
2. Set Canvas to **World Space**
3. Position it above the NPC's head (Y + 2.2 approx)
4. Add a **Text** component with a dark background Image behind it
5. Set the Canvas scale to (0.005, 0.005, 0.005) so it's human-readable size in world

### Script Wiring
1. Select the NPC root GameObject
2. Add Component → Udon Behaviour → `NPCChatBubble`
3. Add Component → VRC Synced Object
4. Wire: `chatBubbleText`, `bubbleRoot`, `npcAnimator` in Inspector

---

## WHAT THE FUTURE LOOKS LIKE

When Meta opens the on-device AI SDK to sideloaded apps and VRChat integrates it,
the architecture collapses to this:

```
Player speaks
    ↓
Whisper on-device (Quest 3's NPU, <200ms)
    ↓
Claude API call (or local Llama 3 on-device)
    ↓
TTS on-device
    ↓
VRChat NPC speaks — no PC required
```

Meta announced **Meta AI** for Quest in 2024 with on-device LLM capabilities.
VRChat has not yet opened an API for custom AI integration, but the community
expects this within 1–2 years given industry trajectory.

**Watch these:**
- VRChat OSC documentation: docs.vrchat.com/docs/osc-overview
- VRChat Creator Companion changelogs for new SDK features
- Meta Presence Platform AI SDK for Quest

---

## SUMMARY

| Feature | Available Now | Notes |
|---------|--------------|-------|
| NPC model + animations | ✅ | Standard Unity/VRC |
| Chat bubble text sync | ✅ | NPCChatBubble.cs above |
| AI text responses | ✅ | Via companion app + Claude API |
| AI voice (TTS) | ✅ (PC host) | Virtual Audio Cable trick |
| Voice recognition (STT) | ✅ (PC host) | Whisper model |
| Quest-native AI (no PC) | ❌ | Awaiting Meta/VRC API |
| Multi-player each hearing AI | ✅ | VRC transmits the virtual mic |
| Memory between sessions | ⚠️ partial | JSON file on host PC |
