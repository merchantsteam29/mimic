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
    { name: 'The caller', file: 'Subject 07', what: 'Online, if the host lets it in. An old phone that wasn\'t there a minute ago, ringing on the floor near one of you. The voice on the line is usually someone it has already taken.',
      tells: 'Ringing, close by. Every ring carries, and it comes to see.', survive: 'Answer it and you\'ll know where the next thing you need is, but it heard you pick up, so move. Or get well away before it comes.' },
    { name: 'The double', file: 'Subject 06', what: 'Online, if the host lets it in. It walks the way one of you walked a minute or two ago: their coat, their light, their steps, sometimes their voice. It is not them.',
      tells: 'It never looks at you. It walks through doors that are shut. Your friend is somewhere else, talking.',
      survive: 'Let it pass. Don\'t walk up to it, don\'t hold your light on it, and if it\'s wearing you, don\'t look at it. Once it turns round, run: it gives up after a few seconds.' },
    { name: 'The Mother', file: 'Subject 08', what: 'Online, if the host lets it in. Huge, slow, bent double under the ceiling, something wrapped in a blanket held to her chest. She can\'t fit through a doorway.',
      tells: 'Heavy, slow footsteps. A lullaby, in your voices, all at once. When she sings, the mimic comes to listen.',
      survive: 'Walk away: she\'s slower than you. Get through a door and shut it behind you, and she can only stand outside. Don\'t be near her when she starts to sing.' },
    { name: 'The clown', file: 'Subject 10', what: 'In the fairground, always. Online, anywhere, if the host lets it in. A fairground mascot in a clown suit: a big foam head, a painted grin. There are statues of it all over the fairground. One of them isn\'t a statue.',
      tells: 'Big shoes slapping the ground when you aren\'t looking. It\'s closer each time you look back, and posed differently. Stare at it and its head turns to follow you. It laughs, in your voice.',
      survive: 'Like the stalker: someone keeps it in view, in the light. Count the statues when you pass them. If the count changes, you know which one it is. Its laugh brings the mimic.' },
    { name: 'The patient', file: 'Subject 11', what: 'In the hospital and the asylum, always. Online, anywhere, if the host lets it in. A thin body in a gown, its head wrapped in bandages, lying on a bed, a gurney, a bench. Some of the others lying about really are dead.',
      tells: 'It sits up after you pass and turns its head to watch you go. A moan, a creak of springs: it\'s getting up.',
      survive: 'Don\'t run near the bodies. If it\'s up, stop running, get out of its sight, or hide: it gives up and goes back to bed.' },
    { name: 'The swarm', file: 'Subject 12', what: 'In the mine and the subway, always. Online, anywhere, if the host lets them in. Rats, dozens of them. They come when it\'s near.',
      tells: 'Scrabbling in the dark, getting louder. Squealing.',
      survive: 'They don\'t bite. They give you away: whoever they run past, it knows exactly where. Step into a room, or hide, and let them go by.' },
    { name: 'The trains', file: 'Subject 09', what: 'Only in the subway. They still run. Nobody\'s driving them and they don\'t stop.',
      tells: 'A rumble that keeps growing, the horn, a light in the tunnel mouth. Then it\'s there.',
      survive: 'Get off the track and onto a platform. While one goes by nothing can hear you, not even it. If it\'s standing on the track, the train knocks it flat.' },
  ]],
  ['hiding', 'Where to hide', [
    { name: 'Lockers, wardrobes, fitting rooms, confessionals, padded cells, outhouses', file: 'Hiding 01', what: 'If it saw you go in, it comes to the door and listens.',
      tells: 'A heartbeat on the screen.', survive: 'Tap on the beat. Don\'t make a sound. One of them, somewhere, isn\'t empty.' },
    { name: 'Under a bed (or a cot)', file: 'Hiding 02', what: 'Low, and dark.', tells: 'You can only see the floor.',
      survive: 'Half the time it doesn\'t think to look. If it does, the heartbeat.' },
    { name: 'Vents', file: 'Hiding 03', what: 'Low grates in the walls of the bigger buildings.', tells: 'They clang when you get in and out, and it hears that.',
      survive: 'It can\'t follow you in. It will wait outside the grate for a while.' },
    { name: 'Culverts', file: 'Hiding 08', what: 'In the sewers. Round pipe mouths in the wall, the bars bent apart.', tells: 'Like a vent: it can\'t follow you in.',
      survive: 'Getting in and out makes a noise, and it hears that.' },
    { name: 'Crawl spaces', file: 'Hiding 07', what: 'In the mine. Low holes dug into the rock, propped up with timber.', tells: 'Like a vent: it can\'t follow you in.',
      survive: 'It will wait outside for a while. Getting in and out knocks rock loose, and it hears that.' },
    { name: 'Photo booths', file: 'Hiding 06', what: 'In the fairground. A booth with a curtain across the front.', tells: 'The heartbeat, like a locker.',
      survive: 'Pull the curtain and keep still.' },
    { name: 'Ticket booths', file: 'Hiding 05', what: 'In the subway. A booth with a window and a door.', tells: 'The heartbeat, like a locker.',
      survive: 'Keep away from the track while you wait in there: the trains are loud, but they don\'t stop it looking.' },
    { name: 'Curtains', file: 'Hiding 04', what: 'Hospital screens.', tells: 'Your feet show under the curtain.',
      survive: 'Quick to get behind. If it comes close, it sees your feet, and a curtain stops nothing.' },
  ]],
  ['items', 'What to carry', [
    { name: 'Flashlight', file: 'Item 01', what: 'Batteries lie around. A dying light flickers.', tells: '', survive: 'It helps you see. It helps it see you, from twice as far. Turn it off when you hide or hold still.' },
    { name: 'Tape recorder', file: 'Item 02', what: 'Two in every building. Record yourself, put it down, and walk away.', tells: '', survive: 'It plays your voice three times, loudly. It goes to see who\'s there. Its own trick, used on it.' },
    { name: 'Bottles, cans, camera', file: 'Item 03', what: 'Throw a bottle or a can where you want it to look. The disposable camera has three flashes.', tells: '', survive: 'A flash in its face blinds it for a couple of seconds. Run then.' },
    { name: 'Walkie-talkie', file: 'Item 04', what: 'Online. Hold B to talk to everyone, anywhere.', tells: 'Every other radio crackles while you talk. It hears the radios.', survive: 'If a friend calls you on the radio, check they\'re still alive. It has a radio too.' },
    { name: 'The lantern', file: 'Item 06', what: 'Escort mode, online. No flashlights work. One of you carries the only light.', tells: 'If it takes whoever is carrying it, the light goes out for everyone.', survive: 'Stay close to it: it\'s slower in the lantern\'s light. If it falls, someone has to pick it up, in the dark, and wait for it to catch. Hiding shutters it.' },
    { name: 'Speaker, crucifix, marks, wedges', file: 'Item 07', what: 'What the Sound guy, the Priest, the Scout and the Mechanic carry.',
      tells: 'The speaker plays its own noises; the crucifix gives off a warm light and a held note; a mark glows blue through the walls.',
      survive: 'Put the speaker down somewhere far before you need it. The crucifix only works when it\'s close and can see it. A wedged door keeps you out as well.' },
    { name: 'A friend\'s tape', file: 'Item 05', what: 'Online. Left where someone was taken.', tells: '', survive: 'Play it at the power panel to bring them back, or carry it out of the exit. Once a game.' },
  ]],
  ['events', 'When it goes wrong', [
    { name: 'Power cut', file: 'Event 01', what: 'Every light goes out for a while.', tells: 'A dying hum.', survive: 'It\'s fast in the dark. Hide, or stay by a friend with a light.' },
    { name: 'Storm', file: 'Event 02', what: 'Rain and thunder for a minute.', tells: 'Lightning shows everything, for a moment.', survive: 'The rain covers your footsteps: the best time to move.' },
    { name: 'Alarm', file: 'Event 03', what: 'Something sets off an alarm, far from all of you.', tells: '', survive: 'It goes to look. That\'s your window.' },
    { name: 'Lockdown', file: 'Event 04', what: 'Shutters slam. The doors near you won\'t open for a while.', tells: '', survive: 'Find another way round. It doesn\'t care about locks.' },
    { name: 'The bell', file: 'Event 05', what: 'In the church, now and then, the bell tolls. Once for every one of you it has taken.', tells: 'Count them.', survive: 'Nothing to do but listen. The statues move while you do.' },
    { name: 'Its moods', file: 'Event 07', what: 'It isn\'t the same thing every night. Some nights it\'s patient and talks; some nights it runs you down; some nights it lies; some nights it only watches.',
      tells: 'It never says. You find out from what it does (the end screen tells you what it was).', survive: 'Work out which one it is early, and play against it.' },
    { name: 'Tonight\'s twist', file: 'Event 08', what: 'Most nights one thing is different: the lights die faster, a fog, old batteries, it gets into the vents, it won\'t stop talking, or it\'s half blind and hears everything.',
      tells: 'You\'re told when you go in.', survive: 'Listen to the briefing.' },
    { name: 'The keypad', file: 'Event 09', what: 'Some exits have a keypad. The code is written on a sheet of paper somewhere in the building, and only whoever reads it sees it.',
      tells: 'A red light by the exit.', survive: 'Read it, say it out loud to your friends (quietly: it hears that too), and type it in. The beeping carries.' },
    { name: 'The lift', file: 'Event 10', what: 'Some buildings have no door out, only a lift. With the power on, call it, and it takes 40 seconds to come down. It comes for you while you wait.',
      tells: '', survive: 'Call it, then hide near the exit, not at it.' },
    { name: 'Strange rooms', file: 'Event 11', what: 'Some rooms aren\'t like the others: one flooded (slow, loud, every step splashes), one where the ceiling came down, one with a ring of candles.',
      tells: 'Something always happens the first time you walk in.', survive: 'Go round the flooded one if it\'s close.' },
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
export const RELEASE = 'beta1-2026-10-28b';
const NOTES = [
  ['The water down there is warm. It shouldn’t be warm. And it carries every sound you make.', 'A new place: the sewers. Every passage is a channel of black water up to your waist: you wade slowly, every step splashes, and it wades too. The chambers are dry. Hide in the culverts, where it can’t follow. The rats live down here.'],
  ['This is the last rough cut. After this one, the tape goes out to everybody. It’s been listening to all of you.', 'Mimic is in beta: nearly finished. Fourteen places, three stories, more things in the dark than we can count, and every mode we could think of. From here on it’s fixing and polishing, so if anything breaks, skips, or doesn’t feel right, press Report a bug and tell us.'],
  ['“Hi, it’s us. We’re running a little late, sorry.” The message is from last Tuesday. They called again tonight. Same words.', 'A third story: The Babysitter. A Saturday night job in a big house. The parents keep calling to say they’re on their way home. The kids say they never left. Five chapters, from the Hale house to the hotel to the old maternity ward, and back.'],
  ['Ship’s log. The passengers went below at midnight. The water went below at one. We still hear them in the cabins.', 'A new place: a liner in a storm. The whole ship rolls, the big waves throw you off your feet, the lower decks are flooded, and down in the engine room the noise is so loud nothing can hear your steps. Hide in a cabin wardrobe, or under a bunk.'],
  ['We tidied up in here. It didn’t like that.', 'Simpler menus: three ways in on the title screen, the rest under More ways to play. Hosts can pick creatures as a preset (just the mimic, a few more, everything) or pick their own. Settings has a search, and the rarely used ones are under More settings, with two new ones: bigger text for captions and subtitles, and a colour-blind mode.'],
  ['The stairs only go down. We counted the floors on the way. We stopped counting.', 'Endless descent (title screen, or a lobby Mode): every way out is the way down to another floor, a new place every time, and every floor is worse than the last. There’s nothing to win. Just how deep you got.'],
  ['You hear them before you see them. Then you see them. Then it hears you.', 'The swarm: when it gets near you, rats pour down the corridor right past you, squealing, and it hears exactly where you are. They don’t bite. Step into a room or hide and let them go by. Always in the mine and the subway; online, the host can let them in anywhere.'],
  ['Day 41. The radio picked something up again last night. It was my voice. I was asleep.', 'A new place: a research station in the snow. Huts joined by tunnels, and between them open yards in a blizzard: stay out there too long and you freeze, slow down, and your teeth chatter loud enough for it to hear. One hut has the radio set. Don\u2019t listen to it.'],
  ['There were four of us when we went down the shaft. There are still four of us. One of them has been very quiet.', 'A new place: an old mine, pitch black, timber holding up the roof, crawl spaces to hide in, and every voice coming back off the rock from somewhere else. A new creature: the patient, a body on a bed that sits up when you pass and gets up if you run (always in the hospital and the asylum; online, the host can let it in anywhere). And a new mode, Imposter voices: there\'s one more of you than there should be. Look at who you think it is, accuse, and vote.'],
  ["Those weren't its footsteps. They were mine. It walks like me now. It stops where I stop.", 'It watches how you move. After a while it walks like you when it isn\'t chasing: your pace, your stops, your footsteps, and if you creep, it creeps without a sound. And it practises: its first tries at your voice come out wrong, lower and catching like old tape. The longer the night goes, the better it gets.'],
  ['We found the tape from the camera that fell. It kept recording. You can see it coming up behind him the whole way.', 'When it gets you, you now see how: a replay from behind you, the last few seconds before it reached you, with the last second slowed down. Space skips it. Online, when a friend is taken while you\'re dead or out, press K to watch theirs.'],
  ['The music came back on by itself. The wheel is turning. We counted nine clowns by the gate. Then ten.', 'A new place: an abandoned fairground, outdoors. The ghost train still runs, the hall of mirrors has more of you in it than it should, and when the music comes on it covers your footsteps. And the clown: it lives there (online, the host can let it in anywhere). It only moves when nobody is looking, and it laughs in your voice.'],
  ['Listen to the tape again. I never said that. Those are my words, but I never said that.', 'It doesn\'t just repeat you any more. It cuts what you said into pieces and puts them back together into things you never said. Listen closely: the pitch slips between words, and the pauses are in the wrong places.'],
  ['Somebody else is down here. You can see their light from the stairs.', 'Quick Play now shows the public rooms open right now: whose they are, how full, and whether they\'re already playing. And the voice that fooled you can be saved as a short video to send to whoever it was. Saved jumpscares are MP4 now, so they play on more phones.'],
  ['The last train left at 12:40. We heard another one at 2:13. Then we heard her singing.', 'A new place: a closed subway station, where the trains still run, so stay off the track. Online, the Mother: huge, slow, too big for a doorway, and she sings in your voices. And four new classes: the Sound guy (a speaker that pulls it away), the Priest (a crucifix that makes it back off), the Scout (marks everyone can see) and the Mechanic (fast repairs, and doors wedged shut).'],
  ['I got a better look at it tonight. I wish I hadn\'t. It drags one leg. Its fingers don\'t stop moving.', 'It looks worse now: starved, bruised grey skin, ribs and spine pushing through, black eyes, the corners of its mouth split. It drags a leg, breathes, and its neck snaps over too far. And every place sounds like itself: carpet in the hotel, stone in the church, leaves in the woods, and things far off you\'d rather not hear.'],
  ['This is still a rough cut. Some of the tape is missing. Tell us where it skips.', 'We\'re in alpha now. Online voices are smaller and sent in pieces, so games shouldn\'t stutter when someone talks, and anyone who joins late still gets everyone\'s voices. A tidier lobby, with Start always in reach.'],
  ['Only one of the lanterns still worked. We took turns carrying it. Then nobody wanted to.', 'Escort (lobby Mode): no flashlights, one lantern. The host can pick the map now (alone too, on the class screen). The end screen plays the voice that fooled you. And online, friends\' voices now reach the mimic: they never got through before.'],
  ['We found the cabin. The phone inside was ringing. There are no phone lines out here.', 'A new place: the woods, outdoors, with a cabin to start in. And online, the Caller: answer the phone if you dare.'],
  ['It isn\'t the same every night. We think it gets bored.', 'It has moods now (you find out which at the end), and most nights one thing is different. Keypads, lifts, flooded rooms, and your fastest time out of each place.'],
  ['We wrote it all down for the new ones. Shorter this time. They never finish the long version.', 'A shorter tutorial that also covers hiding spots, throwing things and the tape recorder (How to play > Tutorial).'],
  ['It covered its eyes and counted to sixty. We heard it get to sixty.', 'Hide and seek (lobby Mode): a minute to hide, then it comes looking. Name tags over friends (Settings, off by default).'],
  ['I saw you in the east hall. You were in the west hall. You were with me.', 'A sixth creature online: the Double. It walks where one of you walked, looking just like them.'],
  ['Count the marks on the wall. Then count them again tomorrow.', 'A new place: a closed asylum. Hide under the cots or in a padded cell.'],
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
