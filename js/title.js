// The title screen is found footage too: a camcorder overlay, scanlines and grain, lines of text
// that surface in the dark and sink away, eyes that open at the edge of the screen (and close when
// your cursor comes near), a tagline that doesn't always say the same thing, and, if it already has
// your voice, sometimes you'll hear it while you sit there.
import { grainDataUrl } from './textures.js';

const LINES = [
  'is someone there?', "it's behind you", "that wasn't me", "don't answer it", 'say something',
  'I can hear you breathing', 'come here', 'help me', 'you sound just like me', 'it was right next to me',
  'why did you leave me there', "don't look at the end of the hallway", "your friend isn't your friend",
  'say it again', 'I found something', 'hello?', "it's wearing her", 'keep talking', 'it only needs a few words',
  'we went in at 2:13', 'the lights went out one by one', "who's breathing?", 'it learned my name',
];
const TAGS = ['It learned your voice.', 'It is listening.', 'It sounds like you.', 'It is already here.', 'Say something.'];

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);

export function initTitle({ voiceCount = () => 0, whisper = () => false } = {}) {
  const screen = $('title');
  if (!screen) return;
  $('titleGrain').style.backgroundImage = `url(${grainDataUrl()})`;
  const shown = () => !screen.hidden;
  const fx = $('titleFx');
  let mouse = { x: -999, y: -999 };
  addEventListener('pointermove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });

  // A place in the dark, away from the menu in the middle.
  const edgeSpot = (w = 260) => {
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < 20; i++) {
      const x = rand(16, Math.max(17, W - w - 16)), y = rand(40, H - 60);
      const cx = Math.abs(x + w / 2 - W / 2), cy = Math.abs(y - H / 2);
      if (cx > Math.min(320, W * 0.3) || cy > H * 0.38) return { x, y };
    }
    return { x: 16, y: rand(40, H - 60) };
  };

  // Words surface and sink.
  (function line() {
    setTimeout(line, rand(2500, 6500));
    if (!shown() || document.hidden) return;
    const el = document.createElement('p');
    el.className = 'title-line';
    el.textContent = LINES[Math.floor(Math.random() * LINES.length)];
    const p = edgeSpot();
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    el.style.setProperty('--tilt', `${rand(-4, 4)}deg`);
    el.style.animationDuration = `${rand(5, 8)}s`;
    fx.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  })();

  // Eyes in the dark. They don't like being approached.
  (function eyes() {
    setTimeout(eyes, rand(9000, 20000));
    if (!shown() || document.hidden) return;
    const el = document.createElement('div');
    el.className = 'title-eyes';
    const p = edgeSpot(60);
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    el.style.setProperty('--s', rand(0.6, 1.3).toFixed(2));
    el.innerHTML = '<i></i><i></i>';
    fx.appendChild(el);
    const life = rand(2500, 5000);
    const watch = setInterval(() => {
      if (Math.hypot(mouse.x - p.x - 20, mouse.y - p.y) < 160) { el.remove(); clearInterval(watch); }
    }, 60);
    setTimeout(() => el.classList.add('open'), 50);
    setTimeout(() => el.classList.remove('open'), life);
    setTimeout(() => { el.remove(); clearInterval(watch); }, life + 800);
  })();

  // The tagline slips.
  const tag = screen.querySelector('.tag');
  const base = tag.textContent;
  (function slip() {
    setTimeout(slip, rand(7000, 14000));
    if (!shown() || document.hidden) return;
    const n = voiceCount();
    const alt = n && Math.random() < 0.5 ? `It has ${n} recording${n > 1 ? 's' : ''} of you.` : TAGS[Math.floor(Math.random() * TAGS.length)];
    tag.textContent = alt;
    tag.classList.add('slip');
    setTimeout(() => { tag.textContent = base; tag.classList.remove('slip'); }, rand(500, 1200));
  })();

  // Camcorder: a tape counter that only runs while you're here.
  const t0 = performance.now();
  (function counter() {
    if (shown()) {
      const s = Math.floor((performance.now() - t0) / 1000);
      $('titleCounter').textContent = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }
    setTimeout(counter, 500);
  })();

  // Sit on the title long enough, and it says something in your voice. Once per visit.
  let idle = 0, said = false;
  addEventListener('pointerdown', () => { idle = 0; });
  addEventListener('keydown', () => { idle = 0; });
  setInterval(() => {
    if (!shown()) { idle = 0; said = false; return; }
    idle++;
    if (!said && idle > 25 && whisper()) said = true;
  }, 1000);
}
