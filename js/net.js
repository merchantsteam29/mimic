// Peer-to-peer rooms over WebRTC (PeerJS). The browser that hosts is the room: its PeerJS id comes
// from the room code, so friends only need the code. Everything goes through the host (a star),
// except voice, which is a direct call between every pair of players (see vc.js).

const PREFIX = 'mimic-v1-';
export const MAX_PLAYERS = 4;
const TIMEOUT_MS = 12000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
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
        const refuse = this.locked ? 'That game has already started.' : this.roster.length >= MAX_PLAYERS ? 'That room is full.' : null;
        if (refuse) { conn.send({ t: 'refused', why: refuse }); setTimeout(() => conn.close(), 500); return; }
        conn.pid = 'p' + this.nextId++;
        this.conns.set(conn.pid, conn);
        this.roster.push({ id: conn.pid, name: cleanName(m.name), peer: conn.peer });
        conn.send({ t: 'welcome', id: conn.pid, code: this.code });
        this.sendRoster();
      } else if (conn.pid) this.onMessage(m, conn.pid);
    });
    const drop = () => {
      if (!conn.pid || this.conns.get(conn.pid) !== conn) return;
      this.conns.delete(conn.pid);
      this.roster = this.roster.filter((r) => r.id !== conn.pid);
      this.sendRoster();
      this.onMessage({ t: 'quit', id: conn.pid }, 'h'); // internal: the game turns it into 'left'
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  sendRoster() {
    this.broadcast({ t: 'roster', roster: this.roster }, { self: false });
    this.onRoster(this.roster);
  }

  join(code, name) {
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      this.peer = peer;
      let done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Timed out connecting to the room.'), 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => conn.send({ t: 'hello', name: cleanName(name) }));
        conn.on('data', (m) => {
          this.lastHostMsg = Date.now();
          if (!m || typeof m !== 'object' || m.t === 'ping') return;
          if (m.t === 'refused') { fail(m.why); return; }
          if (m.t === 'welcome' && !done) {
            done = true;
            clearTimeout(timer);
            this.id = m.id;
            this.code = code;
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
        conn.on('close', () => this.lost('The host left the game.'));
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
    try { this.peer?.destroy(); } catch { /* already gone */ }
  }
}
