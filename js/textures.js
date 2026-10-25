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

// The mimic's face: pale, stretched, with an empty smile. Transparent outside the face.
export function faceTexture() {
  const [c, g] = canvas(256, 320);
  const skin = g.createRadialGradient(128, 140, 20, 128, 160, 150);
  skin.addColorStop(0, '#9e978a'); skin.addColorStop(0.65, '#6b655a'); skin.addColorStop(1, '#2a2622');
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(128, 160, 108, 150, 0, 0, Math.PI * 2); g.fill();
  // Eye holes.
  g.fillStyle = '#050403';
  [[84, 128], [172, 128]].forEach(([x, y], i) => {
    g.beginPath(); g.ellipse(x, y + (i ? 8 : 0), 30, 44, i ? 0.2 : -0.2, 0, Math.PI * 2); g.fill();
  });
  // Dark streaks running down from the eyes.
  for (const x of [84, 172]) for (let i = 0; i < 3; i++) {
    const sx = x - 14 + Math.random() * 28, len = 50 + Math.random() * 70;
    const grad = g.createLinearGradient(0, 150, 0, 150 + len);
    grad.addColorStop(0, 'rgba(5,4,3,.9)'); grad.addColorStop(1, 'rgba(5,4,3,0)');
    g.fillStyle = grad;
    g.fillRect(sx, 150, 3 + Math.random() * 4, len);
  }
  // Mouth: far too wide, with thin teeth.
  g.beginPath();
  g.moveTo(40, 220); g.quadraticCurveTo(128, 290, 216, 216); g.quadraticCurveTo(128, 262, 40, 220);
  g.fill();
  g.strokeStyle = 'rgba(200,190,170,.7)'; g.lineWidth = 2;
  for (let x = 54; x < 206; x += 9) {
    const y = 224 + Math.sin(((x - 40) / 176) * Math.PI) * 22;
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 1, y + 8); g.stroke();
  }
  // Dirt and veins.
  g.globalCompositeOperation = 'source-atop';
  stains(g, 256, 320, 6, 'rgba(60,40,30,.35)');
  g.strokeStyle = 'rgba(70,40,50,.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    let x = 60 + Math.random() * 140, y = 30 + Math.random() * 60;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 20; y += Math.random() * 14; g.lineTo(x, y); }
    g.stroke();
  }
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

export function makeTextures(theme) {
  const facility = theme === 'facility';
  return {
    wall: facility ? facilityWall() : houseWall(),
    floor: facility ? facilityFloor() : houseFloor(),
    ceiling: facility ? facilityCeiling() : houseCeiling(),
    wood: wood(),
    darkWood: wood([48, 30, 20]),
    crate: wood([120, 92, 58]),
    metal: metal(),
    locker: metal(facility ? '#4f5b55' : '#5c6166'),
    rust: metal('#5a3b26'),
    fabric: fabric(facility ? '#3b3d3a' : '#4a2f2c'),
    sheet: fabric('#8b877c'),
    exitSign: label('EXIT', '#160404', '#ff2b3a'),
  };
}
