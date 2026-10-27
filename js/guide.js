// The field guide (title > Field guide): what's in there with you, where to hide, what to carry, what goes wrong.
// Written like notes from someone who went in before you. Information only: nothing to collect or unlock.
// Also the "What's new" note (newTape), shown once per release to players who have played before.

const SECTIONS = [
  ['creatures', 'What\'s in there', [
    { name: 'The mimic', file: 'Subject 01', what: 'Tall, grey, starved-looking. It records everything you say and plays it back to bring you to it.',
      tells: 'A friend calling from a room they couldn\'t be in. A sentence nobody would say. A voice that stutters on the first word, like a skipping tape. Lights stutter when it walks under them.',
      survive: 'It sees your flashlight from 22 m, in the dark from 12. It\'s slow under working lights and fast in the dark. Break its line of sight, then hide. Stay quiet in there.' },
    { name: 'The skinwalker', file: 'Subject 02', what: 'Online, if the host lets it in. It wears one of you who is still alive: their body, their light, their voice.',
      tells: 'When nobody\'s looking it goes on all fours. Its eyes shine in your flashlight. Up close, its head sits wrong. And your real friend\'s voice is coming from somewhere else.',
      survive: 'Don\'t walk up to a friend who\'s waiting at the edge of the light. Ask them something only they\'d answer.' },
    { name: 'The listener', file: 'Subject 03', what: 'Online, if the host lets it in. Blind. Its head splits open down the middle. It hears footsteps, doors, and you talking on voice chat.',
      tells: 'Clicking. Slow clicking while it wanders, fast when it has heard something.',
      survive: 'Stop. Crouch. Say nothing. It can walk right past you. Anyone it walks into is gone.' },
    { name: 'The stalker', file: 'Subject 04', what: 'Online, if the host lets it in. Pale, cracked, like an old doll. It only moves when nobody can see it.',
      tells: 'Stone dragging on stone, when you aren\'t looking. Every time you look back, it\'s closer and standing differently.',
      survive: 'Someone keeps it in view, in the light, while the others work. Don\'t turn your flashlight off near it.' },
    { name: 'The shadow', file: 'Subject 05', what: 'Online, if the host lets it in. A shape of darkness with two pale eyes. It lives where the lights are dead and can\'t step into a working light.',
      tells: 'Whispering, close by, in a dark room. Two small eyes where there shouldn\'t be any.',
      survive: 'Stay under working lights. Hold your flashlight on it and it burns away, for a while. Power cuts belong to it.' },
  ]],
  ['hiding', 'Where to hide', [
    { name: 'Lockers, wardrobes, fitting rooms, confessionals', file: 'Hiding 01', what: 'If it saw you go in, it comes to the door and listens.',
      tells: 'A heartbeat on the screen.', survive: 'Tap on the beat. Don\'t make a sound. One of them, somewhere, isn\'t empty.' },
    { name: 'Under a bed', file: 'Hiding 02', what: 'Low, and dark.', tells: 'You can only see the floor.',
      survive: 'Half the time it doesn\'t think to look. If it does, the heartbeat.' },
    { name: 'Vents', file: 'Hiding 03', what: 'Low grates in the walls of the bigger buildings.', tells: 'They clang when you get in and out, and it hears that.',
      survive: 'It can\'t follow you in. It will wait outside the grate for a while.' },
    { name: 'Curtains', file: 'Hiding 04', what: 'Hospital screens.', tells: 'Your feet show under the curtain.',
      survive: 'Quick to get behind. If it comes close, it sees your feet, and a curtain stops nothing.' },
  ]],
  ['items', 'What to carry', [
    { name: 'Flashlight', file: 'Item 01', what: 'Batteries lie around. A dying light flickers.', tells: '', survive: 'It helps you see. It helps it see you, from twice as far. Turn it off when you hide or hold still.' },
    { name: 'Tape recorder', file: 'Item 02', what: 'Two in every building. Record yourself, put it down, and walk away.', tells: '', survive: 'It plays your voice three times, loudly. It goes to see who\'s there. Its own trick, used on it.' },
    { name: 'Bottles, cans, camera', file: 'Item 03', what: 'Throw a bottle or a can where you want it to look. The disposable camera has three flashes.', tells: '', survive: 'A flash in its face blinds it for a couple of seconds. Run then.' },
    { name: 'Walkie-talkie', file: 'Item 04', what: 'Online. Hold B to talk to everyone, anywhere.', tells: 'Every other radio crackles while you talk. It hears the radios.', survive: 'If a friend calls you on the radio, check they\'re still alive. It has a radio too.' },
    { name: 'A friend\'s tape', file: 'Item 05', what: 'Online. Left where someone was taken.', tells: '', survive: 'Play it at the power panel to bring them back, or carry it out of the exit. Once a game.' },
  ]],
  ['events', 'When it goes wrong', [
    { name: 'Power cut', file: 'Event 01', what: 'Every light goes out for a while.', tells: 'A dying hum.', survive: 'It\'s fast in the dark. Hide, or stay by a friend with a light.' },
    { name: 'Storm', file: 'Event 02', what: 'Rain and thunder for a minute.', tells: 'Lightning shows everything, for a moment.', survive: 'The rain covers your footsteps: the best time to move.' },
    { name: 'Alarm', file: 'Event 03', what: 'Something sets off an alarm, far from all of you.', tells: '', survive: 'It goes to look. That\'s your window.' },
    { name: 'Lockdown', file: 'Event 04', what: 'Shutters slam. The doors near you won\'t open for a while.', tells: '', survive: 'Find another way round. It doesn\'t care about locks.' },
    { name: 'The bell', file: 'Event 05', what: 'In the church, now and then, the bell tolls. Once for every one of you it has taken.', tells: 'Count them.', survive: 'Nothing to do but listen. The statues move while you do.' },
    { name: 'The night shift', file: 'Event 06', what: 'Midnight to six, no jobs, the doors chained. The bell tolls each hour.', tells: 'Each night it\'s faster, sees further and there are fewer lights.',
      survive: 'Save your battery. Hide early, move when it\'s somewhere else. At 6 a.m. it lets go.' },
  ]],
];

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderGuide(root, tab = 'creatures') {
  const sec = SECTIONS.find((x) => x[0] === tab) || SECTIONS[0];
  root.querySelector('.guide-tabs').innerHTML = SECTIONS.map(([id, label]) => `<button data-tab="${id}" class="${id === sec[0] ? 'on' : ''}">${esc(label)}</button>`).join('');
  root.querySelector('.guide-list').innerHTML = sec[2].map((e) => `<article class="case">
      <div class="case-photo"><span>${esc(e.file)}</span><i>NO IMAGE<br>TAPE DAMAGED</i></div>
      <div class="case-text">
        <h3>${esc(e.name)}</h3>
        <p>${esc(e.what)}</p>
        ${e.tells ? `<p><b>Tells</b> ${esc(e.tells)}</p>` : ''}
        <p><b>Survive</b> ${esc(e.survive)}</p>
      </div>
    </article>`).join('');
  root.querySelectorAll('.guide-tabs button').forEach((b) => { b.onclick = () => renderGuide(root, b.dataset.tab); });
}

