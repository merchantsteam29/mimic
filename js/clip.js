// Save the jumpscare: a short video of the moment it got you, with the game's sound (your own voice
// screaming included), stamped like camcorder footage, to save or share from the end screen.
// Recording starts when it starts chasing you (or when it catches you without a chase), and stops just
// after SIGNAL LOST. A chase you get away from is thrown away.
const W = 640, H = 360, MAX = 14; // seconds kept before the catch
const TYPES = ['video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

export class ScareClip {
  constructor(sfx) {
    this.sfx = sfx;
    this.rec = null;
    this.blob = null;
    this.onReady = null;
  }

  static supported() {
    return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream && TYPES.some((t) => MediaRecorder.isTypeSupported(t));
  }

  get recording() { return !!this.rec; }

  start() {
    if (this.rec || !ScareClip.supported()) return;
    try {
      this.canvas ||= Object.assign(document.createElement('canvas'), { width: W, height: H });
      this.ctx = this.canvas.getContext('2d');
      const stream = this.canvas.captureStream(30);
      for (const t of this.sfx.tap.stream.getAudioTracks()) stream.addTrack(t);
      this.type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, { mimeType: this.type, videoBitsPerSecond: 2500000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (rec.keep) { this.blob = new Blob(chunks, { type: this.type.split(';')[0] }); this.onReady?.(this.blob); }
      };
      rec.start(250);
      this.rec = rec;
      this.t0 = performance.now();
    } catch { this.rec = null; }
  }

  // Keep it (the catch) or throw it away (it gave up the chase).
  stop(keep) {
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    rec.keep = keep;
    try { rec.stop(); } catch { /* already stopped */ }
  }

  // A chase that's gone on too long: start again, so the clip ends near the catch.
  get stale() { return this.rec && performance.now() - this.t0 > MAX * 1000; }

  // Every rendered frame while recording: the game picture, then the camcorder stamp and where it's from.
  frame(src, stamp, lost = false) {
    if (!this.rec) return;
    const g = this.ctx, sw = src.width, sh = src.height, k = Math.max(W / sw, H / sh);
    if (lost) { // SIGNAL LOST
      g.fillStyle = '#050505'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#e9e4da'; g.font = 'bold 34px monospace'; g.textAlign = 'center';
      g.fillText('S I G N A L   L O S T', W / 2, H / 2 + 12);
      g.textAlign = 'left';
    } else g.drawImage(src, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
    g.font = 'bold 18px monospace';
    g.fillStyle = '#ff2b3a';
    if ((performance.now() / 500) % 2 < 1.3) { g.beginPath(); g.arc(24, 26, 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f2efe6';
    g.fillText('REC', 38, 32);
    stamp.split('\n').forEach((l, i) => g.fillText(l, 18, H - 42 + i * 22));
    g.font = '13px monospace';
    g.fillStyle = 'rgba(242,239,230,.75)';
    g.textAlign = 'right';
    g.fillText('MIMIC · merchantsteam29.github.io/mimic', W - 14, H - 14);
    g.textAlign = 'left';
  }

  get ext() { return this.type?.startsWith('video/mp4') ? 'mp4' : 'webm'; }

  dispose() { this.stop(false); }
}
