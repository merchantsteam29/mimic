// Procedural canvas textures, so the game ships without image files.
import * as THREE from 'three';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Soft blotches: a tiny random image scaled up with smoothing.
function blotches(g, w, h, cells, alpha, dark = true) {
  const [s, sg] = canvas(cells);
  const img = sg.createImageData(cells, cells);
  for (let i = 0; i < cells * cells; i++) {
    const v = Math.random() * 255;
    img.data.set([dark ? 0 : 255, dark ? 0 : 255, dark ? 0 : 255, v * alpha], i * 4);
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(s, 0, 0, w, h);
}

function grain(g, w, h, amount) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Water streaks running down from the top.
function streaks(g, w, h, count, color) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w, sw = 4 + Math.random() * 18, len = h * (0.2 + Math.random() * 0.6);
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, sw, len);
  }
}

function stains(g, w, h, count, color) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * w * 0.2;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// ---------- facility ----------
function facilityWall() {
  const [c, g] = canvas(256, 384); // one 2m x 3m wall face
  g.fillStyle = '#7a776f'; g.fillRect(0, 0, 256, 384);          // bare concrete above
  g.fillStyle = '#4c5a54'; g.fillRect(0, 230, 256, 154);         // institutional paint below
  g.fillStyle = '#8f8a3a'; g.fillRect(0, 224, 256, 8);           // hazard-yellow stripe
  g.fillStyle = '#2a2a28'; g.fillRect(0, 372, 256, 12);          // skirting
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 110, 256, 2); g.fillRect(126, 0, 2, 224); // panel seams
  blotches(g, 256, 384, 8, 0.35);
  streaks(g, 256, 230, 6, 'rgba(40,30,20,.35)');
  stains(g, 256, 384, 4, 'rgba(30,25,15,.35)');
  grain(g, 256, 384, 26);
  return toTexture(c);
}

function facilityFloor() {
  const [c, g] = canvas(256); // one 2m cell: 4x4 tiles
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 150 + Math.random() * 25;
    g.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
    g.fillRect(x * 64, y * 64, 64, 64);
  }
  g.strokeStyle = 'rgba(30,30,25,.6)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  blotches(g, 256, 256, 6, 0.45);
  stains(g, 256, 256, 3, 'rgba(50,35,20,.4)');
  grain(g, 256, 256, 30);
  return toTexture(c);
}

function facilityCeiling() {
  const [c, g] = canvas(256);
  g.fillStyle = '#8c8a84'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#4a4945'; g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124); g.strokeRect(130, 2, 124, 124); g.strokeRect(2, 130, 124, 124); g.strokeRect(130, 130, 124, 124);
  stains(g, 256, 256, 3, 'rgba(90,60,20,.45)');
  if (Math.random() < 0.5) { g.fillStyle = '#0b0b0b'; g.fillRect(130, 130, 124, 124); } // missing tile
  grain(g, 256, 256, 20);
  return toTexture(c);
}

// ---------- hospital ----------
function hospitalWall() {
  const [c, g] = canvas(256, 384); // one 2m x 3m wall face
  g.fillStyle = '#9a9c8e'; g.fillRect(0, 0, 256, 384);           // old cream paint above
  // Pale green tiles up to shoulder height.
  for (let y = 200; y < 372; y += 21) for (let x = 0; x < 256; x += 32) {
    const v = Math.random() * 10;
    g.fillStyle = `rgb(${112 + v},${138 + v},${122 + v})`;
    g.fillRect(x + 1, y + 1, 30, 19);
  }
  g.fillStyle = '#4e5a52'; g.fillRect(0, 194, 256, 6);           // tile cap
  g.fillStyle = '#2a2c28'; g.fillRect(0, 372, 256, 12);          // skirting
  blotches(g, 256, 384, 8, 0.3);
  streaks(g, 256, 200, 5, 'rgba(60,50,25,.35)');
  stains(g, 256, 384, 4, 'rgba(40,30,15,.35)');
  // Now and then, a smear nobody cleaned.
  if (Math.random() < 0.25) stains(g, 256, 384, 1, 'rgba(70,8,8,.45)');
  grain(g, 256, 384, 24);
  return toTexture(c);
}

