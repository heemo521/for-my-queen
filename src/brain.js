// Client for the AI "brain" server (server/worker.js), which asks Claude what a
// character does next. The API key lives only on the server.
//
// Point the game at your server once with ?brain=https://your-worker.workers.dev
// (remembered in localStorage), or set window.GTO_BRAIN_URL before main.js loads.
// With no server configured, characters fall back to their offline personality engine.

const KEY = 'gto.brain';

function configuredUrl() {
  try {
    const q = new URLSearchParams(location.search).get('brain');
    if (q !== null) {
      if (q === 'off' || q === '') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, q);
    }
    return (window.GTO_BRAIN_URL || localStorage.getItem(KEY) || '').replace(/\/+$/, '');
  } catch {
    return (window.GTO_BRAIN_URL || '').replace(/\/+$/, '');
  }
}

export class BrainClient {
  constructor() {
    this.url = configuredUrl();
    this.inFlight = 0;
    this.maxInFlight = 2;
    this.failures = 0;
    this.status = this.url ? 'connecting' : 'offline';
  }

  get enabled() { return !!this.url && this.failures < 5; }
  get busy() { return this.inFlight >= this.maxInFlight; }

  // Returns a decision object, or null (caller then uses the offline engine).
  async decide(personaId, observation) {
    if (!this.enabled || this.busy) return null;
    this.inFlight++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(this.url + '/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ persona: personaId, observation }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('brain HTTP ' + res.status);
      const data = await res.json();
      this.failures = 0;
      this.status = 'online';
      return data.decision || null;
    } catch (err) {
      this.failures++;
      this.status = this.failures >= 5 ? 'offline' : 'retrying';
      console.warn('[brain]', err.message || err);
      return null;
    } finally {
      clearTimeout(timer);
      this.inFlight--;
    }
  }
}
