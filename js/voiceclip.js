// "The voice that fooled you" as a short video to save or share (end screen, #btnBestVideo). No accounts, nothing
// uploaded: it's recorded right here in the browser (a canvas + the voice through MediaRecorder), then shared (phones)
// or downloaded. Camcorder static, then the voice playing with its waveform drawn live, whose voice it was, the line
// that lands ("It wasn't Bob."), and an end card with the building code so friends can play the same building.
import { ScareClip } from './clip.js';

const W = 640, H = 360;
const TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

export const canMakeVideo = () => ScareClip.supported();

// { buffer, sfx, whose ("Bob's voice"), punch ("It wasn't Bob."), place, code, onProgress(0..1) } -> Promise<{ blob, ext }>
export function makeVoiceVideo({ buffer, sfx, whose, punch, place, code, onProgress = () => {} }) {
  return new Promise((resolve, reject) => {
    const ctx = sfx.ctx;
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const g = canvas.getContext('2d');
    const out = ctx.createMediaStreamDestination();
    const input = ctx.createGain();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    input.connect(an);
    input.connect(out);
    input.connect(sfx.master); // (you hear it while it's being made)
    const stream = canvas.captureStream(30);
    for (const t of out.stream.getAudioTracks()) stream.addTrack(t);
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2500000 }); } catch (e) { reject(e); return; }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      try { input.disconnect(); } catch { /* ignore */ }
      resolve({ blob: new Blob(chunks, { type: type.split(';')[0] }), ext: type.startsWith('video/mp4') ? 'mp4' : 'webm' });
    };

    // The timeline (seconds): static, the voice, the line, the end card.
    const STATIC = 1.4, voiceAt = STATIC + 0.6;
    const em = { input, setPos() {}, setOcclusion() {} };
    let voiceLen = Math.min(10, buffer.duration / 0.96 + 0.3);
    let punchAt, cardAt, END;
    const plan = () => { punchAt = voiceAt + voiceLen + 0.5; cardAt = punchAt + 2.2; END = cardAt + 2.6; };
    plan();
    const wave = new Float32Array(an.fftSize);
    const t0 = performance.now();
    let played = false;
    rec.start(250);
    sfx._noise(input, { dur: STATIC, type: 'highpass', freq: 400, q: 0.5, peak: 0.12 }); // tape hiss before it starts

    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      onProgress(Math.min(1, t / END));
      if (!played && t >= voiceAt) { played = true; voiceLen = Math.min(10, sfx.playVoice(buffer, em, 'lure') + 0.2); plan(); }
      g.fillStyle = '#050505'; g.fillRect(0, 0, W, H);
      if (t < STATIC) { // snow
        const img = g.createImageData(W / 4, H / 4);
        for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 200 * (1 - t / STATIC * 0.7); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        const tmp = document.createElement('canvas'); tmp.width = W / 4; tmp.height = H / 4;
        tmp.getContext('2d').putImageData(img, 0, 0);
        g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, W, H);
      }
      const text = (s, y, size, color = '#e9e4da', alpha = 1, font = 'monospace') => {
        g.globalAlpha = alpha; g.font = `${size}px ${font}`; g.textAlign = 'center';
        g.fillStyle = 'rgba(255,40,60,.5)'; g.fillText(s, W / 2 - 1.5, y); // the colours never quite line up on tape
        g.fillStyle = 'rgba(40,200,255,.4)'; g.fillText(s, W / 2 + 1.5, y);
        g.fillStyle = color; g.fillText(s, W / 2, y);
        g.globalAlpha = 1; g.textAlign = 'left';
      };
      if (t >= STATIC && t < cardAt) {
        const fade = Math.min(1, (t - STATIC) / 0.5);
        text('THE VOICE THAT FOOLED YOU', 64, 15, '#c9332f', fade);
        // The voice, as it plays.
        an.getFloatTimeDomainData(wave);
        g.strokeStyle = 'rgba(233,228,218,.9)'; g.lineWidth = 2; g.beginPath();
        for (let i = 0; i < wave.length; i += 4) { const x = (i / wave.length) * (W - 80) + 40, y = H / 2 - 10 + Math.max(-1, Math.min(1, wave[i] * 1.6)) * 80; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
        if (t >= voiceAt) text(whose, H - 92, 22, '#e9e4da', Math.min(1, (t - voiceAt) / 0.4));
        if (t >= punchAt) {
          g.fillStyle = 'rgba(5,5,5,.85)'; g.fillRect(0, H / 2 - 60, W, 120);
          text(punch, H / 2 + 12, 34, '#f2efe6', Math.min(1, (t - punchAt) / 0.25), 'Georgia, serif');
        }
      }
      if (t >= cardAt) {
        const a = Math.min(1, (t - cardAt) / 0.5);
        text('MIMIC', H / 2 - 20, 54, '#e9e4da', a, 'Georgia, serif');
        text('it learns your voice', H / 2 + 14, 15, '#a8a196', a);
        if (code) text(`${place} · play this building: ${code}`, H / 2 + 62, 14, '#d9b26a', a);
        text('merchantsteam29.github.io/mimic', H / 2 + 88, 14, '#e9e4da', a);
      }
      // The camcorder: REC, the date, scanlines, grain, the odd tracking line.
      g.font = 'bold 18px monospace'; g.fillStyle = '#ff2b3a';
      if ((t * 2) % 2 < 1.3) { g.beginPath(); g.arc(24, 26, 7, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#f2efe6'; g.fillText('REC', 38, 32);
      g.fillText('OCT 25 2026', 18, H - 42);
      const s = 13 + Math.floor(t);
      g.fillText(`02:13:${String(s % 60).padStart(2, '0')} AM`, 18, H - 20);
      g.fillStyle = 'rgba(0,0,0,.22)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      if (Math.random() < 0.08) { const y = Math.random() * H; g.fillStyle = 'rgba(240,235,225,.25)'; g.fillRect(0, y, W, 2 + Math.random() * 4); }
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
      if (t < END) requestAnimationFrame(draw);
      else setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, 150);
    };
    requestAnimationFrame(draw);
  });
}
