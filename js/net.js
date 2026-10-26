// Peer-to-peer rooms over WebRTC (PeerJS). The browser that hosts is the room: its PeerJS id comes
// from the room code, so friends only need the code. Everything goes through the host (a star),
// except voice, which is a direct call between every pair of players (see vc.js).

const PREFIX = 'mimic-v1-';
export const MAX_PLAYERS = 4;
const TIMEOUT_MS = 12000;
const AWAY_MS = 45000;    // host: how long a dropped player's place is kept during a game
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s.startsWith('QQ') ? newCode() : s; // QQ.. codes are the public (Quick Play) rooms
}

// Quick Play: there's no server to list games, so public rooms use a fixed set of codes everyone knows.
export const QUICK_CODES = 'ABCDEFGHJKMN'.split('').map((c) => `QQ${c}2`);

// Which of these rooms exist right now? One throwaway peer tries them all at once. -> { open: [codes], free: [codes] }
export function probe(codes, ms = 6000) {
  return new Promise((resolve) => {
    const peer = new Peer();
    const open = [], free = [], conns = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      for (const c of conns) try { c.close(); } catch { /* ignore */ }
      setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 300);
      resolve({ open, free: codes.filter((c) => !open.includes(c)) });
    };
    setTimeout(finish, ms);
    peer.on('error', (e) => {
      // "Could not connect to peer mimic-v1-QQA2": nobody is hosting that one.
      const m = /mimic-v1-([A-Z0-9]{4})/.exec(e.message || '');
      if (e.type === 'peer-unavailable' && m) { free.push(m[1]); if (open.length + free.length >= codes.length) finish(); }
      else if (e.type !== 'peer-unavailable') finish();
    });
    peer.on('open', () => {
      for (const code of codes) {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        conns.push(conn);
        conn.on('open', () => { open.push(code); if (open.length + free.length >= codes.length) finish(); });
      }
    });
  });
}
export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
export const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} _.\-']/gu, '').trim().slice(0, 16) || 'Player';

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.id = null;          // my player id: 'h' for the host, 'p1', 'p2'... for others
    this.code = null;
    this.roster = [];        // [{ id, name, peer }]
    this.conns = new Map();  // host side: player id -> DataConnection
    this.hostConn = null;    // client side
    this.locked = false;     // host: game started, no new players
    this.closed = false;
    this.nextId = 1;
    this.secrets = new Map(); // host: player id -> the secret that lets them back in after a drop
    this.away = new Map();    // host: player id -> timer, while their place is kept
    this.secret = null;       // client: mine
    this.onMessage = () => {};  // (message, fromPlayerId)
    this.onRoster = () => {};
    this.onClose = () => {};    // (reason)
  }

  host(code, name) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(PREFIX + code);
      this.peer = peer;
      let opened = false;
      peer.on('open', () => {
        if (opened) return;
        opened = true;
        this.isHost = true;
        this.id = 'h';
        this.code = code;
        this.roster = [{ id: 'h', name: cleanName(name), peer: peer.id }];
        peer.on('connection', (conn) => this.accept(conn));
        // WebRTC can take a long time to notice a closed tab, so drop silent players.
        this.reaper = setInterval(() => {
          const now = Date.now();
          for (const c of this.conns.values()) {
            if (now - c.lastSeen > TIMEOUT_MS) c.close();
            else if (c.open) c.send({ t: 'ping' });
          }
        }, 2000);
        this.onRoster(this.roster);
        resolve();
      });
      peer.on('disconnected', () => { if (opened && !this.closed) try { peer.reconnect(); } catch { /* keep playing */ } });
      peer.on('error', (e) => {
        if (!opened) {
          peer.destroy();
          reject(new Error(e.type === 'unavailable-id' ? 'That room code is taken, try again.' : `Couldn't create a room (${e.type || e.message}).`));
        } else console.warn('peer error', e);
      });
    });
  }

  accept(conn) {
    conn.lastSeen = Date.now();
    conn.on('data', (m) => {
      conn.lastSeen = Date.now();
      if (!m || typeof m !== 'object' || m.t === 'ping') return;
      if (m.t === 'hello' && !conn.pid) {
        // Back after a drop: same player, same place.
        const back = m.rejoin && this.away.has(m.rejoin.id) && this.secrets.get(m.rejoin.id) === m.rejoin.secret ? m.rejoin.id : null;
        if (back) {
          clearTimeout(this.away.get(back));
          this.away.delete(back);
          conn.pid = back;
          this.conns.set(back, conn);
          const r = this.roster.find((x) => x.id === back);
          if (r) r.peer = conn.peer;
          conn.send({ t: 'welcome', id: back, code: this.code, secret: m.rejoin.secret, rejoined: true });
          this.sendRoster();
          this.onRejoin?.(back);
          return;
        }
        const refuse = this.locked ? 'That game has already started.' : this.roster.length >= MAX_PLAYERS ? 'That room is full.' : null;
        if (refuse) { conn.send({ t: 'refused', why: refuse }); setTimeout(() => conn.close(), 500); return; }
        conn.pid = 'p' + this.nextId++;
        this.conns.set(conn.pid, conn);
        this.roster.push({ id: conn.pid, name: cleanName(m.name), peer: conn.peer });
        this.secrets.set(conn.pid, Math.random().toString(36).slice(2));
        conn.send({ t: 'welcome', id: conn.pid, code: this.code, secret: this.secrets.get(conn.pid) });
        this.sendRoster();
      } else if (conn.pid) this.onMessage(m, conn.pid);
    });
    const drop = () => {
      if (!conn.pid || this.conns.get(conn.pid) !== conn) return;
      this.conns.delete(conn.pid);
      // During a game, keep their place for a while: they may be back.
      if (this.locked && !this.closed) {
        const id = conn.pid;
        this.away.set(id, setTimeout(() => { this.away.delete(id); this.gone(id); }, AWAY_MS));
        return;
      }
      this.gone(conn.pid);
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  // Host: a player is gone for good.
  gone(id) {
    this.roster = this.roster.filter((r) => r.id !== id);
    this.sendRoster();
    this.onMessage({ t: 'quit', id }, 'h'); // internal: the game turns it into 'left'
  }

  sendRoster() {
    this.broadcast({ t: 'roster', roster: this.roster }, { self: false });
    this.onRoster(this.roster);
  }

  // rejoin: { id, secret } to get back into a game after a drop.
  join(code, name, rejoin = null) {
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      this.peer = peer;
      let done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Timed out connecting to the room.'), 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => conn.send({ t: 'hello', name: cleanName(name), rejoin }));
        conn.on('data', (m) => {
          this.lastHostMsg = Date.now();
          if (!m || typeof m !== 'object' || m.t === 'ping') return;
          if (m.t === 'refused') { fail(m.why); return; }
          if (m.t === 'welcome' && !done) {
            done = true;
            clearTimeout(timer);
            this.id = m.id;
            this.code = code;
            this.secret = m.secret || null;
            this.pinger = setInterval(() => {
              if (conn.open) conn.send({ t: 'ping' });
              if (Date.now() - this.lastHostMsg > TIMEOUT_MS) this.lost('Lost connection to the host.');
            }, 2000);
            resolve();
            return;
          }
          if (m.t === 'roster') { this.roster = m.roster; this.onRoster(this.roster); return; }
          this.onMessage(m, 'h');
        });
        conn.on('close', () => this.lost('Lost connection to the host.'));
      });
      peer.on('disconnected', () => { if (done && !this.closed) try { peer.reconnect(); } catch { /* ignore */ } });
      peer.on('error', (e) => {
        if (!done) fail(e.type === 'peer-unavailable' ? 'No room with that code.' : `Connection failed (${e.type || e.message}).`);
        else console.warn('peer error', e);
      });
    });
  }

  lost(reason) {
    if (this.closed) return;
    this.destroy();
    this.onClose(reason);
  }

  // Client -> host (the host delivers to itself).
  send(m) {
    if (this.isHost) queueMicrotask(() => this.onMessage(m, 'h'));
    else if (this.hostConn?.open) this.hostConn.send(m);
  }

  // Host -> one player.
  sendTo(id, m) {
    if (id === 'h') queueMicrotask(() => this.onMessage(m, 'h'));
    else { const c = this.conns.get(id); if (c?.open) c.send(m); }
  }

  // Host -> everyone (and itself unless self: false).
  broadcast(m, { except = null, self = true } = {}) {
    for (const [id, c] of this.conns) if (id !== except && c.open) c.send(m);
    if (self && except !== 'h') queueMicrotask(() => this.onMessage(m, 'h'));
  }

  nameOf(id) { return this.roster.find((r) => r.id === id)?.name || 'Someone'; }

  destroy() {
    this.closed = true;
    clearInterval(this.reaper);
    clearInterval(this.pinger);
    for (const t of this.away.values()) clearTimeout(t);
    try { this.peer?.destroy(); } catch { /* already gone */ }
  }
}