function hospitalFloor() {
  const [c, g] = canvas(256); // one 2m cell: checkerboard linoleum
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const dark = (x + y) % 2, v = Math.random() * 10;
    g.fillStyle = dark ? `rgb(${58 + v},${70 + v},${64 + v})` : `rgb(${150 + v},${152 + v},${140 + v})`;
    g.fillRect(x * 64, y * 64, 64, 64);
  }
  blotches(g, 256, 256, 6, 0.4);
  stains(g, 256, 256, 3, 'rgba(50,40,20,.4)');
  grain(g, 256, 256, 26);
  return toTexture(c);
}

// ---------- mall ----------
function mallWall() {
  const [c, g] = canvas(256, 384); // one 2m x 3m wall face
  g.fillStyle = '#8f8b84'; g.fillRect(0, 0, 256, 384);           // old paint
  g.fillStyle = '#5c2a2e'; g.fillRect(0, 70, 256, 26);           // the shop-front band
  g.fillStyle = '#c9b48a'; g.fillRect(0, 96, 256, 3);
  // Big pale tiles below.
  for (let y = 260; y < 372; y += 56) for (let x = 0; x < 256; x += 64) {
    const v = Math.random() * 10;
    g.fillStyle = `rgb(${150 + v},${144 + v},${132 + v})`;
    g.fillRect(x + 1, y + 1, 62, 54);
  }
  g.fillStyle = '#2a2826'; g.fillRect(0, 372, 256, 12);          // skirting
  // Sometimes an old poster, faded and peeling.
  if (Math.random() < 0.35) {
    g.save(); g.translate(60 + Math.random() * 100, 130); g.rotate((Math.random() - 0.5) * 0.08);
    g.fillStyle = '#b8ac90'; g.fillRect(0, 0, 90, 120);
    g.fillStyle = 'rgba(150,30,35,.75)'; g.font = 'bold 30px Inter, sans-serif'; g.fillText('SALE', 10, 42);
    g.fillStyle = 'rgba(60,50,40,.6)'; g.font = '12px Inter, sans-serif'; g.fillText('EVERYTHING', 12, 66); g.fillText('MUST GO', 12, 82);
    g.restore();
  }
  blotches(g, 256, 384, 8, 0.3);
  streaks(g, 256, 260, 4, 'rgba(50,40,25,.3)');
  stains(g, 256, 384, 3, 'rgba(40,30,15,.3)');
  grain(g, 256, 384, 22);
  return toTexture(c);
}

function mallFloor() {
  const [c, g] = canvas(256); // one 2m cell: big terrazzo tiles
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const v = Math.random() * 8;
    g.fillStyle = `rgb(${132 + v},${126 + v},${116 + v})`;
    g.fillRect(x * 128 + 1, y * 128 + 1, 126, 126);
  }
  for (let i = 0; i < 900; i++) { // the chips in the stone
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(60,55,50,.5)' : v < 0.8 ? 'rgba(190,180,160,.5)' : 'rgba(120,60,50,.4)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.fillStyle = '#4a4640';
  g.fillRect(0, 127, 256, 2); g.fillRect(127, 0, 2, 256);
  blotches(g, 256, 256, 6, 0.35);
  stains(g, 256, 256, 2, 'rgba(50,40,20,.35)');
  grain(g, 256, 256, 20);
  return toTexture(c);
}

// ---------- school ----------
function schoolWall() {
  const [c, g] = canvas(256, 384); // one 2m x 3m wall face: painted cinder blocks
  g.fillStyle = '#a7a492'; g.fillRect(0, 0, 256, 384);           // cream above
  g.fillStyle = '#5e7480'; g.fillRect(0, 230, 256, 142);         // blue-grey below
  g.fillStyle = '#8a3a2a'; g.fillRect(0, 224, 256, 6);           // a red stripe
  g.strokeStyle = 'rgba(40,40,35,.35)'; g.lineWidth = 2;
  for (let y = 0; y < 372; y += 24) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
    for (let x = (y / 24) % 2 ? 32 : 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 24); g.stroke(); }
  }
  g.fillStyle = '#2a2826'; g.fillRect(0, 372, 256, 12);          // skirting
  // Children's drawings, sometimes. Some of them are of something tall.
  if (Math.random() < 0.4) {
    for (let i = 0; i < 2; i++) {
      const x = 30 + i * 110 + Math.random() * 20, y = 110 + Math.random() * 30;
      g.fillStyle = '#e8e2cc'; g.fillRect(x, y, 70, 56);
      g.strokeStyle = ['#2a4a8a', '#8a2a2a', '#2a6a3a'][i % 3]; g.lineWidth = 2;
      g.beginPath(); g.arc(x + 20, y + 22, 6, 0, Math.PI * 2); g.moveTo(x + 20, y + 28); g.lineTo(x + 20, y + 44); g.stroke(); // a person
      g.strokeStyle = '#111'; g.beginPath(); g.moveTo(x + 50, y + 6); g.lineTo(x + 50, y + 50); g.moveTo(x + 50, y + 16); g.lineTo(x + 38, y + 40); g.moveTo(x + 50, y + 16); g.lineTo(x + 62, y + 40); g.stroke(); // it
    }
  }
  blotches(g, 256, 384, 8, 0.28);
  streaks(g, 256, 230, 4, 'rgba(50,40,25,.3)');
  stains(g, 256, 384, 3, 'rgba(40,30,15,.3)');
  grain(g, 256, 384, 22);
  return toTexture(c);
}

