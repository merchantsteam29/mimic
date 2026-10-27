// The waiting room (online, before a game): a house with nothing in it that can hurt you.
// Part of Game (game.js): these methods are mixed into Game.prototype.
import { RemotePlayer } from './remote.js';

export const RoomPart = {
  // Nothing in here can hurt you: no mimic, no jobs, no scares. Hiding spots and doors still work.
  setupRoom() {
    for (const it of this.items) if (it && !['hide', 'idoor'].includes(it.type)) { it.active = false; it.mesh?.removeFromParent(); }
    for (const t of this.world.tapes) t.mesh.removeFromParent();
    this.world.fuseBox.mesh.visible = false;
    this.world.keycard?.mesh.removeFromParent();
    for (const d of this.world.doors) d.mesh.removeFromParent();
    this.level.doorsLocked = false; this.level.doors.length = 0; this.level.doorCells.clear();
    this.mimic.model.root.visible = false;
    this.mimic.x = this.mimic.z = -500;
    this.radio.fakeT = Infinity;
    this.hud.root.hidden = true;
    this.hud.cam.hidden = false;
  },

  simulateRoom(dt) {
    this.t += dt;
    if (!this.menuOpen) { this.updatePlayer(dt); this.updateFocus(); }
    else this.setPrompt(null);
    this.updateDoors(dt);
    this.chat.update(dt);
    this.radio.update(dt);
    for (const [id, r] of this.remotes) {
      if (!this.alive(id)) r.status = 'gone';
      r.update(dt, this.level.theme.surface, false);
    }
    if (this.mp) { this.netTick(dt); this.routeVoices(); }
  },

  // Someone joined or left the room.
  syncRoster(ids) {
    ids.forEach((id) => {
      if (!this.order.includes(id) && id === this.me) { this.order.push(id); this.status.set(id, 'alive'); return; } // (joined before the roster arrived)
      if (id === this.me || this.remotes.has(id)) { if (this.status.get(id) === 'left') this.status.set(id, 'alive'); return; }
      this.order.push(id);
      this.status.set(id, 'alive');
      this.remotes.set(id, new RemotePlayer(this.scene, this.sfx, this.order.indexOf(id), this.lookOf(id)));
    });
    for (const id of this.order) if (!ids.includes(id)) this.status.set(id, 'left');
    for (const [id, r] of this.remotes) r.setLook(this.lookOf(id)); // someone changed their look in the lobby
  },

};