// ---------- what's new ----------
// Bump RELEASE when there's something worth telling players about, and rewrite NOTES.
export const RELEASE = 'alpha1-2026-10-26c';
const NOTES = [
  ['Midnight to six. They chained the doors behind you.', 'Night Shift (title screen, or a lobby Mode): hold on until 6 a.m. Every night you last, the next is worse.'],
  ['The bell tolled three times. There were four of us.', 'A new place: an old church. Hide in the confessionals. Don\'t trust the statues.'],
  ['They built a school, and a hotel. Someone is still answering the phones.', 'Two new places: a school at night and an old hotel.'],
  ['Subject 04 doesn\'t move. Not while you\'re looking.', 'Online creatures: the Stalker, and the blind Listener.'],
  ['We found her recorder by the vent. It was still playing her voice.', 'Tape recorders you can use as a decoy, things to throw, and new places to hide: beds, vents, curtains.'],
  ['The radios work. That isn\'t good news.', 'Walkie-talkies, a waiting room, versus mode, and bringing a friend back with their tape.'],
  ['You can hear each other properly now. So can it.', 'Voice chat is much clearer and louder.'],
  ['The dead are watching. Some of them are trying to help.', 'The dead see where it is and can leave marks for you.'],
  ['We wrote down everything we know.', 'A field guide is on the title screen.'],
  ['Subject 05 doesn\'t like the light. It likes the dark very much.', 'A fifth creature online: the Shadow.'],
  ['A new caller. She sounds like you.', 'A second story: The Operator, 5 chapters.'],
  ['Someone filmed the corridor. Watch the end of it.', 'The title screen has a corridor behind it. Pick your coat, hat and flashlight colour in the lobby, and reopen recent rooms.'],
  ['Strangers found the building too.', 'Quick Play finds you a public room. The dead can drift around on their own (R).'],
];

// Show the note if this release is new to someone who has played before. Returns true if shown.
export function newTape(el, onClose) {
  let seen = null, played = false;
  try { seen = localStorage.getItem('mimic.release'); played = !!(localStorage.getItem('mimic.settings') || localStorage.getItem('mimic.stats') || localStorage.getItem('mimic.tutorial')); } catch { return false; }
  const mark = () => { try { localStorage.setItem('mimic.release', RELEASE); } catch { /* ignore */ } };
  if (seen === RELEASE) return false;
  if (!played) { mark(); return false; } // brand new: nothing is "new" to them
  el.querySelector('.tape-lines').innerHTML = NOTES.map(([line, plain], i) =>
    `<li style="--i:${i}"><span class="tape-line">${esc(line)}</span><span class="tape-plain">${esc(plain)}</span></li>`).join('');
  el.hidden = false;
  el.querySelector('.tape-close').onclick = () => { el.hidden = true; mark(); onClose?.(); };
  return true;
}