function schoolFloor() {
  const [c, g] = canvas(256); // one 2m cell: speckled vinyl tiles
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = Math.random() * 10, odd = Math.random() < 0.08;
    g.fillStyle = odd ? `rgb(${90 + v},${110 + v},${120 + v})` : `rgb(${158 + v},${154 + v},${140 + v})`;
    g.fillRect(x * 64 + 1, y * 64 + 1, 62, 62);
  }
  for (let i = 0; i < 700; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(60,60,55,.45)' : 'rgba(200,195,180,.4)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 1); }
  blotches(g, 256, 256, 6, 0.35);
  stains(g, 256, 256, 2, 'rgba(50,40,20,.35)');
  grain(g, 256, 256, 20);
  return toTexture(c);
}

// The chalkboard, and what's written on it.
function chalkboard() {
  const [c, g] = canvas(512, 290);
  g.fillStyle = '#1f2b24'; g.fillRect(0, 0, 512, 290);
  blotches(g, 512, 290, 10, 0.25, false);
  g.fillStyle = 'rgba(230,230,220,.8)';
  g.font = '22px "Special Elite", monospace';
  const line = ['I will not talk in class.', 'I will not answer it.', 'It sounds like Mrs. Hale.', 'DONT LET IT HEAR YOU'][Math.floor(Math.random() * 4)];
  for (let i = 0; i < 9; i++) g.fillText(line, 22 + Math.random() * 6, 34 + i * 28);
  return toTexture(c);
}

// ---------- hotel ----------
function hotelWall() {
  const [c, g] = canvas(256, 384); // one 2m x 3m wall face: old damask paper over dark wood panelling
  g.fillStyle = '#4a1a1c'; g.fillRect(0, 0, 256, 384);
  g.fillStyle = 'rgba(176,132,70,.32)';
  for (let y = 10; y < 240; y += 56) for (let x = (y / 56) % 2 ? 32 : 0; x < 288; x += 64) {
    g.beginPath(); g.ellipse(x, y, 14, 22, 0, 0, Math.PI * 2); g.fill();          // a damask motif, roughly
    g.beginPath(); g.ellipse(x, y, 5, 30, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#2a1a10'; g.fillRect(0, 244, 256, 128);        // panelling
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3;
  for (let x = 8; x < 256; x += 64) g.strokeRect(x, 256, 52, 100);
  g.fillStyle = '#5a3a20'; g.fillRect(0, 240, 256, 6);          // the rail
  g.fillStyle = '#1a120c'; g.fillRect(0, 372, 256, 12);
  blotches(g, 256, 384, 8, 0.3);
  streaks(g, 256, 240, 4, 'rgba(30,20,10,.35)');
  stains(g, 256, 384, 3, 'rgba(30,20,10,.35)');
  grain(g, 256, 384, 20);
  return toTexture(c);
}

function hotelFloor() {
  const [c, g] = canvas(256); // one 2m cell of that carpet: interlocking hexagons in orange, brown and red
  g.fillStyle = '#4a2410'; g.fillRect(0, 0, 256, 256);
  const hex = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); };
  for (let y = -32; y < 300; y += 64) for (let x = -37; x < 300; x += 74) {
    const ox = (Math.round((y + 32) / 64) % 2) * 37;
    hex(x + ox, y, 34, '#a8481c'); hex(x + ox, y, 24, '#3a1a0c'); hex(x + ox, y, 12, '#8a1c14');
  }
  blotches(g, 256, 256, 6, 0.35);
  stains(g, 256, 256, 3, 'rgba(20,10,5,.4)');
  grain(g, 256, 256, 18);
  return toTexture(c);
}

