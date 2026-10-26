// Versus (online lobby mode, 2+ players): red team against blue team, in the same building, with it
// hunting both. Everything else is shared, so the race is for the lever: the team that turns the power
// on wins if at least one of them gets out. If they all die, the team that got more people out wins.
// Each team only hears its own walkie-talkies. A team armband shows who's on which side.
import * as THREE from 'three';

export const TEAMS = [
  { name: 'Red', color: 0xc8323a, css: '#e05060' },
  { name: 'Blue', color: 0x3a6ad0, css: '#60a0f0' },
];

export class Versus {
  constructor(g, teams) {
    this.g = g;
    this.on = !!g.mp && !!teams && Object.keys(teams).length > 1;
    this.teams = teams || {};
    this.leverTeam = null;
    if (!this.on) return;
    for (const [id, r] of g.remotes) {
      const t = TEAMS[this.teams[id]];
      if (!t) continue;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.09, 0.135), new THREE.MeshStandardMaterial({ color: t.color, emissive: t.color, emissiveIntensity: 0.35 }));
      band.position.y = -0.14;
      r.arms[0].add(band);
    }
  }

  team(id = this.g.me) { return TEAMS[this.teams[id]] || null; }
  same(a, b) { return !this.on || this.teams[a] === this.teams[b]; }

  begin() {
    if (!this.on) return;
    this.g.toast(`You're on the ${this.team().name} team. Pull the lever first, then get out.`);
  }

  // Everyone: the power came on. Whoever pulled the lever won the race for their team.
  powered(by) {
    if (!this.on) return;
    this.leverTeam = this.teams[by] ?? null;
    const t = TEAMS[this.leverTeam];
    if (t && this.g.state === 'playing') setTimeout(() => this.g.toast(this.leverTeam === this.teams[this.g.me] ? 'Your team got there first. Now get out.' : `The ${t.name} team got there first. Get out anyway.`), 2800);
  }

  line() {
    if (!this.on) return null;
    const t = this.team();
    return this.leverTeam === null ? `${t.name} team: get to the lever first` : `${TEAMS[this.leverTeam].name} team turned the power on`;
  }

  // Host: who won (goes in 'end').
  result() {
    if (!this.on) return {};
    const g = this.g, out = [0, 1].map((t) => g.order.filter((id) => this.teams[id] === t && g.status.get(id) === 'out').length);
    let winner = null;
    if (this.leverTeam !== null && out[this.leverTeam] > 0) winner = this.leverTeam;
    else if (out[0] !== out[1]) winner = out[0] > out[1] ? 0 : 1;
    return { versus: { teams: this.teams, lever: this.leverTeam, out, winner } };
  }
}
