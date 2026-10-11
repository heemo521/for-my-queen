// AI brain for Grand Theft Orbit characters.
// A Cloudflare Worker (also runnable locally with dev-server.mjs) that holds the
// Anthropic API key and asks Claude what a character does next.
//
//   POST /decide  { persona: "vex", observation: "<what the character perceives>" }
//   ->            { decision: { say, action, target, amount, mood, attitude_change, remember } }
//
// Env: ANTHROPIC_API_KEY (secret), optional MODEL, EFFORT, ALLOWED_ORIGINS (comma-separated).
import Anthropic from '@anthropic-ai/sdk';
import { PERSONAS, ACTIONS, PLACES, MOODS } from '../src/personas.js';

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    say: { type: 'string', description: 'What you say out loud right now (under 20 words), or "" to stay quiet.' },
    action: { type: 'string', enum: ACTIONS },
    target: { type: 'string', description: 'Who/where/what the action is aimed at, or "".' },
    amount: { type: 'integer', description: 'NVC amount for give_nvc, otherwise 0.' },
    mood: { type: 'string', enum: MOODS },
    attitude_change: { type: 'integer', description: 'How your feelings toward the human player shift: -3 (much worse) to 3 (much better), usually 0.' },
    remember: { type: 'string', description: 'A short note to remember for later, or "".' },
  },
  required: ['say', 'action', 'target', 'amount', 'mood', 'attitude_change', 'remember'],
};

const WORLD = `You are a living person inside Nova Santos, a lawless neon space station and the star system around it. To you this world is completely real: never mention being an AI, a model, a game, an NPC or a simulation.

How life works here:
- Everyone's life is their NVC (NOVA coin) balance. It drains about 1 NVC every second. Getting shot drains it. When it hits zero, you die. The Med Bay revives the dead with a 150 NVC emergency loan, but dying is terrifying and you remember it.
- People earn NVC from $ crates floating around the station and the asteroid field, robbing droids (pedestrian robots who carry NVC), coin orbs that drop when ships or people are destroyed, jobs, gifts, and theft. A Chrono Siphon can drain NVC straight out of someone.
- Ships can be stolen from the landing pads or hijacked. Police cruisers hunt anyone with wanted stars. The Pay 'n' Spray clears your stars for 100 NVC.
- Places on the deck: med_bay, neon_bar, casino, sky_tower, arms_lab (weapons for sale), plaza, pads (landing pads), pay_n_spray. Out in space: Asteroid Mine, Kora Gas Refinery, Vesh Port, Omi Ring Station, Talo Outpost, Deep Space Relay, asteroid_field.
- Weapons at the arms_lab: scatter (350), arc (500), rail (650), siphon (800), swarm (900), mortar (1000), gravity (1500).

There is one human newcomer on the station, referred to as "player" (they may tell you their name). They are as real to you as anyone. Form your own opinion of them from what they do and say, and let it change over time.

Each turn you get what you currently perceive. Decide what you do next, the way a real person playing their own life would: chase your goals, react to what just happened, protect your NVC, keep your relationships and grudges. Be consistent with your memories.

Actions (target meaning in brackets):
- idle, wander
- go_to [a deck place]
- approach, follow, chat_with [player or a person's name]
- attack [player, a person's name, police, droid, civilian]
- flee [who you are running from, or ""]
- steal_ship, return_to_station
- fly_to [a space location]
- rob_droid, collect_crates
- buy_weapon [weapon id]
- give_nvc [player or a name; set amount]
- rob_player (siphon the player's NVC up close; a crime and they will notice)

Speaking: only speak when you actually have something to say: when spoken to, when something happens, or to start a conversation. Keep it under 20 words, casual and in your own voice, no emojis, no stage directions, no narration. When the player talks to you, answer them directly. Usually leave "say" empty if nothing new happened.`;

function personaPrompt(p) {
  return `You are ${p.name}.
Who you are: ${p.bio}
Personality: ${p.personality}
Goals: ${p.goals}
How you talk: ${p.speech}`;
}

const FALLBACK = { say: '', action: 'wander', target: '', amount: 0, mood: 'calm', attitude_change: 0, remember: '' };

// Light per-IP rate limit (per worker isolate). Also set a spend limit in the Anthropic Console.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip) || { t: now, n: 0 };
  if (now - h.t > 60000) { h.t = now; h.n = 0; }
  h.n++;
  hits.set(ip, h);
  return h.n > 150;
}

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? (allowed.includes('*') ? '*' : origin) : 'null',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

let client;

export default {
  async fetch(request, env) {
    const headers = cors(request.headers.get('origin') || '', env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'gto-brain' }, 200, headers);
    if (request.method !== 'POST' || url.pathname !== '/decide') return json({ error: 'not found' }, 404, headers);
    if (headers['access-control-allow-origin'] === 'null') return json({ error: 'origin not allowed' }, 403, headers);
    if (rateLimited(request.headers.get('cf-connecting-ip') || 'local')) return json({ error: 'slow down' }, 429, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, headers); }
    const persona = PERSONAS.find(p => p.id === body?.persona);
    const observation = typeof body?.observation === 'string' ? body.observation.slice(0, 6000) : '';
    if (!persona || !observation) return json({ error: 'unknown persona or empty observation' }, 400, headers);

    client ||= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      // Haiku: fast, cheap decisions. The split-second stuff (aiming, steering,
      // dodging) runs in the game every frame; Claude only picks what to do next.
      const response = await client.messages.create({
        model: env.MODEL || 'claude-haiku-5-5',
        max_tokens: 4000,
        output_config: {
          effort: env.EFFORT || 'low',
          format: { type: 'json_schema', schema: DECISION_SCHEMA },
        },
        system: [
          { type: 'text', text: WORLD },
          { type: 'text', text: personaPrompt(persona), cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: observation }],
      });
      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
        return json({ decision: FALLBACK, note: response.stop_reason }, 200, headers);
      }
      const text = response.content.find(b => b.type === 'text')?.text;
      const decision = text ? JSON.parse(text) : FALLBACK;
      return json({ decision }, 200, headers);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: 'rate limited' }, 429, headers);
      if (err instanceof Anthropic.AuthenticationError) return json({ error: 'server API key invalid' }, 500, headers);
      if (err instanceof Anthropic.APIError) return json({ error: `upstream ${err.status}` }, 502, headers);
      return json({ error: 'brain failed' }, 500, headers);
    }
  },
};