// ---------- forest ----------
function forestWall() {
  const [c, g] = canvas(256, 384); // a thicket: black tangle, a little dead green
  g.fillStyle = '#0c0f0a'; g.fillRect(0, 0, 256, 384);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(${30 + Math.random() * 30},${36 + Math.random() * 34},${24 + Math.random() * 18},${0.4 + Math.random() * 0.5})`;
    g.lineWidth = 1 + Math.random() * 3;
    const x = Math.random() * 256, y = Math.random() * 384, a = Math.random() * Math.PI * 2, l = 10 + Math.random() * 40;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  grain(g, 256, 384, 18);
  return toTexture(c);
}

function forestFloor() {
  const [c, g] = canvas(256); // one 2m cell: dirt, dead leaves, needles
  g.fillStyle = '#2a2219'; g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 10, 0.5);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${70 + Math.random() * 50},${45 + Math.random() * 30},${20 + Math.random() * 15},${0.5 + Math.random() * 0.4})`;
    g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 1 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 120; i++) { g.strokeStyle = 'rgba(80,60,30,.5)'; g.lineWidth = 1; const x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12); g.stroke(); }
  grain(g, 256, 256, 26);
  return toTexture(c);
}

function cabinLogs() {
  const [c, g] = canvas(256, 384); // the cabin: horizontal logs
  for (let y = 0; y < 384; y += 32) {
    const v = Math.random() * 16;
    const gr = g.createLinearGradient(0, y, 0, y + 32);
    gr.addColorStop(0, `rgb(${50 + v},${36 + v},${24 + v})`); gr.addColorStop(0.5, `rgb(${92 + v},${68 + v},${44 + v})`); gr.addColorStop(1, `rgb(${40 + v},${28 + v},${18 + v})`);
    g.fillStyle = gr; g.fillRect(0, y, 256, 32);
  }
  streaks(g, 256, 384, 6, 'rgba(20,14,8,.35)');
  grain(g, 256, 384, 22);
  return toTexture(c);
}

// ---------- asylum ----------
function asylumWall() {
  const [c, g] = canvas(256, 384); // one 2m x 3m wall face: institutional green tiles, peeling paint, and the marks people left
  g.fillStyle = '#8e9a86'; g.fillRect(0, 0, 256, 384);
  for (let y = 180; y < 372; y += 16) for (let x = 0; x < 256; x += 16) {
    const v = Math.random() * 12;
    g.fillStyle = `rgb(${70 + v},${98 + v},${80 + v})`;
    g.fillRect(x + 1, y + 1, 14, 14);
  }
  g.fillStyle = '#3a4a3e'; g.fillRect(0, 174, 256, 6);
  g.fillStyle = '#222420'; g.fillRect(0, 372, 256, 12);
  // Paint hanging off in strips.
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,62,50,.6)'; const x = Math.random() * 240, y = Math.random() * 150; g.fillRect(x, y, 6 + Math.random() * 14, 10 + Math.random() * 30); }
  // Tally marks, scratched in at hand height. Sometimes a lot of them.
  if (Math.random() < 0.6) {
    g.strokeStyle = 'rgba(30,30,24,.7)'; g.lineWidth = 2;
    const n = 4 + Math.floor(Math.random() * 30), x0 = 30 + Math.random() * 120, y0 = 210 + Math.random() * 60;
    for (let i = 0; i < n; i++) {
      const grp = Math.floor(i / 5), k = i % 5, x = x0 + grp * 22 + k * 4;
      g.beginPath();
      if (k === 4) { g.moveTo(x - 18, y0 + 4); g.lineTo(x + 2, y0 + 18); } else { g.moveTo(x, y0); g.lineTo(x + 1, y0 + 22); }
      g.stroke();
    }
  }
  blotches(g, 256, 384, 9, 0.35);
  streaks(g, 256, 180, 6, 'rgba(50,45,20,.35)');
  stains(g, 256, 384, 4, 'rgba(40,30,15,.35)');
  grain(g, 256, 384, 24);
  return toTexture(c);
}

