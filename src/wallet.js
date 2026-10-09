// NOVA coin (NVC) wallet. Your balance is your life: it ticks down every second,
// damage drains it, weapons cost it, and at zero you're dead.
//
// This is a local, in-memory ledger. It is written as a small interface
// (balance / earn / spend / drain / ledger / onChange) so a server-backed or
// on-chain wallet can replace it later without touching game code. Any
// real-value version must be server-authoritative: the browser can't be
// trusted with balances or keys.

export class Wallet {
  constructor(start = 0, symbol = 'NVC') {
    this.balance = start;
    this.symbol = symbol;
    this.ledger = [];
    this.listeners = [];
    this.pendingDrain = 0;
    this.drainT = 0;
  }

  get empty() { return this.balance <= 0; }

  onChange(fn) { this.listeners.push(fn); }

  log(type, amount, reason) {
    this.ledger.push({ t: Date.now(), type, amount: +amount.toFixed(2), reason, balance: +this.balance.toFixed(2) });
    if (this.ledger.length > 300) this.ledger.shift();
    for (const fn of this.listeners) fn(type, amount, reason, this.balance);
  }

  earn(amount, reason) {
    if (!(amount > 0)) return 0;
    this.balance += amount;
    this.log('earn', amount, reason);
    return amount;
  }

  // Voluntary purchase: refused if it would leave you with nothing.
  spend(amount, reason) {
    if (amount <= 0) return true;
    if (this.balance - amount <= 0) return false;
    this.balance -= amount;
    this.log('spend', amount, reason);
    return true;
  }

  // Involuntary loss (time, damage). Can take you to zero.
  drain(amount, reason, logNow = false) {
    if (amount <= 0) return;
    const taken = Math.min(this.balance, amount);
    this.balance -= taken;
    if (logNow) this.log('drain', taken, reason);
    else this.pendingDrain += taken;
  }

  // Batch the continuous per-frame "life tick" into one ledger line every few seconds.
  tick(dt, rate) {
    this.drain(rate * dt, 'life');
    this.drainT += dt;
    if (this.drainT > 5 && this.pendingDrain > 0) {
      this.log('drain', this.pendingDrain, 'life');
      this.pendingDrain = 0;
      this.drainT = 0;
    }
  }
}