function asylumFloor() {
  const [c, g] = canvas(256); // one 2m cell: small grey-and-white tiles, cracked
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = Math.random() * 12, dark = (x + y) % 2;
    g.fillStyle = dark ? `rgb(${80 + v},${84 + v},${80 + v})` : `rgb(${150 + v},${152 + v},${146 + v})`;
    g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  }
  blotches(g, 256, 256, 7, 0.45);
  stains(g, 256, 256, 3, 'rgba(45,35,15,.45)');
  grain(g, 256, 256, 26);
  return toTexture(c);
}

// Quilted padding for the isolation cells.
function padded() {
  const [c, g] = canvas(128);
  g.fillStyle = '#c8c4b4'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const gr = g.createRadialGradient(x * 32 + 16, y * 32 + 16, 2, x * 32 + 16, y * 32 + 16, 22);
    gr.addColorStop(0, 'rgba(255,255,245,.25)'); gr.addColorStop(1, 'rgba(60,55,40,.35)');
    g.fillStyle = gr; g.fillRect(x * 32, y * 32, 32, 32);
  }
  stains(g, 128, 128, 2, 'rgba(60,45,20,.35)');
  grain(g, 128, 128, 20);
  return toTexture(c);
}

// ---------- church ----------
function churchWall() {
  const [c, g] = canvas(256, 384); // one 2m x 3m wall face: old limewash over stone, darker where hands have touched it
  g.fillStyle = '#9a9384'; g.fillRect(0, 0, 256, 384);
  g.fillStyle = '#5e584c'; g.fillRect(0, 250, 256, 134);          // stone below
  g.strokeStyle = 'rgba(30,28,24,.45)'; g.lineWidth = 2;
  for (let y = 250; y < 384; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = (y / 34) % 2 ? 20 : 60; x < 256; x += 80) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 34); g.stroke(); } }
  // Sometimes the outline of a painted arch, mostly gone.
  if (Math.random() < 0.5) { g.strokeStyle = 'rgba(110,40,30,.35)'; g.lineWidth = 6; g.beginPath(); g.moveTo(70, 240); g.lineTo(70, 120); g.arc(128, 120, 58, Math.PI, 0); g.lineTo(186, 240); g.stroke(); }
  blotches(g, 256, 384, 8, 0.35);
  streaks(g, 256, 250, 6, 'rgba(40,35,25,.35)');
  stains(g, 256, 384, 4, 'rgba(30,25,15,.35)');
  grain(g, 256, 384, 24);
  return toTexture(c);
}

function churchFloor() {
  const [c, g] = canvas(256); // one 2m cell: worn flagstones
  g.fillStyle = '#2a2722'; g.fillRect(0, 0, 256, 256);
  const stones = [[0, 0, 140, 110], [142, 0, 114, 110], [0, 112, 90, 144], [92, 112, 164, 70], [92, 184, 164, 72]];
  for (const [x, y, w, h] of stones) { const v = Math.random() * 14; g.fillStyle = `rgb(${88 + v},${84 + v},${76 + v})`; g.fillRect(x + 2, y + 2, w - 4, h - 4); }
  blotches(g, 256, 256, 6, 0.45);
  stains(g, 256, 256, 3, 'rgba(20,15,10,.45)');
  grain(g, 256, 256, 26);
  return toTexture(c);
}

// ---------- house ----------
const WALLPAPERS = [['#4d5a45', '#5f6d55'], ['#6e4f4f', '#7d5d5b'], ['#6f6141', '#7f7150'], ['#4a4f63', '#5a5f73']];

function houseWall() {
  const [base, motif] = WALLPAPERS[Math.floor(Math.random() * WALLPAPERS.length)];
  const [c, g] = canvas(256, 384);
  g.fillStyle = base; g.fillRect(0, 0, 256, 384);
  g.fillStyle = motif;
  for (let y = 0; y < 260; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < 256; x += 32) {
    g.beginPath(); g.moveTo(x + 16, y + 4); g.lineTo(x + 26, y + 16); g.lineTo(x + 16, y + 28); g.lineTo(x + 6, y + 16); g.fill();
  }
  // Wainscot panelling on the lower third.
  g.fillStyle = '#3a2618'; g.fillRect(0, 262, 256, 122);
  g.fillStyle = '#2b1b10'; g.fillRect(0, 258, 256, 8); g.fillRect(0, 372, 256, 12);
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3;
  g.strokeRect(14, 282, 100, 76); g.strokeRect(142, 282, 100, 76);
  blotches(g, 256, 384, 8, 0.3);
  streaks(g, 256, 260, 4, 'rgba(50,40,20,.3)');
  stains(g, 256, 384, 5, 'rgba(40,30,15,.35)');
  // Peeling patch.
  if (Math.random() < 0.6) { g.fillStyle = 'rgba(160,150,130,.35)'; g.fillRect(Math.random() * 180, Math.random() * 150, 40 + Math.random() * 30, 20 + Math.random() * 40); }
  grain(g, 256, 384, 22);
  return toTexture(c);
}

function houseFloor() {
  const [c, g] = canvas(256);
  for (let y = 0; y < 256; y += 32) {
    let x = -Math.random() * 120;
    while (x < 256) {
      const len = 90 + Math.random() * 120, v = 70 + Math.random() * 30;
      g.fillStyle = `rgb(${v},${v * 0.62},${v * 0.38})`;
      g.fillRect(x, y, len, 32);
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x, y, 2, 32);
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y + 4 + Math.random() * 24, len, 1); }
      x += len;
    }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y, 256, 2);
  }
  blotches(g, 256, 256, 6, 0.35);
  grain(g, 256, 256, 22);
  return toTexture(c);
}

function houseCeiling() {
  const [c, g] = canvas(256);
  g.fillStyle = '#8a8478'; g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 6, 0.3);
  stains(g, 256, 256, 3, 'rgba(90,70,30,.4)');
  g.strokeStyle = 'rgba(40,35,30,.5)'; g.lineWidth = 1;
  for (let i = 0; i < 3; i++) { // cracks
    let x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 8; j++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  grain(g, 256, 256, 18);
  return toTexture(c);
}

// ---------- materials for props ----------
function wood(base = [92, 60, 36]) {
  const [c, g] = canvas(128);
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
    g.fillRect(0, Math.random() * 128, 128, 1 + Math.random() * 2);
  }
  grain(g, 128, 128, 16);
  return toTexture(c);
}

function metal(base = '#5c6166') {
  const [c, g] = canvas(128);
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 128, 0, 1, 128); }
  stains(g, 128, 128, 4, 'rgba(110,50,20,.5)');
  g.strokeStyle = 'rgba(255,255,255,.12)';
  for (let i = 0; i < 8; i++) { g.beginPath(); const x = Math.random() * 128, y = Math.random() * 128; g.moveTo(x, y); g.lineTo(x + Math.random() * 30 - 15, y + Math.random() * 30 - 15); g.stroke(); }
  grain(g, 128, 128, 18);
  return toTexture(c);
}

function fabric(base) {
  const [c, g] = canvas(64);
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  blotches(g, 64, 64, 4, 0.3);
  grain(g, 64, 64, 30);
  return toTexture(c);
}

function label(text, bg, fg, w = 256, h = 96, font = 'bold 64px Inter, sans-serif') {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The mimic's face: almost human. Grey, stretched skin, eyes sunk into dark sockets with tiny
// staring pupils, hollow cheeks, and the top row of its teeth (the jaw is a separate piece).
export function faceTexture() {
  const [c, g] = canvas(256, 256);
  const skin = g.createRadialGradient(128, 118, 10, 128, 128, 128);
  skin.addColorStop(0, '#a29d93'); skin.addColorStop(0.5, '#7c776e'); skin.addColorStop(0.8, '#4c4842'); skin.addColorStop(1, 'rgba(30,28,26,0)');
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(128, 128, 104, 128, 0, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-atop';
  const dark = (x, y, rx, ry, a) => {
    const gr = g.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry));
    gr.addColorStop(0, `rgba(8,6,5,${a})`); gr.addColorStop(0.55, `rgba(20,14,12,${a * 0.75})`); gr.addColorStop(1, 'rgba(20,14,12,0)');
    g.fillStyle = gr;
    g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y);
    g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2); g.fill(); g.restore();
  };
  dark(86, 112, 46, 40, 1); dark(170, 116, 46, 40, 1);           // eye sockets, deep
  dark(86, 140, 30, 16, 0.5); dark(170, 144, 30, 16, 0.5);       // and bruised under
  dark(70, 176, 26, 40, 0.45); dark(186, 178, 26, 40, 0.45);     // hollow cheeks
  dark(128, 60, 70, 18, 0.18);                                    // brow
  // Eyes: black and wet all the way across, each with a milky pinprick that doesn't look the same way as the other.
  [[86, 114, -4], [170, 118, 5]].forEach(([x, y, off]) => {
    g.fillStyle = '#060504';
    g.beginPath(); g.ellipse(x, y, 15, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(70,64,58,.5)'; // the wet rim
    g.beginPath(); g.ellipse(x - 3, y - 4, 7, 2, -0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(210,205,190,.9)';
    g.beginPath(); g.arc(x + off, y + 1, 1.6, 0, Math.PI * 2); g.fill();
  });
  // Nose: a long shadow, and nostrils.
  const nose = g.createLinearGradient(118, 120, 138, 120);
  nose.addColorStop(0, 'rgba(30,20,15,.35)'); nose.addColorStop(0.5, 'rgba(0,0,0,0)'); nose.addColorStop(1, 'rgba(30,20,15,.25)');
  g.fillStyle = nose; g.fillRect(116, 110, 24, 80);
  g.fillStyle = 'rgba(10,6,5,.9)';
  g.beginPath(); g.ellipse(120, 194, 5, 3, 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(136, 194, 5, 3, -0.3, 0, Math.PI * 2); g.fill();
  // The corners of its mouth split open, up into the cheeks.
  g.strokeStyle = 'rgba(28,8,8,.95)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(72, 226); g.quadraticCurveTo(52, 214, 44, 186); g.stroke();
  g.beginPath(); g.moveTo(184, 226); g.quadraticCurveTo(206, 212, 213, 182); g.stroke();
  g.strokeStyle = 'rgba(120,30,28,.5)'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(72, 226); g.quadraticCurveTo(54, 216, 47, 194); g.stroke();
  g.beginPath(); g.moveTo(184, 226); g.quadraticCurveTo(204, 214, 210, 190); g.stroke();
  // Upper lip and the top row of teeth along the bottom edge.
  g.fillStyle = 'rgba(70,40,38,.9)'; g.fillRect(70, 222, 116, 8);
  for (let x = 74; x < 182; x += 7) {
    g.fillStyle = `rgb(${170 + Math.random() * 30},${160 + Math.random() * 25},${120 + Math.random() * 20})`;
    g.fillRect(x, 229, 5, 10 + Math.random() * 14);
  }
  // Blotches and veins.
  stains(g, 256, 256, 7, 'rgba(70,45,40,.3)');
  g.strokeStyle = 'rgba(60,50,80,.3)'; g.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    let x = 40 + Math.random() * 176, y = 20 + Math.random() * 60;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 18; y += Math.random() * 12; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The jaw: lower teeth along the top, a split lip, a long chin.
export function jawTexture() {
  const [c, g] = canvas(256, 160);
  const skin = g.createLinearGradient(0, 0, 0, 160);
  skin.addColorStop(0, '#78736a'); skin.addColorStop(1, 'rgba(50,46,42,0)');
  g.fillStyle = skin;
  g.beginPath(); g.moveTo(20, 0); g.lineTo(236, 0); g.quadraticCurveTo(220, 140, 128, 158); g.quadraticCurveTo(36, 140, 20, 0); g.fill();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(60,30,28,.95)'; g.fillRect(0, 18, 256, 9);
  for (let x = 48; x < 210; x += 7) {
    g.fillStyle = `rgb(${165 + Math.random() * 30},${150 + Math.random() * 25},${110 + Math.random() * 20})`;
    const h = 8 + Math.random() * 12;
    g.fillRect(x, 18 - h, 5, h);
  }
  stains(g, 256, 160, 4, 'rgba(60,40,35,.35)');
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function grainDataUrl() {
  const [c, g] = canvas(256);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

// Photo-scanned textures (CC0, ambientCG; see textures/CREDITS.txt). Loaded once, then each run gets
// its own copies (they share the image), so a run can set repeats and dispose them freely.
const loader = new THREE.TextureLoader();
const photos = new Map();
function photo(name, color = true) {
  let p = photos.get(name);
  if (!p) {
    p = { tex: null, loaded: false, copies: [] };
    // Copies made before the image arrives are refreshed when it does.
    p.tex = loader.load(`textures/${name}.jpg`, () => { p.loaded = true; for (const c of p.copies) c.needsUpdate = true; p.copies = []; });
    p.tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    photos.set(name, p);
  }
  const t = p.tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (p.loaded) t.needsUpdate = true; else p.copies.push(t);
  return t;
}

// Start downloading every photo texture (call at page load, so a run never starts with blank walls).
export function preloadPhotos() {
  for (const n of ['concreteWall', 'concreteFloor', 'officeCeiling', 'paintedMetal', 'woodFloor', 'plaster', 'wood']) {
    photo(`${n}_color`); photo(`${n}_normal`, false);
  }
}

// Wrinkled, clammy skin for the mimic.
// The mimic's skin: grey and blotched, bruised darker in patches, a few veins.
let skinMap = null;
export function skinTexture() {
  if (skinMap) return skinMap;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#5a5c56';
  x.fillRect(0, 0, 256, 256);
  const blot = (n, rgb, a, r0, r1) => {
    for (let i = 0; i < n; i++) {
      const cx = Math.random() * 256, cy = Math.random() * 256, r = r0 + Math.random() * (r1 - r0);
      for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { // tiles
        const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
        g.addColorStop(0, `rgba(${rgb},${a})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = g;
        x.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
      }
    }
  };
  blot(40, '22,20,18', 0.75, 10, 36);  // bruising
  blot(16, '62,36,52', 0.55, 8, 26);   // purple, under the skin
  blot(26, '20,26,18', 0.4, 4, 14);    // grave mould
  blot(20, '150,148,138', 0.3, 6, 20); // pale, stretched
  x.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) { // veins
    x.strokeStyle = `rgba(34,26,44,${0.4 + Math.random() * 0.35})`;
    x.beginPath();
    let px = Math.random() * 256, py = Math.random() * 256;
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 40; py += 10 + Math.random() * 20; x.lineTo(px, py); }
    x.stroke();
  }
  skinMap = new THREE.CanvasTexture(c);
  skinMap.colorSpace = THREE.SRGBColorSpace;
  skinMap.wrapS = skinMap.wrapT = THREE.RepeatWrapping;
  skinMap.repeat.set(2, 2);
  return skinMap;
}

export function skinNormal() {
  const t = photo('plaster_normal', false);
  t.repeat.set(3, 3);
  return t;
}

export function makeTextures(theme) {
  const facility = theme === 'facility', hospital = theme === 'hospital', mall = theme === 'mall', school = theme === 'school', hotel = theme === 'hotel', church = theme === 'church', asylum = theme === 'asylum', forest = theme === 'forest';
  const pair = (name) => [photo(`${name}_color`), photo(`${name}_normal`, false)];
  const [wall, wallN] = facility ? pair('concreteWall') : [hospital ? hospitalWall() : mall ? mallWall() : school ? schoolWall() : hotel ? hotelWall() : church ? churchWall() : asylum ? asylumWall() : forest ? forestWall() : houseWall(), photo('plaster_normal', false)];
  const [floor, floorN] = hospital || mall || school || asylum ? [hospital ? hospitalFloor() : mall ? mallFloor() : asylum ? asylumFloor() : schoolFloor(), photo('concreteFloor_normal', false)]
    : hotel ? [hotelFloor(), photo('plaster_normal', false)] : forest ? [forestFloor(), photo('concreteFloor_normal', false)] : church ? [churchFloor(), photo('concreteFloor_normal', false)] : pair(facility ? 'concreteFloor' : 'woodFloor');
  const [ceiling, ceilingN] = pair(facility || hospital || mall || school || asylum ? 'officeCeiling' : 'plaster');
  const [woodC, woodN] = pair('wood');
  const [metalC, metalN] = pair('paintedMetal');
  wall.repeat.set(1, 1.5); wallN.repeat.set(1, 1.5); // one 2m x 3m wall face
  const pad = asylum ? padded() : null, logs = forest ? cabinLogs() : null;
  return {
    padded: pad, cabin: logs,
    wall, wallN, floor, floorN, ceiling, ceilingN, woodN, metalN,
    wood: woodC,
    darkWood: photo('wood_color'),
    crate: wood([120, 92, 58]),
    metal: metal(),
    locker: metalC,
    rust: metal('#5a3b26'),
    fabric: fabric(facility ? '#3b3d3a' : hospital ? '#2f3b40' : mall ? '#4a3a44' : hotel ? '#5a3a24' : '#4a2f2c'),
    sheet: fabric('#8b877c'),
    exitSign: label('EXIT', '#160404', '#ff2b3a'),
    chalk: chalkboard(),
  };
}
